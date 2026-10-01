// Cotizacion de envio. Intenta primero la API de EnviosChile
// (https://envioschile.net/docs); si no hay API key configurada, o la
// llamada falla, cae a una tabla de tarifas propia por zona para que
// el checkout nunca quede bloqueado.

import { zonaDeRegion, type ZonaEnvio } from './regiones.ts'

const ENVIOSCHILE_API_KEY = Deno.env.get('ENVIOSCHILE_API_KEY')
const ENVIOSCHILE_BASE_URL =
  Deno.env.get('ENVIOSCHILE_BASE_URL') ?? 'https://api.envioschile.net'
const ORIGEN_ENVIO = Deno.env.get('ORIGEN_ENVIO') ?? 'SANTIAGO'

export interface Bulto {
  alto: number
  largo: number
  ancho: number
  peso: number
}

export interface OpcionEnvio {
  proveedor: string
  tipoEntrega: string
  tarifa: number
  diasEntrega: string
}

export interface CotizacionEnvio {
  opciones: OpcionEnvio[]
  fuente: 'envioschile' | 'tabla_propia'
}

interface ProductoFisico {
  id: string
  peso_kg: number
  alto_cm: number
  ancho_cm: number
  largo_cm: number
}

/** Consolida el carrito en un unico bulto: peso sumado, dimensiones al maximo. */
export function calcularBulto(
  productos: ProductoFisico[],
  items: { producto_id: string; cantidad: number }[],
): Bulto {
  const bulto: Bulto = { alto: 0, ancho: 0, largo: 0, peso: 0 }

  for (const item of items) {
    const producto = productos.find((p) => p.id === item.producto_id)
    if (!producto) continue
    bulto.peso += Number(producto.peso_kg) * item.cantidad
    bulto.alto = Math.max(bulto.alto, producto.alto_cm)
    bulto.ancho = Math.max(bulto.ancho, producto.ancho_cm)
    bulto.largo = Math.max(bulto.largo, producto.largo_cm)
  }

  bulto.peso = Math.round(bulto.peso * 100) / 100
  return bulto
}

export async function cotizarEnvio(params: {
  region: string
  comuna: string
  bulto: Bulto
  valorDeclarado: number
}): Promise<CotizacionEnvio> {
  if (ENVIOSCHILE_API_KEY) {
    const viaApi = await cotizarConEnviosChile(params)
    if (viaApi) return viaApi
  }

  return { opciones: cotizarConTablaPropia(params.region, params.bulto), fuente: 'tabla_propia' }
}

async function cotizarConEnviosChile(params: {
  region: string
  comuna: string
  bulto: Bulto
  valorDeclarado: number
}): Promise<CotizacionEnvio | null> {
  try {
    const res = await fetch(`${ENVIOSCHILE_BASE_URL}/api/v1/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ENVIOSCHILE_API_KEY!,
      },
      body: JSON.stringify({
        origen: ORIGEN_ENVIO,
        destino: params.comuna.toUpperCase(),
        bultos: [params.bulto],
        valor_declarado: params.valorDeclarado,
        tipo_entrega: 'AMBOS',
      }),
    })

    if (!res.ok) {
      console.error('EnviosChile respondio', res.status, await res.text())
      return null
    }

    const data = (await res.json()) as {
      opciones?: { tipo_entrega: string; tarifa: number; dias_entrega: string }[]
    }

    const opciones: OpcionEnvio[] = (data.opciones ?? []).map((o) => ({
      proveedor: 'EnviosChile',
      tipoEntrega: o.tipo_entrega,
      tarifa: o.tarifa,
      diasEntrega: o.dias_entrega,
    }))

    if (opciones.length === 0) return null

    opciones.sort((a, b) => a.tarifa - b.tarifa)
    return { opciones, fuente: 'envioschile' }
  } catch (err) {
    console.error('Fallo la consulta a EnviosChile, se usa tabla propia:', err)
    return null
  }
}

const TARIFAS_POR_ZONA: Record<
  ZonaEnvio,
  { agencia: number; domicilio: number; perKgExtra: number; dias: string }
> = {
  RM: { agencia: 2990, domicilio: 3990, perKgExtra: 400, dias: '1-2' },
  CENTRO: { agencia: 4490, domicilio: 5490, perKgExtra: 500, dias: '2-3' },
  CENTRO_SUR: { agencia: 5490, domicilio: 6490, perKgExtra: 600, dias: '2-4' },
  NORTE: { agencia: 6490, domicilio: 7490, perKgExtra: 700, dias: '3-5' },
  SUR_EXTREMO: { agencia: 7990, domicilio: 9490, perKgExtra: 800, dias: '4-7' },
}

function cotizarConTablaPropia(region: string, bulto: Bulto): OpcionEnvio[] {
  const zona = zonaDeRegion(region)
  const tarifa = TARIFAS_POR_ZONA[zona]
  const kgExtra = Math.max(0, Math.ceil(bulto.peso - 1))
  const recargo = kgExtra * tarifa.perKgExtra

  return [
    {
      proveedor: 'Tecnopolis (tarifa estimada)',
      tipoEntrega: 'AGENCIA',
      tarifa: tarifa.agencia + recargo,
      diasEntrega: tarifa.dias,
    },
    {
      proveedor: 'Tecnopolis (tarifa estimada)',
      tipoEntrega: 'DOMICILIO',
      tarifa: tarifa.domicilio + recargo,
      diasEntrega: tarifa.dias,
    },
  ].sort((a, b) => a.tarifa - b.tarifa)
}
