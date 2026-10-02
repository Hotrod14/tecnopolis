import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatoCLP } from '../lib/format'
import { REGIONES_CHILE } from '../lib/regiones'
import type { OpcionEnvio } from '../types'
import Turnstile, { TURNSTILE_SITE_KEY } from '../components/Turnstile'

// Debe coincidir con MAX_CANTIDAD en supabase/functions/_shared/validacion.ts
const MAX_CANTIDAD_POR_PRODUCTO = 10

interface DireccionForm {
  nombre: string
  telefono: string
  email: string
  region: string
  comuna: string
  calle: string
  numero: string
  depto: string
}

const DIRECCION_VACIA: DireccionForm = {
  nombre: '',
  telefono: '',
  email: '',
  region: '',
  comuna: '',
  calle: '',
  numero: '',
  depto: '',
}

export default function Checkout() {
  const { items, total: subtotal, updateCantidad, removeItem } = useCart()
  const { session } = useAuth()

  const [direccion, setDireccion] = useState<DireccionForm>(DIRECCION_VACIA)
  const [opciones, setOpciones] = useState<OpcionEnvio[] | null>(null)
  const [opcionElegida, setOpcionElegida] = useState<OpcionEnvio | null>(null)
  const [calculandoEnvio, setCalculandoEnvio] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redirect, setRedirect] = useState<{ url: string; token: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)

  useEffect(() => {
    if (session?.user?.email && !direccion.email) {
      setDireccion((d) => ({ ...d, email: session.user.email! }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    if (redirect && formRef.current) {
      formRef.current.submit()
    }
  }, [redirect])

  function actualizarCampo<K extends keyof DireccionForm>(campo: K, valor: DireccionForm[K]) {
    setDireccion((d) => ({ ...d, [campo]: valor }))
    // si cambia region/comuna la cotizacion ya calculada queda obsoleta
    if (campo === 'region' || campo === 'comuna') {
      setOpciones(null)
      setOpcionElegida(null)
    }
  }

  async function calcularEnvio(e: FormEvent) {
    e.preventDefault()
    setErrorEnvio(null)
    setCalculandoEnvio(true)
    setOpciones(null)
    setOpcionElegida(null)

    try {
      const { data, error } = await supabase.functions.invoke('calcular-envio', {
        body: {
          items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
          region: direccion.region,
          comuna: direccion.comuna,
        },
      })

      if (error) throw error
      if (!data?.opciones?.length) throw new Error('No hay opciones de envío para ese destino.')

      setOpciones(data.opciones)
      setOpcionElegida(data.opciones[0])
    } catch (err) {
      setErrorEnvio(await mensajeDeError(err, 'No se pudo cotizar el envío.'))
    } finally {
      setCalculandoEnvio(false)
    }
  }

  async function pagarConWebpay() {
    if (!opcionElegida) return
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('crear-pago-webpay', {
        body: {
          items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
          direccionEnvio: direccion,
          tipoEntrega: opcionElegida.tipoEntrega,
          captchaToken,
        },
      })

      if (error) throw error
      if (!data?.url || !data?.token) throw new Error('Respuesta inválida de Webpay.')

      setRedirect({ url: data.url, token: data.token })
    } catch (err) {
      setError(await mensajeDeError(err, 'No se pudo iniciar el pago.'))
      setLoading(false)
      // Los tokens de Turnstile son de un solo uso: pedimos uno nuevo.
      setCaptchaReset((n) => n + 1)
    }
  }

  if (redirect) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-neutral-600">Redirigiendo a Webpay Plus...</p>
        <form ref={formRef} method="POST" action={redirect.url} className="hidden">
          <input type="hidden" name="token_ws" value={redirect.token} />
        </form>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-neutral-500">Tu carrito está vacío.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium underline">
          Volver a la tienda
        </Link>
      </div>
    )
  }

  const total = subtotal + (opcionElegida?.tarifa ?? 0)
  const direccionCompleta =
    direccion.nombre && direccion.telefono && direccion.email && direccion.calle && direccion.numero

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Resumen de tu compra</h1>

      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {items.map((item) => (
          <div key={item.producto_id} className="flex items-center gap-4 p-4">
            {item.imagen_url && (
              <img src={item.imagen_url} alt={item.nombre} className="h-14 w-14 object-contain" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{item.nombre}</p>
              <p className="text-xs text-neutral-500">{formatoCLP.format(item.precio)} c/u</p>
            </div>
            <input
              type="number"
              min={1}
              max={Math.min(item.stockDisponible, MAX_CANTIDAD_POR_PRODUCTO)}
              value={item.cantidad}
              onChange={(e) => updateCantidad(item.producto_id, Number(e.target.value))}
              className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-center text-sm"
            />
            <span className="w-24 text-right text-sm font-medium">
              {formatoCLP.format(item.precio * item.cantidad)}
            </span>
            <button
              onClick={() => removeItem(item.producto_id)}
              className="text-xs text-red-500 hover:underline"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">Datos de envío</h2>
      <form onSubmit={calcularEnvio} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <input
          required
          placeholder="Nombre completo"
          value={direccion.nombre}
          onChange={(e) => actualizarCampo('nombre', e.target.value)}
          className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          required
          type="tel"
          placeholder="Teléfono"
          value={direccion.telefono}
          onChange={(e) => actualizarCampo('telefono', e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Correo"
          value={direccion.email}
          onChange={(e) => actualizarCampo('email', e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          required
          value={direccion.region}
          onChange={(e) => actualizarCampo('region', e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Región</option>
          {REGIONES_CHILE.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Comuna"
          value={direccion.comuna}
          onChange={(e) => actualizarCampo('comuna', e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Calle"
          value={direccion.calle}
          onChange={(e) => actualizarCampo('calle', e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Número"
          value={direccion.numero}
          onChange={(e) => actualizarCampo('numero', e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Depto / oficina (opcional)"
          value={direccion.depto}
          onChange={(e) => actualizarCampo('depto', e.target.value)}
          className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />

        {errorEnvio && <p className="col-span-2 text-sm text-red-500">{errorEnvio}</p>}

        <button
          type="submit"
          disabled={!direccion.region || !direccion.comuna || calculandoEnvio}
          className="col-span-2 mt-1 rounded-md border border-neutral-900 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
        >
          {calculandoEnvio ? 'Calculando...' : 'Calcular envío'}
        </button>
      </form>

      {opciones && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium">Opciones de envío</p>
          {opciones.map((opcion) => (
            <label
              key={opcion.tipoEntrega}
              className={`flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm ${
                opcionElegida?.tipoEntrega === opcion.tipoEntrega
                  ? 'border-neutral-900 bg-neutral-50'
                  : 'border-neutral-200'
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="opcion-envio"
                  checked={opcionElegida?.tipoEntrega === opcion.tipoEntrega}
                  onChange={() => setOpcionElegida(opcion)}
                />
                <span>
                  <span className="block font-medium">
                    {opcion.tipoEntrega === 'DOMICILIO' ? 'Despacho a domicilio' : 'Retiro en agencia'}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {opcion.proveedor} · {opcion.diasEntrega} días hábiles
                  </span>
                </span>
              </span>
              <span className="font-semibold">{formatoCLP.format(opcion.tarifa)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-1 text-sm text-neutral-600">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatoCLP.format(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Envío</span>
          <span>{opcionElegida ? formatoCLP.format(opcionElegida.tarifa) : '—'}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span>{formatoCLP.format(total)}</span>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />

      <button
        onClick={pagarConWebpay}
        disabled={
          loading || !opcionElegida || !direccionCompleta || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)
        }
        className="mt-6 w-full rounded-md bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {loading
          ? 'Conectando con Webpay...'
          : !opcionElegida
            ? 'Calcula el envío para continuar'
            : 'Pagar con Webpay Plus'}
      </button>
    </div>
  )
}

/** Extrae el mensaje { error } que devuelven las Edge Functions (incluye 429). */
async function mensajeDeError(err: unknown, porDefecto: string): Promise<string> {
  const contexto = (err as { context?: unknown })?.context
  if (contexto instanceof Response) {
    try {
      const body = (await contexto.clone().json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      // respuesta sin JSON
    }
  }
  return err instanceof Error ? err.message : porDefecto
}
