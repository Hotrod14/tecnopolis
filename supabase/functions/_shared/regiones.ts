// Las 16 regiones oficiales de Chile. Se usan para el selector del
// frontend y para la tabla de tarifas propia (fallback de envio).
// IMPORTANTE: si cambias este archivo, replica el cambio en
// src/lib/regiones.ts (son dos runtimes distintos -- Deno vs Vite --
// asi que no se pueden compartir directamente).

export type ZonaEnvio = 'RM' | 'CENTRO' | 'CENTRO_SUR' | 'NORTE' | 'SUR_EXTREMO'

export const REGIONES_CHILE: { nombre: string; zona: ZonaEnvio }[] = [
  { nombre: 'Arica y Parinacota', zona: 'NORTE' },
  { nombre: 'Tarapacá', zona: 'NORTE' },
  { nombre: 'Antofagasta', zona: 'NORTE' },
  { nombre: 'Atacama', zona: 'NORTE' },
  { nombre: 'Coquimbo', zona: 'NORTE' },
  { nombre: 'Valparaíso', zona: 'CENTRO' },
  { nombre: 'Metropolitana de Santiago', zona: 'RM' },
  { nombre: "Libertador General Bernardo O'Higgins", zona: 'CENTRO' },
  { nombre: 'Maule', zona: 'CENTRO' },
  { nombre: 'Ñuble', zona: 'CENTRO' },
  { nombre: 'Biobío', zona: 'CENTRO_SUR' },
  { nombre: 'La Araucanía', zona: 'CENTRO_SUR' },
  { nombre: 'Los Ríos', zona: 'CENTRO_SUR' },
  { nombre: 'Los Lagos', zona: 'SUR_EXTREMO' },
  { nombre: 'Aysén del General Carlos Ibáñez del Campo', zona: 'SUR_EXTREMO' },
  { nombre: 'Magallanes y de la Antártica Chilena', zona: 'SUR_EXTREMO' },
]

export function zonaDeRegion(nombreRegion: string): ZonaEnvio {
  const region = REGIONES_CHILE.find((r) => r.nombre === nombreRegion)
  return region?.zona ?? 'RM'
}
