// Config y helpers para Webpay Plus (Transbank REST API).
//
// NOTA IMPORTANTE: el blueprint original indicaba
// "https://transbank.cl" como base URL, pero esa no es una URL
// valida de la API de Transbank. La URL correcta del ambiente de
// INTEGRACION (pruebas) es "https://webpay3gint.transbank.cl".
// Se deja configurable via env var para poder apuntar a produccion
// ("https://webpay3g.transbank.cl") el dia que corresponda.
//
// El blueprint tambien traia un path de recurso incorrecto
// ("/rs-webpay-payment/v1.2/transactions"). El real es
// "/rswebpaytransaction/api/webpay/v1.2/transactions".

export const TRANSBANK_COMMERCE_CODE =
  Deno.env.get('TRANSBANK_COMMERCE_CODE') ?? '597055555532'

export const TRANSBANK_API_KEY_SECRET =
  Deno.env.get('TRANSBANK_API_KEY_SECRET') ??
  '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C'

export const TRANSBANK_BASE_URL =
  Deno.env.get('TRANSBANK_BASE_URL') ?? 'https://webpay3gint.transbank.cl'

export const TRANSBANK_HEADERS = {
  'Content-Type': 'application/json',
  'Tbk-Api-Key-Id': TRANSBANK_COMMERCE_CODE,
  'Tbk-Api-Key-Secret': TRANSBANK_API_KEY_SECRET,
}

export interface CrearTransaccionResponse {
  token: string
  url: string
}

export interface ConfirmarTransaccionResponse {
  vci: string
  amount: number
  status: string
  buy_order: string
  session_id: string
  card_detail: { card_number: string }
  accounting_date: string
  transaction_date: string
  authorization_code: string
  payment_type_code: string
  response_code: number
  installments_number: number
}

export async function crearTransaccionTransbank(params: {
  buyOrder: string
  sessionId: string
  amount: number
  returnUrl: string
}): Promise<CrearTransaccionResponse> {
  const res = await fetch(`${TRANSBANK_BASE_URL}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
    method: 'POST',
    headers: TRANSBANK_HEADERS,
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      buy_order: params.buyOrder,
      session_id: params.sessionId,
      amount: params.amount,
      return_url: params.returnUrl,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Transbank crear transaccion fallo (${res.status}): ${text}`)
  }

  return (await res.json()) as CrearTransaccionResponse
}

export async function confirmarTransaccionTransbank(
  token: string,
): Promise<ConfirmarTransaccionResponse> {
  const res = await fetch(
    `${TRANSBANK_BASE_URL}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`,
    {
      method: 'PUT',
      headers: TRANSBANK_HEADERS,
      signal: AbortSignal.timeout(15000),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Transbank confirmar transaccion fallo (${res.status}): ${text}`)
  }

  return (await res.json()) as ConfirmarTransaccionResponse
}

/** buy_order de Transbank: alfanumerico, maximo 26 caracteres. */
export function buyOrderDesdeOrdenId(ordenId: string): string {
  return ordenId.replace(/-/g, '').slice(0, 26)
}
