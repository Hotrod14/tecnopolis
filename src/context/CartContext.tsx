import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { CartItem, Producto } from '../types'

const STORAGE_KEY = 'tecnopolis_cart'

// 'agregado': se sumo al carrito; 'limite': ya estaba en el maximo
// permitido (stock o 10 unidades) y no se agrego nada.
export type ResultadoAgregar = 'agregado' | 'limite'

// Tope de 10 unidades por producto (igual que MAX_CANTIDAD en las Edge Functions).
export const MAX_POR_PRODUCTO = 10

interface CartContextValue {
  items: CartItem[]
  addItem: (producto: Producto, cantidad?: number) => ResultadoAgregar
  removeItem: (productoId: string) => void
  /** Vuelve a poner un item quitado (para el boton "Deshacer"). */
  restoreItem: (item: CartItem) => void
  cantidadEnCarrito: (productoId: string) => number
  updateCantidad: (productoId: string, cantidad: number) => void
  clearCart: () => void
  total: number
  count: number
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  function addItem(producto: Producto, cantidad = 1): ResultadoAgregar {
    const maxStock = Math.min(producto.stock, MAX_POR_PRODUCTO)
    const actual = items.find((i) => i.producto_id === producto.id)?.cantidad ?? 0
    if (actual >= maxStock) return 'limite'

    setItems((prev) => {
      const existing = prev.find((i) => i.producto_id === producto.id)
      if (existing) {
        const nuevaCantidad = Math.min(existing.cantidad + cantidad, maxStock)
        return prev.map((i) =>
          i.producto_id === producto.id ? { ...i, cantidad: nuevaCantidad } : i,
        )
      }
      return [
        ...prev,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          imagen_url: producto.imagen_url,
          cantidad: Math.min(cantidad, maxStock),
          stockDisponible: maxStock,
        },
      ]
    })
    return 'agregado'
  }

  function restoreItem(item: CartItem) {
    setItems((prev) =>
      prev.some((i) => i.producto_id === item.producto_id) ? prev : [...prev, item],
    )
  }

  function cantidadEnCarrito(productoId: string) {
    return items.find((i) => i.producto_id === productoId)?.cantidad ?? 0
  }

  function removeItem(productoId: string) {
    setItems((prev) => prev.filter((i) => i.producto_id !== productoId))
  }

  function updateCantidad(productoId: string, cantidad: number) {
    setItems((prev) =>
      prev
        .map((i) =>
          i.producto_id === productoId
            ? { ...i, cantidad: Math.max(1, Math.min(cantidad, i.stockDisponible)) }
            : i,
        )
        .filter((i) => i.cantidad > 0),
    )
  }

  function clearCart() {
    setItems([])
  }

  const total = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
  const count = items.reduce((acc, i) => acc + i.cantidad, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        restoreItem,
        cantidadEnCarrito,
        updateCantidad,
        clearCart,
        total,
        count,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider')
  return ctx
}
