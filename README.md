# Tecnopolis — E-commerce con Transbank Webpay Plus

Stack: React + Vite + Tailwind (Vercel) · Supabase (Postgres, Auth, Edge
Functions, Realtime, Storage).

## ⚠️ Correcciones al blueprint original

- **URL base de Transbank**: el blueprint indicaba `https://transbank.cl`,
  que no es un host válido de la API. Se usa la URL real del ambiente de
  **integración/pruebas**: `https://webpay3gint.transbank.cl` (configurable
  vía `TRANSBANK_BASE_URL` si algún día pasas a producción, cuyo host es
  `https://webpay3g.transbank.cl`).
- **Path de los endpoints**: el blueprint indicaba
  `/rs-webpay-payment/v1.2/transactions`, que tampoco existe. El path real
  es `/rswebpaytransaction/api/webpay/v1.2/transactions`.
- El commerce code y el API key secret de prueba del blueprint son los
  oficiales y públicos de Transbank para el ambiente de integración, así
  que quedaron como valores por defecto en el código (se pueden
  sobrescribir con secrets de Supabase si se prefiere).

## 1. Crear el proyecto en Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta en orden:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_storage.sql`
   - `supabase/migrations/0003_envio_y_cuentas.sql`
   - `supabase/migrations/0004_hardening_ddos.sql`
   - `supabase/migrations/0005_admin_rol_mfa.sql`
   (o usa `supabase db push` con la CLI si tienes el proyecto linkeado).
