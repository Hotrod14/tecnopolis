import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function NuevoProductoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [stock, setStock] = useState('')
  const [pesoKg, setPesoKg] = useState('1')
  const [altoCm, setAltoCm] = useState('20')
  const [anchoCm, setAnchoCm] = useState('20')
  const [largoCm, setLargoCm] = useState('15')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [imagenUrl, setImagenUrl] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)

    try {
      let urlFinal = imagenUrl.trim()

      if (archivo) {
        const path = `${Date.now()}-${archivo.name}`
        const { error: uploadError } = await supabase.storage
          .from('productos')
          .upload(path, archivo)
        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('productos').getPublicUrl(path)
        urlFinal = data.publicUrl
      }

      const { error: insertError } = await supabase.from('productos').insert({
        nombre,
        descripcion,
        precio: Number(precio),
        stock: Number(stock),
        imagen_url: urlFinal || null,
        peso_kg: Number(pesoKg),
        alto_cm: Number(altoCm),
        ancho_cm: Number(anchoCm),
        largo_cm: Number(largoCm),
      })

      if (insertError) throw insertError

      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el producto.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Nuevo producto</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            required
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Descripción"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <input
              required
              type="number"
              min={0}
              placeholder="Precio (CLP)"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min={0}
              placeholder="Stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="URL de imagen (opcional si subes un archivo)"
            value={imagenUrl}
            onChange={(e) => setImagenUrl(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-sm"
          />

          <p className="mt-1 text-xs text-neutral-500">
            Peso y dimensiones (se usan para cotizar el envío)
          </p>
          <div className="flex gap-2">
            <input
              required
              type="number"
              min={0.1}
              step={0.1}
              placeholder="Peso (kg)"
              value={pesoKg}
              onChange={(e) => setPesoKg(e.target.value)}
              className="w-1/4 rounded-md border border-neutral-300 px-2 py-2 text-sm"
            />
            <input
              required
              type="number"
              min={1}
              placeholder="Alto (cm)"
              value={altoCm}
              onChange={(e) => setAltoCm(e.target.value)}
              className="w-1/4 rounded-md border border-neutral-300 px-2 py-2 text-sm"
            />
            <input
              required
              type="number"
              min={1}
              placeholder="Ancho (cm)"
              value={anchoCm}
              onChange={(e) => setAnchoCm(e.target.value)}
              className="w-1/4 rounded-md border border-neutral-300 px-2 py-2 text-sm"
            />
            <input
              required
              type="number"
              min={1}
              placeholder="Largo (cm)"
              value={largoCm}
              onChange={(e) => setLargoCm(e.target.value)}
              className="w-1/4 rounded-md border border-neutral-300 px-2 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:bg-neutral-400"
            >
              {guardando ? 'Guardando...' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
