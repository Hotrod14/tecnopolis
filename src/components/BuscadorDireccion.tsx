import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { MIN_CARACTERES, buscarDirecciones, type SugerenciaDireccion } from '../lib/geocoder'

const ESPERA_MS = 350

// Campo con sugerencias de direcciones mientras se escribe (combobox
// accesible: flechas, Enter y Escape; anunciado por lectores de pantalla).
export default function BuscadorDireccion({
  onElegir,
  onNoEncuentro,
}: {
  onElegir: (sugerencia: SugerenciaDireccion) => void
  onNoEncuentro: () => void
}) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState<SugerenciaDireccion[]>([])
  const [estado, setEstado] = useState<'inactivo' | 'buscando' | 'listo' | 'error'>('inactivo')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(-1)
  const ultimaConsulta = useRef<AbortController | null>(null)

  const consulta = texto.trim()

  useEffect(() => {
    if (consulta.length < MIN_CARACTERES) return
    const timer = setTimeout(() => {
      ultimaConsulta.current?.abort()
      const controller = new AbortController()
      ultimaConsulta.current = controller
      setEstado('buscando')
      buscarDirecciones(consulta, controller.signal)
        .then((r) => {
          setSugerencias(r)
          setActivo(r.length ? 0 : -1)
          setEstado('listo')
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setEstado('error')
        })
    }, ESPERA_MS)
    return () => clearTimeout(timer)
  }, [consulta])

  useEffect(() => () => ultimaConsulta.current?.abort(), [])

  function cambiarTexto(valor: string) {
    setTexto(valor)
    setAbierto(true)
    if (valor.trim().length < MIN_CARACTERES) {
      ultimaConsulta.current?.abort()
      setSugerencias([])
      setEstado('inactivo')
    }
  }

  function elegir(s: SugerenciaDireccion) {
    setAbierto(false)
    setTexto('')
    setSugerencias([])
    setEstado('inactivo')
    onElegir(s)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      setActivo((i) => Math.min(i + 1, sugerencias.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Enter no debe enviar el formulario mientras se elige.
      if (abierto && sugerencias[activo]) {
        e.preventDefault()
        elegir(sugerencias[activo])
      } else if (abierto) {
        e.preventDefault()
      }
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  const mostrarLista = abierto && consulta.length >= MIN_CARACTERES && estado !== 'inactivo'
  const idLista = `${id}-lista`

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-label="Buscar dirección"
        aria-expanded={mostrarLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrarLista && activo >= 0 ? `${id}-op-${activo}` : undefined}
        autoComplete="off"
        placeholder="Ej: Diagonal Paraguay 160, Santiago"
        value={texto}
        onChange={(e) => cambiarTexto(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />

      {mostrarLista && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
          <ul id={idLista} role="listbox" aria-label="Direcciones sugeridas">
            {sugerencias.map((s, i) => (
              <li
                key={s.id}
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={i === activo}
                // mousedown en vez de click: se dispara antes del blur del input.
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(s)
                }}
                onMouseEnter={() => setActivo(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === activo ? 'bg-neutral-100' : ''}`}
              >
                <span className="block font-medium">
                  {s.calle} {s.numero ?? <span className="font-normal text-neutral-400">(sin número)</span>}
                </span>
                <span className="block text-xs text-neutral-500">
                  {s.comuna}, {s.region}
                </span>
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="px-3 py-2 text-xs text-neutral-500 empty:hidden">
            {estado === 'buscando' && sugerencias.length === 0 && 'Buscando...'}
            {estado === 'listo' && sugerencias.length === 0 && 'No encontramos esa dirección. Prueba con calle, número y comuna.'}
            {estado === 'error' && 'El buscador no está disponible ahora.'}
          </p>
          <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 text-xs">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                setAbierto(false)
                onNoEncuentro()
              }}
              className="font-medium text-neutral-900 underline"
            >
              No encuentro mi dirección
            </button>
            <span className="text-neutral-400">Datos © OpenStreetMap</span>
          </div>
        </div>
      )}
    </div>
  )
}