3. En **Authentication > Users**, crea manualmente el usuario admin y
   asígnale el rol `admin` en `app_metadata` (ver
   [Admin y MFA](#admin-y-mfa)). La migración `0005` ya se lo asigna al
   admin original.

## 2. Variables de entorno del frontend

```bash
cp .env.example .env
```

Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores de
**Settings > API** de tu proyecto.

## 3. Desplegar las Edge Functions

```bash
supabase link --project-ref <tu-project-ref>
supabase functions deploy crear-pago-webpay
supabase functions deploy confirmar-pago-webpay --no-verify-jwt
supabase functions deploy calcular-envio
```

Configura los secrets que usan las funciones (`SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` ya están disponibles automáticamente dentro de
las Edge Functions, no hace falta configurarlos):

```bash
supabase secrets set FRONTEND_URL=https://tu-sitio.vercel.app
# En desarrollo local puedes dejar FRONTEND_URL=http://localhost:5173

# Opcional: API de EnviosChile (https://envioschile.net/docs) para
# cotizar envio en vivo con Starken/Chilexpress/Bluexpress. Sin esto,
# calcular-envio usa una tabla de tarifas propia por zona como fallback.
supabase secrets set ENVIOSCHILE_API_KEY=<tu-api-key>
supabase secrets set ORIGEN_ENVIO=SANTIAGO
```

## 4. Poblar el catálogo inicial (Fake Store API)

El script `scripts/seed.ts` llama a `https://fakestoreapi.com/products`,
mapea los campos a la tabla `productos` (precio USD × 900 → CLP, stock
aleatorio entre 5 y 20) e inserta todo con la Service Role Key.

Agrega a tu `.env` (no confundir con las `VITE_*`, estas las lee el script
de Node, no el navegador):

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Y ejecuta:

```bash
npm run seed
```

## 5. Correr el frontend

```bash
npm install
npm run dev
```

## Flujo de pago

1. `/` lista productos desde `productos` (realtime vía
   `supabase.channel`), con botón deshabilitado si `stock = 0`.
2. `/checkout` llama a la Edge Function `crear-pago-webpay`, que valida
   precios/stock contra la base de datos (nunca confía en el precio que
   manda el navegador), crea la orden `pendiente` y abre la transacción en
   Transbank. El frontend hace un submit automático de un formulario POST
   con `token_ws` hacia la URL que entrega Transbank.
3. Transbank redirige el navegador del cliente (POST) a la Edge Function
   `confirmar-pago-webpay`, que hace el *commit*, y según
   `vci === 'TSY' && status === 'AUTHORIZED'` marca la orden como
   `pagado` (descontando stock de forma atómica vía la función SQL
   `confirmar_orden_pagada`) o `rechazado`. Luego redirige (302) a
   `/webpay-retorno` en el frontend con el resultado en la query string.
4. `/webpay-retorno` limpia el carrito local solo si `estado=pagado`.
5. `/admin` (restringido a usuarios con rol `admin` y MFA verificado) permite editar stock y
   precio en vivo, agregar productos nuevos (con imagen por URL o subida
   a Storage, y peso/dimensiones para el cálculo de envío), y en la
   pestaña **Pedidos** avanzar el estado de cada orden
   (`pagado → preparando → enviado → entregado`).

## Envío a todo Chile

- En `/checkout`, antes de pagar, el cliente completa sus datos de envío
  (nombre, teléfono, correo, región, comuna, dirección) y presiona
  **Calcular envío**. Esto invoca la Edge Function `calcular-envio`, que
  deriva el peso/dimensiones del carrito desde la base de datos (columnas
  `peso_kg`/`alto_cm`/`ancho_cm`/`largo_cm` de `productos`) y cotiza con
  la API de **EnviosChile** (Starken/Chilexpress/Bluexpress). Si no hay
  `ENVIOSCHILE_API_KEY` configurada, o la API falla, cae automáticamente a
  una tabla de tarifas propia por zona (`supabase/functions/_shared/envio.ts`)
  para que el checkout nunca quede bloqueado.
- Se muestran las opciones ordenadas de más barata a más cara (la más
  conveniente queda preseleccionada); el cliente puede elegir otra (ej.
  domicilio en vez de agencia).
- `crear-pago-webpay` **recalcula el costo de envío en el servidor** con
  la misma lógica, nunca confía en un monto que mande el navegador.

### Dirección de envío

- **Buscador de direcciones:** al escribir calle y número, el checkout ofrece direcciones reales y el cliente confirma eligiendo una. Usa [Photon](https://photon.komoot.io), con datos de OpenStreetMap, gratuito y sin clave. Solo se aceptan resultados de Chile cuya comuna exista en la lista oficial (`src/lib/comunas.ts`).
- **Calle sin número:** si el cliente elige una calle sin número, la confirma y escribe el número.
- **Ingreso manual:** si no encuentra su dirección, o si el buscador no responde, puede ingresarla a mano con "No encuentro mi dirección".
- **Registro en el pedido:** cada pedido guarda en `direccion_envio.verificacion` cómo se obtuvo la dirección:

  | Valor | Significado |
  | --- | --- |
  | `completa` | Calle y número vienen del buscador |
  | `calle` | La calle viene del buscador; el número lo escribió el cliente |
  | `manual` | Ingresada a mano |

  También guarda las coordenadas `lat`/`lon`. El admin ve una etiqueta con este estado y un enlace al mapa. Es información de apoyo para el despacho: la envía el navegador, no es una garantía.
- **Uso justo de Photon:** el servidor público de Photon es de uso justo. Para más volumen, monta una instancia propia y define `VITE_PHOTON_URL`.
- **Direcciones guardadas:** el checkout ofrece las direcciones usadas antes. Pueden venir de este navegador o, con sesión iniciada, de pedidos anteriores.

## Cuentas de cliente

- La compra sigue funcionando como invitado (sin cuenta), dejando los
  datos de envío en el checkout.
- `/login` permite crear cuenta o iniciar sesión (Supabase Auth, cuentas
  normales — distintas de la cuenta admin). Si el proyecto tiene activada
  la confirmación por correo (configuración por defecto de Supabase:
  **Authentication > Providers > Email > Confirm email**), hay que
  confirmar el correo antes de poder ingresar.
- Si el cliente está logueado al momento de pagar, la orden queda
  asociada a su cuenta (`ordenes.usuario_id`) y puede verla en
  `/mis-pedidos`, con el estado actualizándose en vivo.

## Seguridad (RLS)

- `productos`: lectura pública; escritura solo para el admin
  (`public.es_admin()`: rol `admin` en `app_metadata` **y** sesión `aal2`).
- `ordenes`: **sin inserción pública** (desde la migración `0004`); solo
  `crear-pago-webpay` crea órdenes, con la Service Role Key. Un
  cliente autenticado puede leer **solo sus propias** órdenes; el admin
  (`public.es_admin()`) puede leer y actualizar **todas**. No hay policy
  de `UPDATE` para clientes — los cambios de estado por pago los hacen
  las Edge Functions con la Service Role Key (que siempre evita RLS), y
  los cambios de estado por envío los hace el admin desde `/admin`.

- Storage (bucket `productos`): lectura pública; subir, reemplazar o
  borrar imágenes solo con `public.es_admin()`.

## Admin y MFA

Desde la migración `0005_admin_rol_mfa.sql` el admin **no** se identifica
por su email: necesita `"role": "admin"` en `app_metadata` **y** haber
verificado un factor TOTP en la sesión actual (`aal2` en el JWT). Las
policies RLS de `productos`, `ordenes` y Storage usan
`public.es_admin()`, que comprueba ambas cosas. Se usa `app_metadata`
porque solo se puede editar con la Service Role Key o SQL; `user_metadata`
lo puede modificar el propio usuario y **nunca** debe usarse para roles.

En el primer login a `/admin` (después de la contraseña y el captcha) el
admin escanea un QR con su app de autenticación (Google Authenticator,
1Password, Authy...) e ingresa el código de 6 dígitos. En los siguientes
logins solo se pide el código.

### Activar TOTP

En **Supabase > Authentication > Multi-Factor** activa **TOTP (App
Authenticator)**. Sin esto el enrolamiento falla y nadie puede llegar a
`aal2`.

### Dar o quitar el rol admin

En **SQL Editor**:

```sql
-- Dar rol admin
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email = 'nuevo-admin@ejemplo.cl';

-- Quitar rol admin
update auth.users
   set raw_app_meta_data = raw_app_meta_data - 'role'
 where email = 'ex-admin@ejemplo.cl';
```

El JWT solo refleja el cambio después de refrescarse: el usuario debe
**cerrar sesión y volver a entrar**. Al quitar el rol, el token vigente
sigue siendo válido hasta que expira (1 hora por defecto); para cortarlo
de inmediato, cierra sus sesiones desde **Authentication > Users >
usuario > Sign out user** (o borra el usuario).

### Recuperación

- Recomendado: registrar un **segundo factor TOTP de respaldo** (otro
  dispositivo o un gestor de contraseñas) y guardarlo en un lugar seguro.
- Si se pierden todos los factores: en **Authentication > Users >
  usuario > MFA** borra el factor; en el siguiente login a `/admin` se
  vuelve a enrolar un TOTP nuevo.

### Orden de despliegue

1. Activar TOTP en el dashboard (**Authentication > Multi-Factor**).
2. Desplegar el frontend en Vercel.
3. Aplicar la migración `0005_admin_rol_mfa.sql`.
4. El admin cierra sesión, vuelve a entrar en `/admin` y enrola su TOTP.

Entre (3) y (4) el admin no puede editar nada (su sesión es `aal1` y/o
su JWT aún no trae el rol); es lo esperado.

## Protección anti-abuso / DDoS (capa 7)

Los ataques volumétricos (capas 3/4) los absorben Vercel y la red de
Supabase. Lo que protege este repo es el abuso a nivel de aplicación:

| Medida | Dónde |
| --- | --- |
| Órdenes solo vía Edge Function (sin insert público) | `0004_hardening_ddos.sql` |
| Rate limit por IP y global (tabla `rate_limits` + `check_rate_limit`) | `0004` + `_shared/rateLimit.ts` |
| Validación de payload: máx. 16 KB, 20 productos, 1–10 unidades, UUIDs, largos de texto | `_shared/validacion.ts` |
| Captcha Cloudflare Turnstile en pago, login y registro (opcional) | `_shared/turnstile.ts`, `src/components/Turnstile.tsx` |
| Caché de 10 min de cotizaciones de EnviosChile + timeouts a APIs externas | `_shared/envio.ts`, `_shared/transbank.ts` |
| CORS restringido a los orígenes del frontend | `_shared/cors.ts` |
| Errores internos genéricos (no se filtran mensajes de la BD) | `_shared/respuesta.ts` |
| Expiración automática de órdenes `pendiente` (>1 h) y limpieza de contadores (pg_cron) | `0004` |
| Tienda paginada (24 por página) y realtime sin recargar todo el catálogo | `src/pages/Tienda.tsx` |
| Headers de seguridad y caché de assets | `vercel.json` |

Límites por defecto:

- `calcular-envio`: 20/min por IP, 600/min global.
- `crear-pago-webpay`: 5/min y 30/h por IP, 120/min global.
- `confirmar-pago-webpay`: 30/min por IP.

### Pasos de configuración

1. Ejecuta `supabase/migrations/0004_hardening_ddos.sql` (requiere la
   extensión **pg_cron**, disponible en todos los planes de Supabase).
2. Redespliega las tres Edge Functions.
3. Restringe CORS:
   ```bash
   supabase secrets set ALLOWED_ORIGINS=https://tu-sitio.vercel.app,http://localhost:5173
   ```
4. Captcha (recomendado):
   1. En Cloudflare > **Turnstile** crea un sitio con tu dominio de Vercel
      (y `localhost` para desarrollo).
   2. Frontend (Vercel > Environment Variables y `.env`):
      `VITE_TURNSTILE_SITE_KEY=<site key>`
   3. Edge Functions: `supabase secrets set TURNSTILE_SECRET_KEY=<secret key>`
   4. Supabase > **Authentication > Attack Protection** > activa
      *Captcha protection* con proveedor Turnstile y la misma secret key.
   Mientras estas claves no estén configuradas, el captcha queda
   desactivado y todo sigue funcionando.
5. En Vercel > **Firewall** activa reglas de rate limit y deja a mano
   *Attack Challenge Mode* para emergencias.
6. En Supabase > **Usage** configura alertas y el *spend cap*.

> Nota: el rate limit identifica la IP con `cf-connecting-ip` /
> `x-real-ip` / `x-forwarded-for`. Si las IPs registradas en
> `rate_limits` se ven todas iguales o falsificables, ajusta
> `ipCliente()` en `_shared/rateLimit.ts`.
