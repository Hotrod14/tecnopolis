import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { count } = useCart()
  const { session, isAdmin, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Tecnopolis
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="text-neutral-600 hover:text-neutral-900">
            Tienda
          </Link>
          <Link
            to="/checkout"
            className="relative rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
          >
            Carrito
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          {session && !isAdmin ? (
            <>
              <Link to="/mis-pedidos" className="text-neutral-600 hover:text-neutral-900">
                Mis pedidos
              </Link>
              <button
                onClick={() => signOut()}
                className="text-neutral-400 hover:text-neutral-700"
              >
                Salir
              </button>
            </>
          ) : (
            !isAdmin && (
              <Link to="/login" className="text-neutral-600 hover:text-neutral-900">
                Ingresar
              </Link>
            )
          )}
          <Link to="/admin" className="text-neutral-400 hover:text-neutral-700">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  )
}
