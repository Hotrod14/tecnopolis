// Edge Function: calcular-envio
//
// Recibe el carrito + destino (region/comuna) y cotiza el envio.
// El peso/dimensiones se calculan en el servidor a partir de los
// productos reales (nunca se confia en datos fisicos que mande el
// navegador). Devuelve las opciones ordenadas de mas barata a mas
// cara; el frontend puede usar la primera como "la mas conveniente"
// o dejar que el cliente elija otra (ej. domicilio en vez de agencia).

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { cotizarEnvio, calcularBulto } from '../_shared/envio.ts'

interface CarritoItemInput {
  producto_id: string
  cantidad: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { items, region, comuna } = (await req.json()) as {
      items: CarritoItemInput[]
      region: string
      comuna: string
    }

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: 'El carrito esta vacio.' }, 400)
    }
    if (!region || !comuna) {
      return json({ error: 'Falta region o comuna de destino.' }, 400)
    }

    const productoIds = items.map((i) => i.producto_id)
    const { data: productos, error } = await supabaseAdmin
      .from('productos')
      .select('id, precio, peso_kg, alto_cm, ancho_cm, largo_cm')
      .in('id', productoIds)

    if (error) throw error
    if (!productos || productos.length !== productoIds.length) {
      return json({ error: 'Uno o mas productos del carrito ya no existen.' }, 400)
    }

    const valorDeclarado = items.reduce((acc, item) => {
      const producto = productos.find((p) => p.id === item.producto_id)!
      return acc + producto.precio * item.cantidad
    }, 0)

    const bulto = calcularBulto(productos, items)

    const cotizacion = await cotizarEnvio({ region, comuna, bulto, valorDeclarado })

    return json(cotizacion)
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message ?? 'Error interno.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
