import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formatoCLP, formatoFecha, idCorto } from '../../lib/format'
import { COLOR_ESTADO, ETIQUETA_ESTADO } from '../../lib/estados'
import { useToast } from '../../context/ToastContext'
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
  const toast = useToast()

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

  async function cambiarEstado(orden: Orden, estado: EstadoOrden) {
    setGuardandoId(orden.id)
    // Con RLS un update sin permiso no da error, solo no afecta filas.
    const { data, error } = await supabase
      .from('ordenes')
      .update({ estado })
      .eq('id', orden.id)
      .select('id')
    setGuardandoId(null)

    if (error || !data?.length) {
      toast.error(
        error?.message ??
          'No se guardó el cambio. Tu sesión de administrador puede haber expirado: vuelve a ingresar.',
      )
      return
    }
    setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? { ...o, estado } : o)))
    toast.exito(`Pedido #${idCorto(orden.id)}: ${ETIQUETA_ESTADO[estado].toLowerCase()}.`)
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
            <div>
              <p className="text-sm font-semibold" title={orden.id}>
                Pedido #{idCorto(orden.id)}
              </p>
              <p className="text-xs text-neutral-500">{formatoFecha.format(new Date(orden.created_at))}</p>
            </div>
            <select
              value={orden.estado}
              disabled={guardandoId === orden.id}
              aria-label={`Estado del pedido ${idCorto(orden.id)}`}
              onChange={(e) => cambiarEstado(orden, e.target.value as EstadoOrden)}
              className={`rounded-full border-0 px-3 py-1 text-xs font-medium disabled:opacity-50 ${COLOR_ESTADO[orden.estado]}`}
            >
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ESTADO[estado]}
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
              <p className="flex flex-wrap items-center gap-2 font-medium text-neutral-700">
                Envío a <EtiquetaVerificacion orden={orden} />
              </p>
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
              {orden.direccion_envio?.lat != null && orden.direccion_envio?.lon != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${orden.direccion_envio.lat}&mlon=${orden.direccion_envio.lon}#map=18/${orden.direccion_envio.lat}/${orden.direccion_envio.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium underline"
                >
                  Ver en el mapa
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const VERIFICACION: Record<string, { texto: string; clase: string; ayuda: string }> = {
  completa: {
    texto: 'Dirección verificada',
    clase: 'bg-green-100 text-green-700',
    ayuda: 'Calle y número elegidos desde el buscador de direcciones.',
  },
  calle: {
    texto: 'Número sin verificar',
    clase: 'bg-amber-100 text-amber-700',
    ayuda: 'La calle viene del buscador; el número lo escribió el cliente.',
  },
  manual: {
    texto: 'Dirección sin verificar',
    clase: 'bg-red-100 text-red-700',
    ayuda: 'El cliente no encontró su dirección en el buscador y la escribió a mano.',
  },
}

function EtiquetaVerificacion({ orden }: { orden: Orden }) {
  // Pedidos anteriores al buscador no traen este dato.
  const v = orden.direccion_envio?.verificacion
  if (!v || !VERIFICACION[v]) return null
  const { texto, clase, ayuda } = VERIFICACION[v]
  return (
    <span title={ayuda} className={`rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}>
      {texto}
    </span>
  )
}
