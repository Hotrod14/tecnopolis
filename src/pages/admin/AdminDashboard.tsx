import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AdminInventario from './AdminInventario'
import AdminPedidos from './AdminPedidos'

type Tab = 'inventario' | 'pedidos'

export default function AdminDashboard() {
  const { session, isAdmin, currentLevel, loading, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('inventario')

  if (loading) return null
  if (!session || !isAdmin || currentLevel !== 'aal2') return <Navigate to="/admin" replace />

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Panel de administración</h1>
          <nav className="flex gap-1 rounded-md bg-neutral-100 p-1 text-sm">
            <button
              onClick={() => setTab('inventario')}
              className={`rounded px-3 py-1.5 ${
                tab === 'inventario' ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'
              }`}
            >
              Inventario
            </button>
            <button
              onClick={() => setTab('pedidos')}
              className={`rounded px-3 py-1.5 ${
                tab === 'pedidos' ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'
              }`}
            >
              Pedidos
            </button>
          </nav>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Cerrar sesión
        </button>
      </div>

      {tab === 'inventario' ? <AdminInventario /> : <AdminPedidos />}
    </div>
  )
}
