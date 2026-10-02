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
import { dentroDelLimite } from '../_shared/rateLimit.ts'

const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:5173'

// Esta funcion es publica (Transbank redirige el navegador sin JWT).
// Un cliente real la invoca 1 vez por pago; 30/min por IP es holgado.
const LIMITE_IP = { max: 30, ventana: 60 }
const MAX_BODY_BYTES = 4 * 1024
// Los tokens de Webpay tienen 64 caracteres hex.
const TOKEN_RE = /^[A-Za-z0-9]{1,128}$/

Deno.serve(async (req) => {
  try {
    if (!(await dentroDelLimite(req, 'confirmar-pago', LIMITE_IP.max, LIMITE_IP.ventana))) {
      return new Response('Demasiadas solicitudes', {
        status: 429,
        headers: { 'Retry-After': String(LIMITE_IP.ventana) },
      })
    }

    const params = await extraerParametros(req)
    const tokenWs = params.get('token_ws')
    const tbkToken = params.get('TBK_TOKEN')

    if ((tokenWs && !TOKEN_RE.test(tokenWs)) || (tbkToken && !TOKEN_RE.test(tbkToken))) {
      return redirectRetorno({ estado: 'rechazado', motivo: 'token_invalido' })
    }

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
          .eq('estado', 'pendiente')
        return redirectRetorno({
          estado: 'rechazado',
          ordenId: orden.id,
          motivo: 'stock_insuficiente',
        })
      }

      return redirectRetorno({ estado: 'pagado', ordenId: orden.id })
    }

    await supabaseAdmin.from('ordenes').update({ estado: 'rechazado' }).eq('id', orden.id).eq('estado', 'pendiente')
    return redirectRetorno({ estado: 'rechazado', ordenId: orden.id })
  } catch (error) {
    console.error(error)
    return redirectRetorno({ estado: 'rechazado', motivo: 'error_interno' })
  }
})

async function extraerParametros(req: Request): Promise<URLSearchParams> {
  const url = new URL(req.url)
  if (req.method === 'POST') {
    const largo = Number(req.headers.get('content-length') ?? '0')
    if (largo > MAX_BODY_BYTES) return new URLSearchParams()
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await req.text()
      if (body.length > MAX_BODY_BYTES) return new URLSearchParams()
      return new URLSearchParams(body)
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

  await supabaseAdmin.from('ordenes').update({ estado: 'rechazado' }).eq('id', orden.id).eq('estado', 'pendiente')
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
