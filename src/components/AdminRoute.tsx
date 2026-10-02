import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Protege las rutas /admin/*: exige rol admin y MFA verificado (aal2).
// Es solo UX; la seguridad real la dan las policies RLS (public.es_admin()).
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { session, isAdmin, currentLevel, loading } = useAuth()

  if (loading) return null
  if (!session || !isAdmin || currentLevel !== 'aal2') {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}
