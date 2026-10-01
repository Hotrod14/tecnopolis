// Puebla la tabla `productos` de Supabase con datos de Fake Store API
// (https://fakestoreapi.com), mapeando sus campos a nuestro esquema y
// asignando a cada producto un stock aleatorio entre 5 y 20 unidades.
//
// Uso:
//   node --env-file=.env scripts/seed.ts
//
// Requiere en .env:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (la service role key se usa aqui para
//                                 saltarse RLS; nunca debe exponerse
//                                 en el frontend)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const USD_TO_CLP = 900

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Define ambos en tu .env antes de ejecutar el seed.',
  )
  process.exit(1)
}

interface FakeStoreProduct {
  id: number
  title: string
  description: string
  price: number
  image: string
}

function randomStock(): number {
  return Math.floor(Math.random() * (20 - 5 + 1)) + 5
}

async function main() {
  console.log('Obteniendo productos desde fakestoreapi.com...')
  const res = await fetch('https://fakestoreapi.com/products')
  if (!res.ok) {
    throw new Error(`Fake Store API respondio ${res.status}`)
  }
  const productos = (await res.json()) as FakeStoreProduct[]

  const filas = productos.map((p) => ({
    nombre: p.title,
    descripcion: p.description,
    precio: Math.round(p.price * USD_TO_CLP),
    imagen_url: p.image,
    stock: randomStock(),
  }))

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

  console.log(`Insertando ${filas.length} productos en Supabase...`)
  const { error, count } = await supabase
    .from('productos')
    .insert(filas, { count: 'exact' })

  if (error) {
    throw error
  }

  console.log(`Listo: se insertaron ${count ?? filas.length} productos.`)
}

main().catch((err) => {
  console.error('Fallo el seed:', err)
  process.exit(1)
})
