import { useEffect, useRef } from 'react'

// Widget de Cloudflare Turnstile (captcha, normalmente invisible para
// el usuario). Solo se activa si VITE_TURNSTILE_SITE_KEY esta definida.

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      language?: string
    },
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scriptPromise = null
        reject(new Error('No se pudo cargar el captcha'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

interface Props {
  onToken: (token: string | null) => void
  /** Cambia este valor para forzar un token nuevo (los tokens son de un solo uso). */
  resetKey?: number
}

export default function Turnstile({ onToken, resetKey = 0 }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)

  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelado = false

    cargarScript()
      .then(() => {
        if (cancelado || !contenedor.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(contenedor.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: 'es',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))

    return () => {
      cancelado = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) {
      onTokenRef.current(null)
      window.turnstile.reset(widgetId.current)
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={contenedor} className="mt-4 flex justify-center" />
}
