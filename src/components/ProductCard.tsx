import type { Producto } from '../types'
import { useCart } from '../context/CartContext'
import { formatoCLP } from '../lib/format'

export default function ProductCard({ producto }: { producto: Producto }) {
  const { addItem } = useCart()
  const sinStock = producto.stock <= 0

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex h-44 w-full items-center justify-center bg-neutral-100">
        {producto.imagen_url ? (
          <img
            src={producto.imagen_url}
            alt={producto.nombre}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-neutral-400">Sin imagen</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-neutral-900">
          {producto.nombre}
        </h3>
        <p className="line-clamp-2 text-xs text-neutral-500">{producto.descripcion}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-semibold">{formatoCLP.format(producto.precio)}</span>
          <span
            className={`text-xs ${sinStock ? 'text-red-500' : 'text-neutral-500'}`}
          >
            {sinStock ? 'Sin stock' : `Stock: ${producto.stock}`}
          </span>
        </div>
        <button
          disabled={sinStock}
          onClick={() => addItem(producto)}
          className="mt-2 w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {sinStock ? 'Agotado' : 'Agregar al carrito'}
        </button>
      </div>
    </div>
  )
}
