import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { AuthenticatorAssuranceLevels, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  isAdmin: boolean
  // Nivel de autenticacion de la sesion actual ('aal1' = solo contraseña,
  // 'aal2' = MFA verificado) y el maximo alcanzable con los factores
  // que el usuario tiene registrados.
  currentLevel: AuthenticatorAssuranceLevels | null
  nextLevel: AuthenticatorAssuranceLevels | null
  signIn: (email: string, password: string, captchaToken?: string | null) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, captchaToken?: string | null) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [aal, setAal] = useState<{
    token: string | null
    currentLevel: AuthenticatorAssuranceLevels | null
    nextLevel: AuthenticatorAssuranceLevels | null
  }>({ token: null, currentLevel: null, nextLevel: null })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })

    // No se llama a supabase.auth.* dentro del callback (puede bloquearse
    // con el lock interno de auth-js); el AAL se refresca en el efecto de
    // abajo cada vez que cambia el token de la sesion.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const accessToken = session?.access_token ?? null

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (cancelled) return
      setAal({
        token: accessToken,
        currentLevel: error ? null : data.currentLevel,
        nextLevel: error ? null : data.nextLevel,
      })
    })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Mientras no se haya calculado el AAL del token actual, se considera
  // "cargando" para no redirigir con un nivel desactualizado.
  const aalVigente = accessToken !== null && aal.token === accessToken
  const loading = sessionLoading || (accessToken !== null && !aalVigente)
  const currentLevel = aalVigente ? aal.currentLevel : null
  const nextLevel = aalVigente ? aal.nextLevel : null

  // captchaToken: requerido por Supabase Auth cuando se activa la
  // proteccion con captcha (Authentication > Attack Protection).
  async function signIn(email: string, password: string, captchaToken?: string | null) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signUp(email: string, password: string, captchaToken?: string | null) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  // El rol vive en app_metadata (solo editable con service_role / SQL).
  // Esto es solo para la UX: la seguridad real la dan las policies RLS
  // (public.es_admin(), que ademas exige aal2).
  const isAdmin = session?.user?.app_metadata?.role === 'admin'

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isAdmin,
        currentLevel,
        nextLevel,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
