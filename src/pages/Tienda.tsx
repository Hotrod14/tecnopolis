import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Producto } from '../types'
import ProductCard from '../components/ProductCard'

// Paginacion: cada visita pide solo una pagina del catalogo.
const TAMANO_PAGINA = 24

const COLUMNAS =
  'id, nombre, descripcion, precio, stock, imagen_url, peso_kg, alto_cm, ancho_cm, largo_cm, created_at'

export default function Tienda() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [hayMas, setHayMas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargarPagina = useCallback(async (desde: number) => {
    const { data, error } = await supabase
      .from('productos')
      .select(COLUMNAS)
      .order('created_at', { ascending: false })
      .range(desde, desde + TAMANO_PAGINA - 1)

    if (error) {
      setError('No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.')
      return
    }
    setError(null)
    const pagina = (data ?? []) as Producto[]
    setProductos((prev) => {
      const ids = new Set(prev.map((p) => p.id))
      return [...prev, ...pagina.filter((p) => !ids.has(p.id))]
    })
    setHayMas(pagina.length === TAMANO_PAGINA)
  }, [])

  useEffect(() => {
    let activo = true

    cargarPagina(0).finally(() => {
      if (activo) setLoading(false)
    })

    // Antes cada cambio en `productos` hacia que TODOS los clientes
    // conectados recargaran el catalogo completo (N clientes x 1 compra
    // = N consultas). Ahora se aplica el cambio que llega por realtime
    // directamente sobre el estado local, sin volver a consultar.
    const canal = supabase
      .channel('productos-tienda')
      .on<Producto>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        (payload) => {
          if (!activo) return
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as Partial<Producto>).id
            setProductos((prev) => prev.filter((p) => p.id !== id))
          } else if (payload.eventType === 'UPDATE') {
            const nuevo = payload.new
            setProductos((prev) => prev.map((p) => (p.id === nuevo.id ? { ...p, ...nuevo } : p)))
          } else if (payload.eventType === 'INSERT') {
            const nuevo = payload.new
            setProductos((prev) => (prev.some((p) => p.id === nuevo.id) ? prev : [nuevo, ...prev]))
          }
        },
      )
      .subscribe()

    return () => {
      activo = false
      supabase.removeChannel(canal)
    }
  }, [cargarPagina])

  async function reintentar() {
    setLoading(true)
    await cargarPagina(0)
    setLoading(false)
  }

  async function verMas() {
    setCargandoMas(true)
    await cargarPagina(productos.length)
    setCargandoMas(false)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Catálogo</h1>

      {error && (
        <div className="mb-6 flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            onClick={reintentar}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && productos.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="font-medium">Aún no hay productos disponibles.</p>
          <p className="mt-1 text-sm text-neutral-500">Vuelve pronto, estamos preparando el catálogo.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }, (_, i) => <TarjetaCargando key={i} />)
          : productos.map((producto) => <ProductCard key={producto.id} producto={producto} />)}
      </div>

      {!loading && hayMas && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={verMas}
            disabled={cargandoMas}
            className="rounded-md border border-neutral-900 px-6 py-2 text-sm font-medium hover:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-400"
          >
            {cargandoMas ? 'Cargando...' : 'Ver más productos'}
          </button>
        </div>
      )}
    </div>
  )
}

function TarjetaCargando() {
  return (
    <div aria-hidden="true" className="animate-pulse overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="h-44 bg-neutral-100" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-4 w-3/4 rounded bg-neutral-200" />
        <div className="h-3 w-full rounded bg-neutral-100" />
        <div className="h-3 w-2/3 rounded bg-neutral-100" />
        <div className="mt-4 h-9 rounded bg-neutral-200" />
      </div>
    </div>
  )
}
