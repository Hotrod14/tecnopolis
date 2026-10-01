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
   (o usa `supabase db push` con la CLI si tienes el proyecto linkeado).
3. En **Authentication > Users**, crea manualmente el usuario admin con
   email `ce2full@gmail.com` (el que las políticas RLS reconocen como
   administrador).

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
5. `/admin` (restringido a `ce2full@gmail.com`) permite editar stock y
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

- `productos`: lectura pública; escritura solo para el usuario autenticado
  `ce2full@gmail.com`.
- `ordenes`: inserción pública solo en estado `pendiente` (y con
  `usuario_id` nulo o igual al del usuario autenticado que la crea). Un
  cliente autenticado puede leer **solo sus propias** órdenes; el admin
  (`ce2full@gmail.com`) puede leer y actualizar **todas**. No hay policy
  de `UPDATE` para clientes — los cambios de estado por pago los hacen
  las Edge Functions con la Service Role Key (que siempre evita RLS), y
  los cambios de estado por envío los hace el admin desde `/admin`.
