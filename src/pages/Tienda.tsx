import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Producto } from '../types'
import ProductCard from '../components/ProductCard'

export default function Tienda() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    async function cargar() {
      setLoading(true)
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('created_at', { ascending: false })

      if (!activo) return
      if (error) setError(error.message)
      else setProductos(data as Producto[])
      setLoading(false)
    }

    cargar()

    const canal = supabase
      .channel('productos-tienda')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        () => cargar(),
      )
      .subscribe()

    return () => {
      activo = false
      supabase.removeChannel(canal)
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Catálogo</h1>

      {loading && <p className="text-neutral-500">Cargando productos...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!loading && !error && productos.length === 0 && (
        <p className="text-neutral-500">
          Todavía no hay productos. Ejecuta el script de seed para poblar el catálogo.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {productos.map((producto) => (
          <ProductCard key={producto.id} producto={producto} />
        ))}
      </div>
    </div>
  )
}
