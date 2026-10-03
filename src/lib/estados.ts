import type { EstadoOrden } from '../types'

export const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  pendiente: 'Pendiente de pago',
  pagado: 'Pago confirmado',
  rechazado: 'Pago rechazado',
  preparando: 'Preparando pedido',
  enviado: 'Enviado',
  entregado: 'Entregado',
}

export const COLOR_ESTADO: Record<EstadoOrden, string> = {
  pendiente: 'bg-neutral-100 text-neutral-600',
  pagado: 'bg-blue-100 text-blue-700',
  rechazado: 'bg-red-100 text-red-700',
  preparando: 'bg-amber-100 text-amber-700',
  enviado: 'bg-indigo-100 text-indigo-700',
  entregado: 'bg-green-100 text-green-700',
}
