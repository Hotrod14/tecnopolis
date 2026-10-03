import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MAX_POR_PRODUCTO, useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { formatoCLP } from '../lib/format'
import { REGIONES_CHILE } from '../lib/regiones'
import { COMUNAS_POR_REGION } from '../lib/comunas'
import {
  DIRECCION_VACIA,
  TODAS_LAS_COMUNAS,
  buscarComuna,
  cargarDireccionesLocales,
  claveDireccion,
  guardarDireccionLocal,
  olvidarDireccionLocal,
  resumenDireccion,
  unirDirecciones,
  type DireccionForm,
} from '../lib/direcciones'
import type { DireccionEnvio, OpcionEnvio } from '../types'
import Turnstile, { TURNSTILE_SITE_KEY } from '../components/Turnstile'

export default function Checkout() {
  const { items, total: subtotal, updateCantidad, removeItem, restoreItem } = useCart()
  const { session } = useAuth()
  const toast = useToast()

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

  // Precarga: direcciones usadas antes en este navegador y, con sesion
  // iniciada, las de pedidos anteriores (RLS solo entrega las propias).
  const [direccionesLocales, setDireccionesLocales] = useState<DireccionForm[]>(cargarDireccionesLocales)
  const [direccionesPedidos, setDireccionesPedidos] = useState<DireccionForm[]>([])
  const [recordarDireccion, setRecordarDireccion] = useState(true)
  const usuarioId = session?.user?.id

  useEffect(() => {
    if (!usuarioId) return
    let activo = true
    supabase
      .from('ordenes')
      .select('direccion_envio')
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!activo || !data) return
        const lista = data
          .map((o) => o.direccion_envio as Partial<DireccionEnvio> | null)
          .filter((d): d is DireccionEnvio => Boolean(d?.calle && d?.numero && d?.comuna && d?.region))
          .map((d) => ({ ...DIRECCION_VACIA, ...d, depto: d.depto ?? '' }))
        setDireccionesPedidos(lista)
      })
    return () => {
      activo = false
    }
  }, [usuarioId])

  const direccionesGuardadas = unirDirecciones(direccionesLocales, usuarioId ? direccionesPedidos : [])
  const clavesLocales = new Set(direccionesLocales.map(claveDireccion))
  const claveActual = claveDireccion(direccion)

  useEffect(() => {
    if (session?.user?.email && !direccion.email) {
      setDireccion((d) => ({ ...d, email: session.user.email! }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // El costo de envio depende del peso del carrito: si cambian los
  // productos o cantidades, la cotizacion anterior deja de ser valida
  // (el servidor recalcula al pagar y el total mostrado no coincidiria).
  const firmaCarrito = items.map((i) => `${i.producto_id}:${i.cantidad}`).join('|')
  const [firmaCotizada, setFirmaCotizada] = useState(firmaCarrito)
  if (firmaCotizada !== firmaCarrito) {
    setFirmaCotizada(firmaCarrito)
    if (opciones) {
      setOpciones(null)
      setOpcionElegida(null)
    }
  }

  useEffect(() => {
    if (redirect && formRef.current) {
      formRef.current.submit()
    }
  }, [redirect])

  function invalidarCotizacion() {
    setOpciones(null)
    setOpcionElegida(null)
  }

  function actualizarCampo<K extends keyof DireccionForm>(campo: K, valor: DireccionForm[K]) {
    setDireccion((d) => ({ ...d, [campo]: valor }))
    // si cambia region/comuna la cotizacion ya calculada queda obsoleta
    if (campo === 'region' || campo === 'comuna') invalidarCotizacion()
  }

  function cambiarRegion(region: string) {
    setDireccion((d) => {
      // Si la comuna escrita no pertenece a la nueva region, se limpia.
      const encontrada = buscarComuna(d.comuna)
      return { ...d, region, comuna: encontrada?.region === region ? d.comuna : '' }
    })
    invalidarCotizacion()
  }

  function cambiarComuna(texto: string) {
    const encontrada = buscarComuna(texto)
    setDireccion((d) => ({
      ...d,
      comuna: texto,
      // Al escribir la comuna primero, la region se completa sola.
      region: encontrada && !d.region ? encontrada.region : d.region,
    }))
    setErrorEnvio(null)
    invalidarCotizacion()
  }

  /** Al salir del campo, corrige mayusculas y tildes ("vina del mar" -> "Viña del Mar"). */
  function normalizarComuna() {
    const encontrada = buscarComuna(direccion.comuna)
    if (encontrada && encontrada.comuna !== direccion.comuna) {
      setDireccion((d) => ({ ...d, comuna: encontrada.comuna }))
    }
  }

  function usarDireccion(d: DireccionForm) {
    setDireccion({ ...d, email: d.email || session?.user?.email || '' })
    setErrorEnvio(null)
    invalidarCotizacion()
  }

  function olvidarDireccion(d: DireccionForm) {
    olvidarDireccionLocal(d)
    setDireccionesLocales(cargarDireccionesLocales())
    toast.info('Dirección eliminada de este dispositivo.')
  }

  async function calcularEnvio(e: FormEvent) {
    e.preventDefault()
    setErrorEnvio(null)

    // La comuna se usa como destino del courier: debe ser una comuna real
    // de la region elegida.
    const comuna = buscarComuna(direccion.comuna)
    if (!comuna || comuna.region !== direccion.region) {
      setErrorEnvio(`Elige una comuna de la lista para la región ${direccion.region}.`)
      return
    }
    if (comuna.comuna !== direccion.comuna) setDireccion((d) => ({ ...d, comuna: comuna.comuna }))

    setCalculandoEnvio(true)
    setOpciones(null)
    setOpcionElegida(null)

    try {
      const { data, error } = await supabase.functions.invoke('calcular-envio', {
        body: {
          items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
          region: direccion.region,
          comuna: comuna.comuna,
        },
      })

      if (error) throw error
      if (!data?.opciones?.length) throw new Error('No hay opciones de envío para ese destino.')

      setOpciones(data.opciones)
      setOpcionElegida(data.opciones[0])
      setFirmaCotizada(firmaCarrito)
    } catch (err) {
      setErrorEnvio(await mensajeDeError(err, 'No se pudo cotizar el envío.'))
    } finally {
      setCalculandoEnvio(false)
    }
  }

  function quitar(productoId: string) {
    const item = items.find((i) => i.producto_id === productoId)
    if (!item) return
    removeItem(productoId)
    toast.info(`Quitaste ${item.nombre} del carrito.`, {
      accion: { label: 'Deshacer', onClick: () => restoreItem(item) },
    })
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

      if (recordarDireccion) guardarDireccionLocal(direccion)

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
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        <p className="text-neutral-600">Redirigiendo a Webpay Plus...</p>
        <p className="mt-1 text-xs text-neutral-400">No cierres ni recargues esta página.</p>
        <form ref={formRef} method="POST" action={redirect.url} className="hidden">
          <input type="hidden" name="token_ws" value={redirect.token} />
        </form>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-medium">Tu carrito está vacío</p>
        <p className="mt-1 text-sm text-neutral-500">Agrega productos desde el catálogo para comprar.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Ir a la tienda
        </Link>
      </div>
    )
  }

  const total = subtotal + (opcionElegida?.tarifa ?? 0)
  const direccionCompleta =
    direccion.nombre && direccion.telefono && direccion.email && direccion.calle && direccion.numero
  const faltaCaptcha = Boolean(TURNSTILE_SITE_KEY) && !captchaToken
  const motivoBloqueo = !opcionElegida
    ? 'Completa tus datos y calcula el envío para continuar.'
    : !direccionCompleta
      ? 'Completa nombre, teléfono, correo, calle y número para pagar.'
      : faltaCaptcha
        ? 'Esperando la verificación de seguridad...'
        : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Resumen de tu compra</h1>

      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {items.map((item) => {
          const maximo = Math.min(item.stockDisponible, MAX_POR_PRODUCTO)
          return (
            <div key={item.producto_id} className="flex gap-3 p-4">
              {item.imagen_url && (
                <img src={item.imagen_url} alt="" className="h-16 w-16 shrink-0 object-contain" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.nombre}</p>
                  <p className="text-xs text-neutral-500">{formatoCLP.format(item.precio)} c/u</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center rounded-md border border-neutral-300">
                    <button
                      type="button"
                      onClick={() => updateCantidad(item.producto_id, item.cantidad - 1)}
                      disabled={item.cantidad <= 1}
                      aria-label={`Quitar una unidad de ${item.nombre}`}
                      className="h-8 w-8 text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-300"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm" aria-live="polite">
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCantidad(item.producto_id, item.cantidad + 1)}
                      disabled={item.cantidad >= maximo}
                      aria-label={`Agregar una unidad de ${item.nombre}`}
                      title={item.cantidad >= maximo ? 'Alcanzaste el máximo disponible' : undefined}
                      className="h-8 w-8 text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-300"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-24 text-right text-sm font-medium">
                    {formatoCLP.format(item.precio * item.cantidad)}
                  </span>
                  <button
                    onClick={() => quitar(item.producto_id)}
                    aria-label={`Quitar ${item.nombre} del carrito`}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">Datos de envío</h2>

      {direccionesGuardadas.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-neutral-700">Usar una dirección guardada</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {direccionesGuardadas.map((d) => {
              const clave = claveDireccion(d)
              const elegida = clave === claveActual
              return (
                <div
                  key={clave}
                  className={`flex items-start gap-2 rounded-lg border bg-white p-3 text-sm ${
                    elegida ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => usarDireccion(d)}
                    aria-pressed={elegida}
                    className="flex-1 text-left"
                  >
                    <span className="block font-medium">{d.nombre}</span>
                    <span className="block text-neutral-600">{resumenDireccion(d)}</span>
                    <span className="block text-xs text-neutral-400">{d.region}</span>
                    <span className="mt-1 block text-xs font-medium text-neutral-900 underline">
                      {elegida ? 'Dirección seleccionada' : 'Usar esta dirección'}
                    </span>
                  </button>
                  {clavesLocales.has(clave) && (
                    <button
                      type="button"
                      onClick={() => olvidarDireccion(d)}
                      aria-label={`Olvidar la dirección ${resumenDireccion(d)}`}
                      title="Olvidar en este dispositivo"
                      className="rounded px-1 text-neutral-400 hover:text-neutral-700"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <form
        onSubmit={calcularEnvio}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2"
      >
        <Campo etiqueta="Nombre completo" className="sm:col-span-2">
          <input
            required
            autoComplete="name"
            value={direccion.nombre}
            onChange={(e) => actualizarCampo('nombre', e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>
        <Campo etiqueta="Teléfono">
          <input
            required
            type="tel"
            autoComplete="tel"
            placeholder="+56 9 1234 5678"
            value={direccion.telefono}
            onChange={(e) => actualizarCampo('telefono', e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>
        <Campo etiqueta="Correo">
          <input
            required
            type="email"
            autoComplete="email"
            value={direccion.email}
            onChange={(e) => actualizarCampo('email', e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>
        <Campo etiqueta="Región">
          <select
            required
            value={direccion.region}
            onChange={(e) => cambiarRegion(e.target.value)}
            className={CLASE_INPUT}
          >
            <option value="">Selecciona tu región</option>
            {REGIONES_CHILE.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Comuna">
          <input
            required
            list="lista-comunas"
            autoComplete="address-level2"
            placeholder={direccion.region ? 'Escribe para buscar' : 'Escribe tu comuna'}
            value={direccion.comuna}
            onChange={(e) => cambiarComuna(e.target.value)}
            onBlur={normalizarComuna}
            className={CLASE_INPUT}
          />
          <datalist id="lista-comunas">
            {direccion.region
              ? (COMUNAS_POR_REGION[direccion.region] ?? []).map((c) => <option key={c} value={c} />)
              : TODAS_LAS_COMUNAS.map(({ comuna, region }) => (
                  <option key={comuna} value={comuna} label={region} />
                ))}
          </datalist>
        </Campo>
        <Campo etiqueta="Calle">
          <input
            required
            autoComplete="address-line1"
            value={direccion.calle}
            onChange={(e) => actualizarCampo('calle', e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>
        <Campo etiqueta="Número">
          <input
            required
            inputMode="numeric"
            value={direccion.numero}
            onChange={(e) => actualizarCampo('numero', e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>
        <Campo etiqueta="Depto / oficina (opcional)" className="sm:col-span-2">
          <input
            autoComplete="address-line2"
            value={direccion.depto}
            onChange={(e) => actualizarCampo('depto', e.target.value)}
            className={CLASE_INPUT}
          />
        </Campo>

        {errorEnvio && (
          <p role="alert" className="text-sm text-red-500 sm:col-span-2">
            {errorEnvio}
          </p>
        )}

        <button
          type="submit"
          disabled={!direccion.region || !direccion.comuna || calculandoEnvio}
          className="mt-1 rounded-md border border-neutral-900 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 sm:col-span-2"
        >
          {calculandoEnvio ? 'Calculando...' : opciones ? 'Recalcular envío' : 'Calcular envío'}
        </button>
        {(!direccion.region || !direccion.comuna) && (
          <p className="-mt-1 text-xs text-neutral-500 sm:col-span-2">
            Elige tu región y busca tu comuna (o escribe la comuna y la región se completa sola).
          </p>
        )}
        <label className="flex items-center gap-2 text-xs text-neutral-600 sm:col-span-2">
          <input
            type="checkbox"
            checked={recordarDireccion}
            onChange={(e) => setRecordarDireccion(e.target.checked)}
          />
          Recordar esta dirección en este dispositivo para mis próximas compras
        </label>
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

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {error}
        </p>
      )}

      <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />

      <button
        onClick={pagarConWebpay}
        disabled={loading || Boolean(motivoBloqueo)}
        className="mt-6 w-full rounded-md bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {loading ? 'Conectando con Webpay...' : `Pagar ${formatoCLP.format(total)} con Webpay Plus`}
      </button>
      {motivoBloqueo && !loading && (
        <p className="mt-2 text-center text-xs text-neutral-500">{motivoBloqueo}</p>
      )}
    </div>
  )
}

const CLASE_INPUT =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900'

function Campo({
  etiqueta,
  className = '',
  children,
}: {
  etiqueta: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-neutral-600">{etiqueta}</span>
      {children}
    </label>
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
