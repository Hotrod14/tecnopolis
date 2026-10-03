import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Producto } from '../../types'
import NuevoProductoModal from '../../components/NuevoProductoModal'
import { useToast } from '../../context/ToastContext'
import { formatoCLP } from '../../lib/format'

export default function AdminInventario() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [mostrarModal, setMostrarModal] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  const toast = useToast()
  const [subiendoImagenId, setSubiendoImagenId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const productoImagenIdRef = useRef<string | null>(null)

  async function cargarProductos() {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setProductos(data as Producto[])
  }

  useEffect(() => {
    cargarProductos()

    const canal = supabase
      .channel('productos-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        (payload) => {
          setProductos((prev) => {
            if (payload.eventType === 'INSERT') {
              const nuevo = payload.new as Producto
              if (prev.some((p) => p.id === nuevo.id)) return prev
              return [nuevo, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              const actualizado = payload.new as Producto
              return prev.map((p) => (p.id === actualizado.id ? actualizado : p))
            }
            if (payload.eventType === 'DELETE') {
              const eliminado = payload.old as Producto
              return prev.filter((p) => p.id !== eliminado.id)
            }
            return prev
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  // Devuelve true si se guardo. Con RLS, un update sin permiso no da
  // error: simplemente no afecta filas, por eso se pide la fila de vuelta.
  async function actualizarCampo(producto: Producto, campo: 'stock' | 'precio', valor: number) {
    setGuardando(`${producto.id}:${campo}`)
    const { data, error } = await supabase
      .from('productos')
      .update({ [campo]: valor })
      .eq('id', producto.id)
      .select('id')
    setGuardando(null)

    if (error || !data?.length) {
      toast.error(
        error?.message ??
          'No se guardó el cambio. Tu sesión de administrador puede haber expirado: vuelve a ingresar.',
      )
      return false
    }
    setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, [campo]: valor } : p)))
    toast.exito(
      campo === 'precio'
        ? `Precio de ${producto.nombre} actualizado a ${formatoCLP.format(valor)}.`
        : `Stock de ${producto.nombre} actualizado a ${valor}.`,
    )
    return true
  }

  function abrirSelectorImagen(id: string) {
    productoImagenIdRef.current = id
    fileInputRef.current?.click()
  }

  async function handleArchivoSeleccionado(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const id = productoImagenIdRef.current
    e.target.value = ''
    if (!file || !id) return

    setSubiendoImagenId(id)
    try {
      const path = `${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('productos')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('productos').getPublicUrl(path)
      const { data: filas, error } = await supabase
        .from('productos')
        .update({ imagen_url: data.publicUrl })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!filas?.length) throw new Error('No se pudo actualizar la imagen del producto.')
      toast.exito('Imagen actualizada.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen.')
    } finally {
      setSubiendoImagenId(null)
      productoImagenIdRef.current = null
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setMostrarModal(true)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          + Nuevo producto
        </button>
      </div>

      <p className="mb-2 text-xs text-neutral-500">
        Edita precio o stock y presiona Enter (o sal del campo) para guardar. Toca la imagen para cambiarla.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-2 py-3 sm:px-4">Producto</th>
              <th className="px-2 py-3 sm:px-4">Precio</th>
              <th className="px-2 py-3 sm:px-4">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {productos.map((producto) => (
              <tr key={producto.id}>
                <td className="flex items-center gap-2 px-2 py-3 sm:gap-3 sm:px-4">
                  <button
                    type="button"
                    onClick={() => abrirSelectorImagen(producto.id)}
                    title="Cambiar imagen"
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-neutral-200 bg-neutral-50 hover:border-neutral-400"
                  >
                    {producto.imagen_url ? (
                      <img
                        src={producto.imagen_url}
                        alt={producto.nombre}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[9px] text-neutral-400">
                        Sin img
                      </span>
                    )}
                    {subiendoImagenId === producto.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-[9px] text-neutral-600">
                        ...
                      </span>
                    )}
                  </button>
                  <span className="line-clamp-2 max-w-[7rem] text-xs sm:max-w-xs sm:text-sm">{producto.nombre}</span>
                </td>
                <td className="px-2 py-3 sm:px-4">
                  <CampoNumero
                    key={`precio-${producto.precio}`}
                    valor={producto.precio}
                    etiqueta={`Precio de ${producto.nombre}`}
                    guardando={guardando === `${producto.id}:precio`}
                    onGuardar={(v) => actualizarCampo(producto, 'precio', v)}
                    className="w-24 sm:w-28"
                  />
                </td>
                <td className="px-2 py-3 sm:px-4">
                  <CampoNumero
                    key={`stock-${producto.stock}`}
                    valor={producto.stock}
                    etiqueta={`Stock de ${producto.nombre}`}
                    guardando={guardando === `${producto.id}:stock`}
                    onGuardar={(v) => actualizarCampo(producto, 'stock', v)}
                    className={`w-16 sm:w-24 ${producto.stock === 0 ? 'border-red-300 bg-red-50' : ''}`}
                  />
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-400">
                  No hay productos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleArchivoSeleccionado}
        className="hidden"
      />

      {mostrarModal && (
        <NuevoProductoModal
          onClose={() => setMostrarModal(false)}
          onCreated={(nombre) => {
            cargarProductos()
            toast.exito(`Producto "${nombre}" creado.`)
          }}
        />
      )}
    </div>
  )
}

// Input numerico que guarda al presionar Enter o al salir del campo, solo
// si el valor cambio. Escape descarta la edicion. Si el guardado falla
// vuelve al valor anterior.
function CampoNumero({
  valor,
  etiqueta,
  guardando,
  onGuardar,
  className = '',
}: {
  valor: number
  etiqueta: string
  guardando: boolean
  onGuardar: (valor: number) => Promise<boolean>
  className?: string
}) {
  const [texto, setTexto] = useState(String(valor))

  async function guardar() {
    const nuevo = Number(texto)
    if (texto.trim() === '' || !Number.isInteger(nuevo) || nuevo < 0) {
      setTexto(String(valor))
      return
    }
    if (nuevo === valor) return
    const ok = await onGuardar(nuevo)
    if (!ok) setTexto(String(valor))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      const input = e.currentTarget
      setTexto(String(valor))
      // Se espera al re-render para no guardar el valor descartado en el blur.
      requestAnimationFrame(() => input.blur())
    }
  }

  const cambiado = texto !== String(valor)

  return (
    <input
      type="number"
      min={0}
      step={1}
      aria-label={etiqueta}
      value={texto}
      disabled={guardando}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={onKeyDown}
      className={`rounded-md border px-2 py-1 disabled:opacity-50 ${
        cambiado ? 'border-amber-400' : 'border-neutral-300'
      } ${className}`}
    />
  )
}
