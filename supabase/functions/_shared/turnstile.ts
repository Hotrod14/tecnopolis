// Verificacion de Cloudflare Turnstile (captcha invisible).
// Solo se exige si TURNSTILE_SECRET_KEY esta configurado, para que el
// despliegue no se rompa antes de crear las claves.

import { ipCliente } from './rateLimit.ts'

const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY')

export function captchaHabilitado(): boolean {
  return Boolean(TURNSTILE_SECRET_KEY)
}

export async function captchaValido(req: Request, token: string | undefined | null): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) return true
  if (!token || token.length > 2048) return false

  try {
    const form = new FormData()
    form.append('secret', TURNSTILE_SECRET_KEY)
    form.append('response', token)
    form.append('remoteip', ipCliente(req))

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    console.error('No se pudo verificar Turnstile:', err)
    return false
  }
}
