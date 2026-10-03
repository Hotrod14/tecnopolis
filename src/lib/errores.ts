// Supabase Auth devuelve los errores en ingles; aqui se traducen los
// mas comunes para mostrarlos al usuario.
const TRADUCCIONES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/captcha/i, 'No pudimos verificar el captcha. Inténtalo de nuevo.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'],
  [/invalid totp|invalid mfa|code.*(invalid|expired)/i, 'Código incorrecto o vencido. Revisa tu app de autenticación.'],
  [/failed to fetch|network/i, 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'],
]

export function traducirError(mensaje: string): string {
  for (const [patron, traduccion] of TRADUCCIONES) {
    if (patron.test(mensaje)) return traduccion
  }
  return mensaje
}
