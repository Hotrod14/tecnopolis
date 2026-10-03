import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import AdminInventario from './AdminInventario'
import AdminPedidos from './AdminPedidos'

type Tab = 'inventario' | 'pedidos'

export default function AdminDashboard() {
  const { session, isAdmin, currentLevel, loading, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('inventario')
  const toast = useToast()
  const navigate = useNavigate()

  if (loading) return null
  if (!session || !isAdmin || currentLevel !== 'aal2') return <Navigate to="/admin" replace />

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold">Panel de administración</h1>
          <nav role="tablist" className="flex gap-1 rounded-md bg-neutral-100 p-1 text-sm">
            <button
              role="tab"
              aria-selected={tab === 'inventario'}
              onClick={() => setTab('inventario')}
              className={`rounded px-3 py-1.5 ${
                tab === 'inventario' ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'
              }`}
            >
              Inventario
            </button>
            <button
              role="tab"
              aria-selected={tab === 'pedidos'}
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
          onClick={async () => {
            navigate('/')
            await signOut()
            toast.info('Cerraste sesión.')
          }}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Cerrar sesión
        </button>
      </div>

      {tab === 'inventario' ? <AdminInventario /> : <AdminPedidos />}
    </div>
  )
}
