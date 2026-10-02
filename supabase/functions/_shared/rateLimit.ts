// Rate limiting por IP usando la funcion SQL public.check_rate_limit
// (migracion 0004). Ventana fija; sin servicios externos.

import { supabaseAdmin } from './supabaseAdmin.ts'

export function ipCliente(req: Request): string {
  const directa = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip')
  if (directa) return directa.trim()
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'desconocida'
}

/**
 * Devuelve true si la peticion esta dentro del limite.
 * Si la base de datos falla se deja pasar (fail-open) para no tumbar
 * el checkout por un problema del limitador.
 */
export async function dentroDelLimite(
  req: Request,
  nombre: string,
  max: number,
  ventanaSegundos: number,
): Promise<boolean> {
  return await consumir(`${nombre}:${ipCliente(req)}`, max, ventanaSegundos)
}

/**
 * Limite global por funcion (todas las IPs juntas). Es un tope de
 * seguridad para proteger la cuota mensual del proyecto si el ataque
 * viene distribuido desde muchas IPs.
 */
export async function dentroDelLimiteGlobal(
  nombre: string,
  max: number,
  ventanaSegundos: number,
): Promise<boolean> {
  return await consumir(`${nombre}:global`, max, ventanaSegundos)
}

async function consumir(clave: string, max: number, ventanaSegundos: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_clave: clave,
    p_max: max,
    p_ventana_segundos: ventanaSegundos,
  })

  if (error) {
    console.error('Rate limit no disponible, se deja pasar:', error.message)
    return true
  }
  return data === true
}
