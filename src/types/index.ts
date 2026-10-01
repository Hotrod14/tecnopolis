export interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  stock: number
  imagen_url: string | null
  peso_kg: number
  alto_cm: number
  ancho_cm: number
  largo_cm: number
  created_at: string
}

export type EstadoOrden =
  | 'pendiente'
  | 'pagado'
  | 'rechazado'
  | 'preparando'
  | 'enviado'
  | 'entregado'

export interface ItemOrden {
  producto_id: string
  nombre: string
  cantidad: number
  precio_unitario: number
}

export interface DireccionEnvio {
  nombre: string
  telefono: string
  email: string
  region: string
  comuna: string
  calle: string
  numero: string
  depto?: string
}

export interface Orden {
  id: string
  total: number
  subtotal: number
  costo_envio: number
  estado: EstadoOrden
  transbank_token: string | null
  items: ItemOrden[]
  direccion_envio: DireccionEnvio
  email_contacto: string
  usuario_id: string | null
  created_at: string
}

export interface OpcionEnvio {
  proveedor: string
  tipoEntrega: string
  tarifa: number
  diasEntrega: string
}

export interface CartItem {
  producto_id: string
  nombre: string
  precio: number
  imagen_url: string | null
  cantidad: number
  stockDisponible: number
}
