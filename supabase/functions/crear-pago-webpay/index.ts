// Edge Function: crear-pago-webpay
//
// Recibe el carrito del frontend, valida precios y stock contra la
// base de datos (nunca confia en el precio que manda el cliente),
// crea la orden en estado 'pendiente' y abre la transaccion en
// Transbank Webpay Plus.
//
// Proteccion anti-abuso: es la funcion mas cara (DB + Transbank +
// cotizacion), por eso exige captcha (si TURNSTILE_SECRET_KEY esta
// configurado), payload acotado y rate limit por IP y global.

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { corsHeadersPara } from '../_shared/cors.ts'
import {
  crearTransaccionTransbank,
  buyOrderDesdeOrdenId,
} from '../_shared/transbank.ts'
import { cotizarEnvio, calcularBulto } from '../_shared/envio.ts'
import { REGIONES_CHILE } from '../_shared/regiones.ts'
import { dentroDelLimite, dentroDelLimiteGlobal } from '../_shared/rateLimit.ts'
import { captchaValido } from '../_shared/turnstile.ts'
import { ErrorValidacion, leerJson, validarItems, validarTexto } from '../_shared/validacion.ts'
import { json, demasiadasSolicitudes, errorARespuesta } from '../_shared/respuesta.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

// 5 intentos de pago por minuto y 30 por hora por IP; 120/min en total.
const LIMITE_IP_MINUTO = { max: 5, ventana: 60 }
const LIMITE_IP_HORA = { max: 30, ventana: 3600 }
const LIMITE_GLOBAL = { max: 120, ventana: 60 }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIPOS_ENTREGA = ['AGENCIA', 'DOMICILIO', 'AMBOS']

interface BodyEntrada {
  items: unknown
  direccionEnvio: Record<string, unknown> | undefined
  tipoEntrega: unknown
  captchaToken?: string
}

async function resolverUsuarioId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const { data, error } = await supabaseAdmin.auth.getUser(jwt)
  if (error || !data.user) return null
  return data.user.id
}

function validarDireccion(d: Record<string, unknown> | undefined) {
  if (!d || typeof d !== 'object') throw new ErrorValidacion('Faltan datos de la direccion de envio.')

  const direccion = {
    nombre: validarTexto(d.nombre, 'el nombre', 120),
    telefono: validarTexto(d.telefono, 'el telefono', 30),
    email: validarTexto(d.email, 'el correo', 254),
    region: validarTexto(d.region, 'la region', 80),
    comuna: validarTexto(d.comuna, 'la comuna', 80),
    calle: validarTexto(d.calle, 'la calle', 160),
    numero: validarTexto(d.numero, 'el numero', 20),
    depto: validarTexto(d.depto, 'el depto', 60, false),
  }

  if (!EMAIL_RE.test(direccion.email)) throw new ErrorValidacion('Correo invalido.')
  if (!REGIONES_CHILE.some((r) => r.nombre === direccion.region)) {
    throw new ErrorValidacion('Region invalida.')
  }
  return direccion
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersPara(req) })
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Metodo no permitido.' }, 405)
  }

  try {
    if (!(await dentroDelLimite(req, 'crear-pago:min', LIMITE_IP_MINUTO.max, LIMITE_IP_MINUTO.ventana))) {
      return demasiadasSolicitudes(req, LIMITE_IP_MINUTO.ventana)
    }
    if (!(await dentroDelLimite(req, 'crear-pago:hora', LIMITE_IP_HORA.max, LIMITE_IP_HORA.ventana))) {
      return demasiadasSolicitudes(req, LIMITE_IP_HORA.ventana)
    }
    if (!(await dentroDelLimiteGlobal('crear-pago', LIMITE_GLOBAL.max, LIMITE_GLOBAL.ventana))) {
      return demasiadasSolicitudes(req, LIMITE_GLOBAL.ventana)
    }

    const body = await leerJson<BodyEntrada>(req)

    if (!(await captchaValido(req, body.captchaToken))) {
      return json(req, { error: 'No pudimos verificar que eres humano. Recarga la pagina e intenta de nuevo.' }, 403)
    }

    const items = validarItems(body.items)
    const direccionEnvio = validarDireccion(body.direccionEnvio)
    const tipoEntrega = validarTexto(body.tipoEntrega, 'el tipo de entrega', 20)
    if (!TIPOS_ENTREGA.includes(tipoEntrega)) {
      throw new ErrorValidacion('Tipo de entrega invalido.')
    }

    const productoIds = items.map((i) => i.producto_id)
    const { data: productos, error: productosError } = await supabaseAdmin
      .from('productos')
      .select('id, precio, stock, nombre, peso_kg, alto_cm, ancho_cm, largo_cm')
      .in('id', productoIds)

    if (productosError) throw productosError

    const itemsOrden: {
      producto_id: string
      nombre: string
      cantidad: number
      precio_unitario: number
    }[] = []
    let subtotal = 0

    for (const item of items) {
      const producto = productos?.find((p) => p.id === item.producto_id)
      if (!producto) {
        throw new ErrorValidacion('Uno o mas productos del carrito ya no existen.')
      }
      if (item.cantidad > producto.stock) {
        throw new ErrorValidacion(`Stock insuficiente para "${producto.nombre}".`, 409)
      }
      itemsOrden.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: producto.precio,
      })
      subtotal += producto.precio * item.cantidad
    }

    // El costo de envio se recalcula en el servidor (nunca se confia en
    // un monto que mande el navegador) y debe coincidir con una de las
    // opciones que ya le mostramos al cliente en /checkout.
    const bulto = calcularBulto(productos!, items)
    const cotizacion = await cotizarEnvio({
      region: direccionEnvio.region,
      comuna: direccionEnvio.comuna,
      bulto,
      valorDeclarado: subtotal,
    })
    const opcionElegida = cotizacion.opciones.find((o) => o.tipoEntrega === tipoEntrega)
    if (!opcionElegida) {
      throw new ErrorValidacion('El tipo de entrega seleccionado ya no esta disponible.', 409)
    }

    const costoEnvio = opcionElegida.tarifa
    const total = subtotal + costoEnvio
    const usuarioId = await resolverUsuarioId(req)

    const { data: orden, error: ordenError } = await supabaseAdmin
      .from('ordenes')
      .insert({
        total,
        subtotal,
        costo_envio: costoEnvio,
        estado: 'pendiente',
        items: itemsOrden,
        direccion_envio: direccionEnvio,
        email_contacto: direccionEnvio.email,
        usuario_id: usuarioId,
      })
      .select('id')
      .single()

    if (ordenError) throw ordenError

    const returnUrl = `${SUPABASE_URL}/functions/v1/confirmar-pago-webpay`

    const transbankResponse = await crearTransaccionTransbank({
      buyOrder: buyOrderDesdeOrdenId(orden.id),
      sessionId: orden.id,
      amount: total,
      returnUrl,
    })

    const { error: updateError } = await supabaseAdmin
      .from('ordenes')
      .update({ transbank_token: transbankResponse.token })
      .eq('id', orden.id)

    if (updateError) throw updateError

    return json(req, {
      ordenId: orden.id,
      token: transbankResponse.token,
      url: transbankResponse.url,
    })
  } catch (err) {
    return errorARespuesta(req, err)
  }
})
