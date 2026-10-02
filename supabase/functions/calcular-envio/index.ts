// Edge Function: calcular-envio
//
// Recibe el carrito + destino (region/comuna) y cotiza el envio.
// El peso/dimensiones se calculan en el servidor a partir de los
// productos reales (nunca se confia en datos fisicos que mande el
// navegador). Devuelve las opciones ordenadas de mas barata a mas
// cara; el frontend puede usar la primera como "la mas conveniente"
// o dejar que el cliente elija otra (ej. domicilio en vez de agencia).
//
// Proteccion anti-abuso: payload acotado, rate limit por IP y global,
// y cache de cotizaciones (ver _shared/envio.ts).

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { corsHeadersPara } from '../_shared/cors.ts'
import { cotizarEnvio, calcularBulto } from '../_shared/envio.ts'
import { REGIONES_CHILE } from '../_shared/regiones.ts'
import { dentroDelLimite, dentroDelLimiteGlobal } from '../_shared/rateLimit.ts'
import { ErrorValidacion, leerJson, validarItems, validarTexto } from '../_shared/validacion.ts'
import { json, demasiadasSolicitudes, errorARespuesta } from '../_shared/respuesta.ts'

// 20 cotizaciones por minuto por IP; 600 por minuto en total.
const LIMITE_IP = { max: 20, ventana: 60 }
const LIMITE_GLOBAL = { max: 600, ventana: 60 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersPara(req) })
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Metodo no permitido.' }, 405)
  }

  try {
    if (!(await dentroDelLimite(req, 'calcular-envio', LIMITE_IP.max, LIMITE_IP.ventana))) {
      return demasiadasSolicitudes(req, LIMITE_IP.ventana)
    }
    if (!(await dentroDelLimiteGlobal('calcular-envio', LIMITE_GLOBAL.max, LIMITE_GLOBAL.ventana))) {
      return demasiadasSolicitudes(req, LIMITE_GLOBAL.ventana)
    }

    const body = await leerJson<{ items: unknown; region: unknown; comuna: unknown }>(req)
    const items = validarItems(body.items)
    const region = validarTexto(body.region, 'la region', 80)
    const comuna = validarTexto(body.comuna, 'la comuna', 80)

    if (!REGIONES_CHILE.some((r) => r.nombre === region)) {
      throw new ErrorValidacion('Region invalida.')
    }

    const productoIds = items.map((i) => i.producto_id)
    const { data: productos, error } = await supabaseAdmin
      .from('productos')
      .select('id, precio, peso_kg, alto_cm, ancho_cm, largo_cm')
      .in('id', productoIds)

    if (error) throw error
    if (!productos || productos.length !== productoIds.length) {
      throw new ErrorValidacion('Uno o mas productos del carrito ya no existen.')
    }

    const valorDeclarado = items.reduce((acc, item) => {
      const producto = productos.find((p) => p.id === item.producto_id)!
      return acc + producto.precio * item.cantidad
    }, 0)

    const bulto = calcularBulto(productos, items)

    const cotizacion = await cotizarEnvio({ region, comuna, bulto, valorDeclarado })

    return json(req, cotizacion)
  } catch (err) {
    return errorARespuesta(req, err)
  }
})
