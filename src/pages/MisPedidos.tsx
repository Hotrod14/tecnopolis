import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatoCLP, formatoFecha, idCorto } from '../lib/format'
import { COLOR_ESTADO, ETIQUETA_ESTADO } from '../lib/estados'
import type { Orden } from '../types'

export default function MisPedidos() {
  const { session, loading } = useAuth()
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!session) return

    supabase
      .from('ordenes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOrdenes((data ?? []) as Orden[])
        setCargando(false)
      })

    const canal = supabase
      .channel('mis-pedidos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ordenes',
          filter: `usuario_id=eq.${session.user.id}`,
        },
        (payload) => {
          setOrdenes((prev) => {
            const actualizado = payload.new as Orden
            if (payload.eventType === 'DELETE') {
              return prev.filter((o) => o.id !== (payload.old as Orden).id)
            }
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
  }, [session])

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Mis pedidos</h1>

      {cargando && <p className="text-neutral-500">Cargando tus pedidos...</p>}

      {!cargando && ordenes.length === 0 && (
        <div className="text-center text-neutral-500">
          <p>Todavía no tienes pedidos.</p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Ir a la tienda
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {ordenes.map((orden) => (
          <div key={orden.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" title={orden.id}>
                  Pedido #{idCorto(orden.id)}
                </p>
                <p className="text-xs text-neutral-500">{formatoFecha.format(new Date(orden.created_at))}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${COLOR_ESTADO[orden.estado]}`}
              >
                {ETIQUETA_ESTADO[orden.estado]}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-1 text-sm text-neutral-600">
              {orden.items.map((item) => (
                <div key={item.producto_id} className="flex justify-between">
                  <span>{item.cantidad}x {item.nombre}</span>
                  <span>{formatoCLP.format(item.precio_unitario * item.cantidad)}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-neutral-100 pt-3 text-sm">
              <div className="flex justify-between text-neutral-500">
                <span>Subtotal</span>
                <span>{formatoCLP.format(orden.subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Envío ({orden.direccion_envio?.comuna})</span>
                <span>{formatoCLP.format(orden.costo_envio)}</span>
              </div>
              <div className="mt-1 flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatoCLP.format(orden.total)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
