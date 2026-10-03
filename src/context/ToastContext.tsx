import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// Snackbar global: confirma acciones (agregar al carrito, iniciar o
// cerrar sesion, guardar cambios en el admin, etc.). Se muestran abajo,
// maximo 3 a la vez, y se cierran solos.

type TipoToast = 'exito' | 'error' | 'info'

interface AccionToast {
  label: string
  onClick: () => void
}

interface OpcionesToast {
  accion?: AccionToast
  duracionMs?: number
}

interface Toast {
  id: number
  tipo: TipoToast
  mensaje: string
  accion?: AccionToast
  duracionMs: number
}

interface ToastApi {
  exito: (mensaje: string, opciones?: OpcionesToast) => void
  error: (mensaje: string, opciones?: OpcionesToast) => void
  info: (mensaje: string, opciones?: OpcionesToast) => void
}

const MAX_VISIBLES = 3

const ToastContext = createContext<ToastApi | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const siguienteId = useRef(1)

  const cerrar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const mostrar = useCallback((tipo: TipoToast, mensaje: string, opciones: OpcionesToast = {}) => {
    const toast: Toast = {
      id: siguienteId.current++,
      tipo,
      mensaje,
      accion: opciones.accion,
      // Con boton de accion (ej. "Deshacer") se deja mas tiempo.
      duracionMs: opciones.duracionMs ?? (opciones.accion ? 6000 : tipo === 'error' ? 6000 : 3500),
    }
    setToasts((prev) => [...prev, toast].slice(-MAX_VISIBLES))
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      exito: (m, o) => mostrar('exito', m, o),
      error: (m, o) => mostrar('error', m, o),
      info: (m, o) => mostrar('info', m, o),
    }),
    [mostrar],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => (
          <Snackbar key={t.id} toast={t} onCerrar={cerrar} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const ESTILO: Record<TipoToast, { icono: string; color: string }> = {
  exito: { icono: '✓', color: 'bg-green-500' },
  error: { icono: '!', color: 'bg-red-500' },
  info: { icono: 'i', color: 'bg-neutral-500' },
}

function Snackbar({ toast, onCerrar }: { toast: Toast; onCerrar: (id: number) => void }) {
  const [pausado, setPausado] = useState(false)
  const { id, duracionMs } = toast
  const onClose = useCallback(() => onCerrar(id), [onCerrar, id])

  // Se pausa mientras el mouse esta encima para que alcance a leerse.
  useEffect(() => {
    if (pausado) return
    const timer = setTimeout(onClose, duracionMs)
    return () => clearTimeout(timer)
  }, [pausado, duracionMs, onClose])

  const { icono, color } = ESTILO[toast.tipo]

  return (
    <div
      role={toast.tipo === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="snackbar-entrada pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}
      >
        {icono}
      </span>
      <p className="flex-1">{toast.mensaje}</p>
      {toast.accion && (
        <button
          onClick={() => {
            toast.accion?.onClick()
            onClose()
          }}
          className="shrink-0 rounded px-2 py-1 text-sm font-semibold text-amber-300 hover:bg-white/10"
        >
          {toast.accion.label}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Cerrar notificación"
        className="shrink-0 rounded px-1 text-neutral-400 hover:text-white"
      >
        ✕
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
