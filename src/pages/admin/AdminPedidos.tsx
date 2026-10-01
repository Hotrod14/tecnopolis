import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formatoCLP } from '../../lib/format'
import type { Orden, EstadoOrden } from '../../types'

const ESTADOS: EstadoOrden[] = [
  'pendiente',
  'pagado',
  'rechazado',
  'preparando',
  'enviado',
  'entregado',
]

export default function AdminPedidos() {
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('ordenes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOrdenes((data ?? []) as Orden[])
        setCargando(false)
      })

    const canal = supabase
      .channel('ordenes-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes' },
        (payload) => {
          setOrdenes((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((o) => o.id !== (payload.old as Orden).id)
            }
            const actualizado = payload.new as Orden
            const existe = prev.some((o) => o.id === actualizado.id)
            if (existe) return prev.map((o) => (o.id === actualizado.id ? actualizado : o))
            return [actualizado, ...prev]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  async function cambiarEstado(id: string, estado: EstadoOrden) {
    setGuardandoId(id)
    await supabase.from('ordenes').update({ estado }).eq('id', id)
    setGuardandoId(null)
  }

  if (cargando) return <p className="text-neutral-500">Cargando pedidos...</p>

  if (ordenes.length === 0) {
    return <p className="text-neutral-400">Todavía no hay pedidos.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {ordenes.map((orden) => (
        <div key={orden.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-neutral-400">{orden.id}</span>
            <select
              value={orden.estado}
              disabled={guardandoId === orden.id}
              onChange={(e) => cambiarEstado(orden.id, e.target.value as EstadoOrden)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            >
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="font-medium text-neutral-700">Productos</p>
              {orden.items.map((item) => (
                <p key={item.producto_id} className="text-neutral-500">
                  {item.cantidad}x {item.nombre}
                </p>
              ))}
              <p className="mt-1 text-neutral-500">
                Subtotal {formatoCLP.format(orden.subtotal)} + envío{' '}
                {formatoCLP.format(orden.costo_envio)} ={' '}
                <span className="font-semibold text-neutral-700">
                  {formatoCLP.format(orden.total)}
                </span>
              </p>
            </div>

            <div>
              <p className="font-medium text-neutral-700">Envío a</p>
              <p className="text-neutral-500">
                {orden.direccion_envio?.nombre} · {orden.direccion_envio?.telefono}
              </p>
              <p className="text-neutral-500">
                {orden.direccion_envio?.calle} {orden.direccion_envio?.numero}
                {orden.direccion_envio?.depto ? `, ${orden.direccion_envio.depto}` : ''}
              </p>
              <p className="text-neutral-500">
                {orden.direccion_envio?.comuna}, {orden.direccion_envio?.region}
              </p>
              <p className="text-neutral-500">{orden.email_contacto}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
