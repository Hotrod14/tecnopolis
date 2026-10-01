import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function CuentaLogin() {
  const { session, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (session) return <Navigate to="/mis-pedidos" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setSubmitting(true)

    if (modo === 'login') {
      const { error } = await signIn(email, password)
      setSubmitting(false)
      if (error) return setError(error)
      navigate('/mis-pedidos')
      return
    }

    const { error } = await signUp(email, password)
    setSubmitting(false)
    if (error) return setError(error)
    setMensaje('Cuenta creada. Si tu proyecto pide confirmación por correo, revisa tu bandeja antes de ingresar.')
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="mb-6 text-xl font-bold">
        {modo === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta'}
      </h1>
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
          minLength={6}
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        {mensaje && <p className="text-sm text-green-600">{mensaje}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:bg-neutral-400"
        >
          {submitting
            ? 'Procesando...'
            : modo === 'login'
              ? 'Ingresar'
              : 'Crear cuenta'}
        </button>
      </form>
      <button
        onClick={() => {
          setModo(modo === 'login' ? 'registro' : 'login')
          setError(null)
          setMensaje(null)
        }}
        className="mt-4 text-sm text-neutral-500 underline"
      >
        {modo === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Ingresa'}
      </button>
    </div>
  )
}
