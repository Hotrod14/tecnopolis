// Edge Function: confirmar-pago-webpay
//
// Este es el return_url que Transbank invoca (POST desde el navegador
// del cliente, application/x-www-form-urlencoded) al terminar el pago.
//
// Casos posibles segun la documentacion de Webpay Plus:
//  - Pago completado (aprobado o rechazado por el emisor): llega
//    `token_ws`. Hay que hacer el commit (PUT) para conocer el
//    resultado final.
//  - Usuario anula/cancela o la transaccion expira antes de pagar:
//    llega `TBK_TOKEN` (+ TBK_ORDEN_COMPRA, TBK_ID_SESION) y NO se
//    debe hacer commit; la orden se marca directamente como rechazada.
//
// Al terminar, siempre se redirige (302) al frontend en
// /webpay-retorno con el estado final en la query string.

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { confirmarTransaccionTransbank } from '../_shared/transbank.ts'

const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:5173'

Deno.serve(async (req) => {
  try {
    const params = await extraerParametros(req)
    const tokenWs = params.get('token_ws')
    const tbkToken = params.get('TBK_TOKEN')

    if (!tokenWs && tbkToken) {
      const ordenId = await rechazarOrdenPorToken(tbkToken)
      return redirectRetorno({ estado: 'rechazado', ordenId, motivo: 'anulado' })
    }

    if (!tokenWs) {
      return redirectRetorno({ estado: 'rechazado', motivo: 'sin_token' })
    }

    const { data: orden, error: ordenError } = await supabaseAdmin
      .from('ordenes')
      .select('id, estado')
      .eq('transbank_token', tokenWs)
      .single()

    if (ordenError || !orden) {
      return redirectRetorno({ estado: 'rechazado', motivo: 'orden_no_encontrada' })
    }

    const resultado = await confirmarTransaccionTransbank(tokenWs)
    const aprobado = resultado.vci === 'TSY' && resultado.status === 'AUTHORIZED'

    if (aprobado) {
      const { error: rpcError } = await supabaseAdmin.rpc('confirmar_orden_pagada', {
        p_orden_id: orden.id,
      })

      if (rpcError) {
        console.error('Fallo al descontar stock / marcar pagada:', rpcError)
        await supabaseAdmin
          .from('ordenes')
          .update({ estado: 'rechazado' })
          .eq('id', orden.id)
        return redirectRetorno({
          estado: 'rechazado',
          ordenId: orden.id,
          motivo: 'stock_insuficiente',
        })
      }

      return redirectRetorno({ estado: 'pagado', ordenId: orden.id })
    }

    await supabaseAdmin.from('ordenes').update({ estado: 'rechazado' }).eq('id', orden.id)
    return redirectRetorno({ estado: 'rechazado', ordenId: orden.id })
  } catch (error) {
    console.error(error)
    return redirectRetorno({ estado: 'rechazado', motivo: 'error_interno' })
  }
})

async function extraerParametros(req: Request): Promise<URLSearchParams> {
  const url = new URL(req.url)
  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await req.text()
      return new URLSearchParams(body)
    }
    if (contentType.includes('application/json')) {
      const body = await req.json()
      return new URLSearchParams(body as Record<string, string>)
    }
  }
  return url.searchParams
}

async function rechazarOrdenPorToken(tbkToken: string): Promise<string | undefined> {
  const { data: orden } = await supabaseAdmin
    .from('ordenes')
    .select('id')
    .eq('transbank_token', tbkToken)
    .single()

  if (!orden) return undefined

  await supabaseAdmin.from('ordenes').update({ estado: 'rechazado' }).eq('id', orden.id)
  return orden.id
}

function redirectRetorno(params: {
  estado: 'pagado' | 'rechazado'
  ordenId?: string
  motivo?: string
}) {
  const url = new URL('/webpay-retorno', FRONTEND_URL)
  url.searchParams.set('estado', params.estado)
  if (params.ordenId) url.searchParams.set('orden', params.ordenId)
  if (params.motivo) url.searchParams.set('motivo', params.motivo)

  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  })
}
