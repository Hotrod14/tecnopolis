import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Producto } from '../../types'
import NuevoProductoModal from '../../components/NuevoProductoModal'

export default function AdminInventario() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [mostrarModal, setMostrarModal] = useState(false)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
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

  async function actualizarCampo(id: string, campo: 'stock' | 'precio', valor: number) {
    setGuardandoId(id)
    await supabase
      .from('productos')
      .update({ [campo]: valor })
      .eq('id', id)
    setGuardandoId(null)
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
      await supabase.from('productos').update({ imagen_url: data.publicUrl }).eq('id', id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo subir la imagen.')
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

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Precio (CLP)</th>
              <th className="px-4 py-3">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {productos.map((producto) => (
              <tr key={producto.id}>
                <td className="flex items-center gap-3 px-4 py-3">
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
                  <span className="max-w-xs truncate">{producto.nombre}</span>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={producto.precio}
                    disabled={guardandoId === producto.id}
                    onBlur={(e) =>
                      actualizarCampo(producto.id, 'precio', Number(e.target.value))
                    }
                    className="w-28 rounded-md border border-neutral-300 px-2 py-1"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={producto.stock}
                    disabled={guardandoId === producto.id}
                    onBlur={(e) =>
                      actualizarCampo(producto.id, 'stock', Number(e.target.value))
                    }
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1"
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
          onCreated={cargarProductos}
        />
      )}
    </div>
  )
}
