export const formatoCLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export const formatoFecha = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Los primeros 8 caracteres del UUID bastan para identificar un pedido. */
export function idCorto(id: string) {
  return id.slice(0, 8).toUpperCase()
}
