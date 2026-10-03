import { buscarComuna } from './direcciones'

// Autocompletado de direcciones con Photon (https://photon.komoot.io),
// un buscador sobre datos de OpenStreetMap. Es gratuito y sin clave, pero
// de "uso justo": por eso se espera a que el usuario deje de escribir,
// se cancelan las busquedas viejas y se cachean las respuestas. Si algun
// dia se necesita mas volumen, se puede montar una instancia propia y
// apuntar VITE_PHOTON_URL a ella.

const PHOTON_URL = (import.meta.env.VITE_PHOTON_URL as string | undefined) ?? 'https://photon.komoot.io'

// Chile continental + insular (Rapa Nui, Juan Fernandez). El rectangulo
// tambien toca paises vecinos; esos resultados se descartan por countrycode.
const BBOX_CHILE = '-109.6,-56.1,-66.3,-17.4'

export const MIN_CARACTERES = 3

/** 'completa': calle y numero confirmados por el buscador.
 *  'calle': la calle existe, el numero lo escribio el cliente.
 *  'manual': el cliente no encontro su direccion y la escribio a mano. */
export type Verificacion = 'completa' | 'calle' | 'manual'

export interface SugerenciaDireccion {
  id: string
  calle: string
  numero: string | null
  comuna: string
  region: string
  lat: number
  lon: number
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    osm_type?: string
    osm_id?: number
    osm_key?: string
    type?: string
    name?: string
    street?: string
    housenumber?: string
    city?: string
    district?: string
    locality?: string
    county?: string
    countrycode?: string
  }
}

function aSugerencia(f: PhotonFeature): SugerenciaDireccion | null {
  const p = f.properties ?? {}
  const coords = f.geometry?.coordinates
  if (p.countrycode?.toUpperCase() !== 'CL' || !coords) return null

  // Una calle sin numero viene como feature de tipo "street" (osm_key
  // highway) con el nombre en `name`; una casa o local trae `street`.
  const esCalle = p.type === 'street' || p.osm_key === 'highway'
  const calle = p.street ?? (esCalle ? p.name : undefined)
  if (!calle) return null

  // OSM no siempre pone la comuna en el mismo campo: se prueba en orden
  // y se usa el primero que sea una comuna real (eso tambien da la region).
  const comuna = [p.city, p.district, p.locality, p.county]
    .map((c) => (c ? buscarComuna(c.replace(/^comuna de /i, '')) : null))
    .find((c) => c !== null)
  if (!comuna) return null

  return {
    id: `${p.osm_type ?? ''}${p.osm_id ?? `${coords[0]},${coords[1]}`}`,
    calle,
    numero: p.housenumber?.trim() || null,
    comuna: comuna.comuna,
    region: comuna.region,
    lon: coords[0],
    lat: coords[1],
  }
}

const cache = new Map<string, SugerenciaDireccion[]>()

export async function buscarDirecciones(texto: string, signal?: AbortSignal): Promise<SugerenciaDireccion[]> {
  const q = texto.trim()
  if (q.length < MIN_CARACTERES) return []
  const clave = q.toLowerCase()
  const enCache = cache.get(clave)
  if (enCache) return enCache

  const params = new URLSearchParams({ q, limit: '10', bbox: BBOX_CHILE })
  const res = await fetch(`${PHOTON_URL}/api?${params}`, { signal })
  if (!res.ok) throw new Error(`Photon respondio ${res.status}`)
  const data = (await res.json()) as { features?: PhotonFeature[] }

  const vistas = new Set<string>()
  const sugerencias: SugerenciaDireccion[] = []
  for (const f of data.features ?? []) {
    const s = aSugerencia(f)
    if (!s) continue
    const k = `${s.calle}|${s.numero ?? ''}|${s.comuna}`.toLowerCase()
    if (vistas.has(k)) continue
    vistas.add(k)
    sugerencias.push(s)
  }
  // Si el usuario escribio un numero, primero las direcciones exactas.
  if (/\d/.test(q)) sugerencias.sort((a, b) => Number(b.numero !== null) - Number(a.numero !== null))

  const resultado = sugerencias.slice(0, 6)
  cache.set(clave, resultado)
  return resultado
}
