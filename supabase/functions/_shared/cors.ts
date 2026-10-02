// CORS restringido a los origenes del frontend.
//
// ALLOWED_ORIGINS: lista separada por comas (ej.
// "https://tecnopolis.vercel.app,http://localhost:5173"). Si no esta
// definida se usa FRONTEND_URL. Nota: CORS solo lo respetan los
// navegadores; frente a scripts la proteccion real es el rate limit
// y el captcha (ver rateLimit.ts y turnstile.ts).

const ORIGENES_PERMITIDOS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  Deno.env.get('FRONTEND_URL') ??
  'http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)

export function corsHeadersPara(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const permitido = ORIGENES_PERMITIDOS.includes(origin) ? origin : ORIGENES_PERMITIDOS[0]

  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-captcha-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
