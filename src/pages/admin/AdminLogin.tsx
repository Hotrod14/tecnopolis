import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Turnstile, { TURNSTILE_SITE_KEY } from '../../components/Turnstile'

const SIN_PERMISOS = 'Esta cuenta no tiene permisos de administrador.'

export default function AdminLogin() {
  const { session, isAdmin, currentLevel, loading, signIn, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password, captchaToken)
    setCaptchaReset((n) => n + 1)
    if (error) {
      setSubmitting(false)
      setError(error)
      return
    }
    // El rol se lee de app_metadata (no editable por el usuario).
    const { data } = await supabase.auth.getUser()
    if (data.user?.app_metadata?.role !== 'admin') {
      await signOut()
      setError(SIN_PERMISOS)
    }
    setSubmitting(false)
  }

  if (loading) return null

  // Solo con MFA verificado en esta sesion se entra al panel.
  if (session && isAdmin && currentLevel === 'aal2') {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (session && isAdmin) {
    return <SegundoFactor onCancelar={signOut} />
  }

  if (session && !isAdmin) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20 text-center">
        <p className="text-sm text-red-500">{SIN_PERMISOS}</p>
        <button
          onClick={() => signOut()}
          className="mt-4 text-sm font-medium underline"
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="mb-6 text-xl font-bold">Acceso administrador</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
        <button
          type="submit"
          disabled={submitting || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
          className="rounded-md bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:bg-neutral-400"
        >
          {submitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}

type EstadoMfa =
  | { paso: 'cargando' }
  | { paso: 'enrolar'; factorId: string; qr: string; secret: string }
  | { paso: 'verificar'; factorId: string }

// Paso de MFA (TOTP) despues del login con contraseña. Si el admin no
// tiene un factor verificado, lo enrola; si ya tiene uno, pide el codigo.
// Al verificar, Supabase emite una sesion aal2 y AuthContext la recoge.
function SegundoFactor({ onCancelar }: { onCancelar: () => Promise<void> }) {
  const [estado, setEstado] = useState<EstadoMfa>({ paso: 'cargando' })
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)
  // StrictMode ejecuta los efectos dos veces en desarrollo: evita enrolar
  // dos factores en paralelo.
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true

    async function preparar() {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) {
        setError(error.message)
        return
      }

      // data.totp solo trae factores TOTP verificados.
      const verificado = data.totp[0]
      if (verificado) {
        setEstado({ paso: 'verificar', factorId: verificado.id })
        return
      }

      // Factores TOTP sin verificar de un intento anterior: se eliminan
      // antes de enrolar de nuevo.
      for (const f of data.all) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
          if (error) {
            setError(error.message)
            return
          }
        }
      }

      const { data: enrolado, error: errorEnroll } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      })
      if (errorEnroll) {
        setError(errorEnroll.message)
        return
      }
      setEstado({
        paso: 'enrolar',
        factorId: enrolado.id,
        qr: enrolado.totp.qr_code,
        secret: enrolado.totp.secret,
      })
    }

    preparar()
  }, [])

  async function handleVerificar(e: FormEvent) {
    e.preventDefault()
    if (estado.paso === 'cargando') return
    setError(null)
    setVerificando(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: estado.factorId,
      code: codigo.trim(),
    })
    setVerificando(false)
    if (error) {
      setError(error.message)
      setCodigo('')
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="mb-6 text-xl font-bold">Verificación en dos pasos</h1>

      {estado.paso === 'cargando' && !error && (
        <p className="text-sm text-neutral-500">Cargando...</p>
      )}

      {estado.paso === 'enrolar' && (
        <div className="mb-4 flex flex-col gap-3 text-sm">
          <p>
            Escanea este código QR con tu app de autenticación (Google
            Authenticator, 1Password, Authy, etc.):
          </p>
          <img
            src={estado.qr}
            alt="Código QR para configurar TOTP"
            className="mx-auto h-48 w-48 bg-white"
          />
          <p>O ingresa esta clave manualmente:</p>
          <code className="break-all rounded bg-neutral-100 px-2 py-1 text-xs">
            {estado.secret}
          </code>
        </div>
      )}

      {estado.paso !== 'cargando' && (
        <form onSubmit={handleVerificar} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="Código de 6 dígitos"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            className="rounded-md border border-neutral-300 px-3 py-2 text-center text-sm tracking-widest"
          />
          <button
            type="submit"
            disabled={verificando || codigo.length !== 6}
            className="rounded-md bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:bg-neutral-400"
          >
            {verificando ? 'Verificando...' : 'Verificar'}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        onClick={() => onCancelar()}
        className="mt-4 text-sm font-medium underline"
      >
        Cancelar y cerrar sesión
      </button>
    </div>
  )
}
