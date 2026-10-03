import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const claseLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2 py-1.5 ${isActive ? 'font-medium text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`

export default function Navbar() {
  const { count } = useCart()
  const { session, isAdmin, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  // Se cierra el menu movil al navegar.
  const [rutaMenu, setRutaMenu] = useState(pathname)
  if (rutaMenu !== pathname) {
    setRutaMenu(pathname)
    setMenuAbierto(false)
  }

  const esCliente = Boolean(session) && !isAdmin

  async function cerrarSesion() {
    // Primero se sale de la pagina protegida; si no, esta redirige a /login.
    navigate('/')
    await signOut()
    toast.info('Cerraste sesión.')
  }

  const links = (
    <>
      <NavLink to="/" end className={claseLink}>
        Tienda
      </NavLink>
      {esCliente && (
        <NavLink to="/mis-pedidos" className={claseLink}>
          Mis pedidos
        </NavLink>
      )}
      {!session && (
        <NavLink to="/login" className={claseLink}>
          Ingresar
        </NavLink>
      )}
      {esCliente && (
        <button onClick={cerrarSesion} className="rounded-md px-2 py-1.5 text-left text-neutral-500 hover:text-neutral-900">
          Cerrar sesión
        </button>
      )}
      <NavLink
        to={isAdmin ? '/admin/dashboard' : '/admin'}
        className={({ isActive }) =>
          `rounded-md px-2 py-1.5 ${isActive ? 'font-medium text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`
        }
      >
        {isAdmin ? 'Panel admin' : 'Admin'}
      </NavLink>
    </>
  )

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Tecnopolis
        </Link>

        <div className="flex items-center gap-2 text-sm sm:gap-4">
          <nav className="hidden items-center gap-2 sm:flex">{links}</nav>

          <Link
            to="/checkout"
            aria-label={count > 0 ? `Carrito, ${count} productos` : 'Carrito vacío'}
            className="relative rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
          >
            Carrito
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>

          <button
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuAbierto}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 text-lg sm:hidden"
          >
            {menuAbierto ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {menuAbierto && (
        <nav className="flex flex-col gap-1 border-t border-neutral-200 px-4 py-3 text-sm sm:hidden">{links}</nav>
      )}
    </header>
  )
}
