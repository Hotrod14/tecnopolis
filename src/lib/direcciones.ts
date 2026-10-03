import { COMUNAS_POR_REGION } from './comunas'
import type { Verificacion } from './geocoder'

export interface DireccionForm {
  nombre: string
  telefono: string
  email: string
  region: string
  comuna: string
  calle: string
  numero: string
  depto: string
  /** Como se obtuvo calle/numero (ver Verificacion). Sin valor: aun no hay direccion. */
  verificacion?: Verificacion
  lat?: number
  lon?: number
}

export const DIRECCION_VACIA: DireccionForm = {
  nombre: '',
  telefono: '',
  email: '',
  region: '',
  comuna: '',
  calle: '',
  numero: '',
  depto: '',
}

// ---------------------------------------------------------------
// Comunas: busqueda sin importar tildes ni mayusculas.
// ---------------------------------------------------------------

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Indice comuna normalizada -> nombre oficial y region. No hay nombres
// de comuna repetidos entre regiones, asi que la region se puede deducir.
const INDICE_COMUNAS = new Map<string, { comuna: string; region: string }>()
for (const [region, comunas] of Object.entries(COMUNAS_POR_REGION)) {
  for (const comuna of comunas) INDICE_COMUNAS.set(normalizar(comuna), { comuna, region })
}

export const TODAS_LAS_COMUNAS = [...INDICE_COMUNAS.values()].sort((a, b) =>
  a.comuna.localeCompare(b.comuna, 'es'),
)

/** Busca una comuna exacta (ignorando tildes y mayusculas). */
export function buscarComuna(texto: string): { comuna: string; region: string } | null {
  return INDICE_COMUNAS.get(normalizar(texto)) ?? null
}

// ---------------------------------------------------------------
// Direcciones guardadas en este navegador (ultimas usadas al pagar).
// localStorage puede fallar (modo privado, almacenamiento bloqueado):
// todo va en try/catch y sin el, simplemente no hay sugerencias.
// ---------------------------------------------------------------

const STORAGE_KEY = 'tecnopolis_direcciones'
const MAX_GUARDADAS = 3

/** Identifica una direccion fisica, sin importar quien la recibe. */
export function claveDireccion(d: Pick<DireccionForm, 'comuna' | 'calle' | 'numero' | 'depto'>): string {
  return [d.comuna, d.calle, d.numero, d.depto ?? ''].map(normalizar).join('|')
}

function esDireccionValida(d: unknown): d is DireccionForm {
  if (!d || typeof d !== 'object') return false
  const x = d as Record<string, unknown>
  return ['nombre', 'telefono', 'email', 'region', 'comuna', 'calle', 'numero'].every(
    (k) => typeof x[k] === 'string' && (x[k] as string).length > 0,
  )
}

export function cargarDireccionesLocales(): DireccionForm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const lista = raw ? (JSON.parse(raw) as unknown[]) : []
    return Array.isArray(lista)
      ? lista.filter(esDireccionValida).map((d) => ({ ...DIRECCION_VACIA, ...d }))
      : []
  } catch {
    return []
  }
}

function escribir(lista: DireccionForm[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
  } catch {
    // sin almacenamiento disponible: no se recuerda la direccion
  }
}

export function guardarDireccionLocal(d: DireccionForm) {
  const clave = claveDireccion(d)
  const resto = cargarDireccionesLocales().filter((x) => claveDireccion(x) !== clave)
  escribir([d, ...resto].slice(0, MAX_GUARDADAS))
}

export function olvidarDireccionLocal(d: DireccionForm) {
  const clave = claveDireccion(d)
  escribir(cargarDireccionesLocales().filter((x) => claveDireccion(x) !== clave))
}

/** Une listas (la primera tiene prioridad), sin repetir direcciones. */
export function unirDirecciones(...listas: DireccionForm[][]): DireccionForm[] {
  const vistas = new Set<string>()
  const resultado: DireccionForm[] = []
  for (const d of listas.flat()) {
    const clave = claveDireccion(d)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    resultado.push(d)
  }
  return resultado.slice(0, MAX_GUARDADAS)
}

export function resumenDireccion(d: DireccionForm): string {
  return `${d.calle} ${d.numero}${d.depto ? `, ${d.depto}` : ''} · ${d.comuna}`
}
