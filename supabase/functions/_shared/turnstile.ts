// Verificacion de Cloudflare Turnstile (captcha invisible).
// Solo se exige si TURNSTILE_SECRET_KEY esta configurado, para que el
// despliegue no se rompa antes de crear las claves.

import { ipCliente } from './rateLimit.ts'

// trim(): un espacio o salto de linea pegado junto a la clave hace que
// Cloudflare rechace todos los tokens.
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY')?.trim()

export function captchaHabilitado(): boolean {
  return Boolean(TURNSTILE_SECRET_KEY)
}

export async function captchaValido(req: Request, token: string | undefined | null): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) return true
  if (!token || token.length > 2048) {
    console.warn('Turnstile: token ausente o demasiado largo')
    return false
  }

  try {
    const form = new FormData()
    form.append('secret', TURNSTILE_SECRET_KEY)
    form.append('response', token)
    // remoteip es opcional; solo se envia si parece una IP real.
    const ip = ipCliente(req)
    if (/^[0-9a-fA-F:.]+$/.test(ip)) form.append('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const data = (await res.json()) as {
      success?: boolean
      'error-codes'?: string[]
      hostname?: string
    }
    if (data.success !== true) {
      // Sin datos sensibles: solo el motivo que devuelve Cloudflare.
      console.warn('Turnstile rechazado:', JSON.stringify({
        status: res.status,
        errores: data['error-codes'] ?? [],
        hostname: data.hostname ?? null,
      }))
      return false
    }
    return true
  } catch (err) {
    console.error('No se pudo verificar Turnstile:', err)
    return false
  }
}
