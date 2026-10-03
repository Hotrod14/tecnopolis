import { useNavigate } from 'react-router-dom'
import type { Producto } from '../types'
import { MAX_POR_PRODUCTO, useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { formatoCLP } from '../lib/format'

const POCAS_UNIDADES = 5

export default function ProductCard({ producto }: { producto: Producto }) {
  const { addItem, cantidadEnCarrito } = useCart()
  const toast = useToast()
  const navigate = useNavigate()
  const sinStock = producto.stock <= 0
  const enCarrito = cantidadEnCarrito(producto.id)
  const enMaximo = !sinStock && enCarrito >= Math.min(producto.stock, MAX_POR_PRODUCTO)

  function agregar() {
    if (addItem(producto) === 'limite') {
      toast.info(
        producto.stock <= MAX_POR_PRODUCTO
          ? `Ya tienes todo el stock disponible de ${producto.nombre} en tu carrito.`
          : `Puedes llevar hasta ${MAX_POR_PRODUCTO} unidades por producto.`,
      )
      return
    }
    toast.exito(`${producto.nombre} se agregó al carrito.`, {
      accion: { label: 'Ver carrito', onClick: () => navigate('/checkout') },
    })
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative flex h-44 w-full items-center justify-center bg-white p-3">
        {producto.imagen_url ? (
          <img
            src={producto.imagen_url}
            alt={producto.nombre}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-neutral-400">Sin imagen</span>
        )}
        {enCarrito > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
            {enCarrito} en tu carrito
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-neutral-100 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-neutral-900">{producto.nombre}</h3>
        <p className="line-clamp-2 text-xs text-neutral-500">{producto.descripcion}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-semibold">{formatoCLP.format(producto.precio)}</span>
          <EtiquetaStock stock={producto.stock} />
        </div>
        <button
          disabled={sinStock}
          onClick={agregar}
          className="mt-2 w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {sinStock ? 'Agotado' : enMaximo ? 'Máximo en tu carrito' : 'Agregar al carrito'}
        </button>
      </div>
    </div>
  )
}

function EtiquetaStock({ stock }: { stock: number }) {
  if (stock <= 0) return <span className="text-xs font-medium text-red-500">Sin stock</span>
  if (stock <= POCAS_UNIDADES) {
    return (
      <span className="text-xs font-medium text-amber-600">
        {stock === 1 ? '¡Última unidad!' : `¡Últimas ${stock} unidades!`}
      </span>
    )
  }
  return <span className="text-xs text-neutral-500">{stock} disponibles</span>
}
