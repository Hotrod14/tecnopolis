import { corsHeadersPara } from './cors.ts'
import { ErrorValidacion } from './validacion.ts'

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersPara(req), 'Content-Type': 'application/json', ...extra },
  })
}

export function demasiadasSolicitudes(req: Request, segundos: number) {
  return json(
    req,
    { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
    429,
    { 'Retry-After': String(segundos) },
  )
}

/** Errores de validacion se devuelven tal cual; el resto, generico. */
export function errorARespuesta(req: Request, err: unknown) {
  if (err instanceof ErrorValidacion) {
    return json(req, { error: err.message }, err.status)
  }
  console.error(err)
  return json(req, { error: 'Error interno. Intenta nuevamente.' }, 500)
}
