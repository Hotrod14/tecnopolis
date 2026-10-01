// Edge Function: crear-pago-webpay
//
// Recibe el carrito del frontend, valida precios y stock contra la
// base de datos (nunca confia en el precio que manda el cliente),
// crea la orden en estado 'pendiente' y abre la transaccion en
// Transbank Webpay Plus.

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  crearTransaccionTransbank,
  buyOrderDesdeOrdenId,
} from '../_shared/transbank.ts'
import { cotizarEnvio, calcularBulto } from '../_shared/envio.ts'

interface CarritoItemInput {
  producto_id: string
  cantidad: number
}

interface DireccionEnvioInput {
  nombre: string
  telefono: string
  email: string
  region: string
  comuna: string
  calle: string
  numero: string
  depto?: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

async function resolverUsuarioId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const { data, error } = await supabaseAdmin.auth.getUser(jwt)
  if (error || !data.user) return null
  return data.user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { items, direccionEnvio, tipoEntrega } = (await req.json()) as {
      items: CarritoItemInput[]
      direccionEnvio: DireccionEnvioInput
      tipoEntrega: string
    }

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: 'El carrito esta vacio.' }, 400)
    }
    if (!direccionEnvio?.region || !direccionEnvio?.comuna || !direccionEnvio?.email) {
      return json({ error: 'Faltan datos de la direccion de envio.' }, 400)
    }
    if (!tipoEntrega) {
      return json({ error: 'Falta seleccionar un tipo de entrega.' }, 400)
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
        return json({ error: `Producto ${item.producto_id} no existe.` }, 400)
      }
      if (item.cantidad < 1 || item.cantidad > producto.stock) {
        return json(
          { error: `Stock insuficiente para "${producto.nombre}".` },
          409,
        )
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
      return json({ error: 'El tipo de entrega seleccionado ya no esta disponible.' }, 409)
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

    return json({
      ordenId: orden.id,
      token: transbankResponse.token,
      url: transbankResponse.url,
    })
  } catch (error) {
    console.error(error)
    return json({ error: (error as Error).message ?? 'Error interno.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
