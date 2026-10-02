// Validacion de entrada para las Edge Functions: limita el tamano y la
// forma del payload para que una sola peticion no pueda forzar
// consultas o cotizaciones enormes.

export const MAX_BODY_BYTES = 16 * 1024
export const MAX_ITEMS = 20
export const MAX_CANTIDAD = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CarritoItemInput {
  producto_id: string
  cantidad: number
}

export class ErrorValidacion extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

/** Lee el body como JSON respetando un tamano maximo. */
export async function leerJson<T>(req: Request): Promise<T> {
  const largo = Number(req.headers.get('content-length') ?? '0')
  if (largo > MAX_BODY_BYTES) throw new ErrorValidacion('Solicitud demasiado grande.', 413)

  const texto = await req.text()
  if (texto.length > MAX_BODY_BYTES) throw new ErrorValidacion('Solicitud demasiado grande.', 413)

  try {
    return JSON.parse(texto) as T
  } catch {
    throw new ErrorValidacion('JSON invalido.')
  }
}

export function validarItems(items: unknown): CarritoItemInput[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorValidacion('El carrito esta vacio.')
  }
  if (items.length > MAX_ITEMS) {
    throw new ErrorValidacion(`El carrito admite como maximo ${MAX_ITEMS} productos distintos.`)
  }

  const vistos = new Set<string>()
  return items.map((raw) => {
    const item = raw as Partial<CarritoItemInput>
    if (typeof item?.producto_id !== 'string' || !UUID_RE.test(item.producto_id)) {
      throw new ErrorValidacion('Producto invalido en el carrito.')
    }
    if (vistos.has(item.producto_id)) {
      throw new ErrorValidacion('Producto repetido en el carrito.')
    }
    vistos.add(item.producto_id)

    const cantidad = item.cantidad
    if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD) {
      throw new ErrorValidacion(`La cantidad por producto debe estar entre 1 y ${MAX_CANTIDAD}.`)
    }
    return { producto_id: item.producto_id, cantidad }
  })
}

/** Valida que sea string no vacio (si es requerido) y con largo maximo. */
export function validarTexto(valor: unknown, campo: string, max: number, requerido = true): string {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw new ErrorValidacion(`Falta ${campo}.`)
    return ''
  }
  if (typeof valor !== 'string' || valor.length > max) {
    throw new ErrorValidacion(`${campo} invalido.`)
  }
  return valor.trim()
}
