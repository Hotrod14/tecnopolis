import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCart } from '../context/CartContext'

export default function WebpayRetorno() {
  const [searchParams] = useSearchParams()
  const { clearCart } = useCart()
  const yaLimpiado = useRef(false)

  const estado = searchParams.get('estado')
  const ordenId = searchParams.get('orden')
  const motivo = searchParams.get('motivo')
  const pagado = estado === 'pagado'

  useEffect(() => {
    if (pagado && !yaLimpiado.current) {
      clearCart()
      yaLimpiado.current = true
    }
  }, [pagado, clearCart])

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      {pagado ? (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
            ✓
          </div>
          <h1 className="text-xl font-bold">¡Pago exitoso!</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Tu orden {ordenId ? <span className="font-mono">{ordenId}</span> : ''} fue
            confirmada y el stock fue actualizado.
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">
            ✕
          </div>
          <h1 className="text-xl font-bold">Pago no completado</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {motivo === 'anulado'
              ? 'Anulaste la transacción antes de pagar.'
              : 'Tu pago fue rechazado o no se pudo procesar.'}
          </p>
        </>
      )}

      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Volver a la tienda
      </Link>
    </div>
  )
}
