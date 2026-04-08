# Sistema de Notificaciones - Diseño

## Resumen

Sistema centralizado de notificaciones push y in-app para todos los roles (clientes, admin, vendedores). Incluye plantillas editables con variables, segmentación de audiencia, preferencias por cliente, historial con campanita, y envío desde hoja de ruta.

---

## Modelo de datos

### Tablas nuevas

**`notificacion_plantillas`** - Plantillas configurables desde el admin
- `id` (uuid, PK)
- `nombre` (text) - ej: "Pedido en camino"
- `titulo_template` (text) - ej: "Tu pedido #{{numero}} está en camino"
- `mensaje_template` (text) - ej: "Estimado {{cliente}}, tu pedido sale hoy"
- `tipo` (text) - pedido | promocion | recordatorio | catalogo | cuenta_corriente | sistema
- `destinatario_default` (text) - cliente | admin | vendedor | todos
- `activa` (boolean)
- `variables_disponibles` (jsonb) - ej: ["numero", "cliente", "total"]
- `created_at`, `updated_at` (timestamptz)

**`notificaciones`** - Cada notificación enviada
- `id` (uuid, PK)
- `plantilla_id` (uuid, FK nullable) - null si es notificación manual libre
- `titulo` (text)
- `mensaje` (text)
- `tipo` (text)
- `url` (text, nullable) - a dónde navega al hacer click
- `enviada_por` (uuid, FK usuarios)
- `segmentacion` (jsonb) - ej: `{tipo: "zona", valor: "Sur"}` o `{tipo: "todos"}`
- `created_at` (timestamptz)

**`notificacion_destinatarios`** - Relación notificación → destinatario
- `id` (uuid, PK)
- `notificacion_id` (uuid, FK)
- `cliente_id` (uuid, FK nullable)
- `usuario_id` (uuid, FK nullable)
- `leida` (boolean, default false)
- `leida_at` (timestamptz, nullable)
- `push_enviada` (boolean, default false)
- `push_error` (text, nullable)
- `created_at` (timestamptz)

**`notificacion_preferencias`** - Preferencias por cliente
- `id` (uuid, PK)
- `cliente_id` (uuid, FK)
- `tipo` (text) - pedido | promocion | recordatorio | catalogo | cuenta_corriente
- `push_enabled` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)

### Tabla existente modificada

**`push_subscriptions`** - Agregar campo:
- `cliente_id` (uuid, FK nullable) - para diferenciar suscripciones de clientes vs usuarios admin

### Limpieza automática
- Los registros en `notificacion_destinatarios` se filtran por `created_at > now() - interval '5 days'` en todas las queries del cliente
- Las notificaciones desaparecen del dropdown y del historial del cliente después de 5 días

---

## Admin - Sección Notificaciones

Nueva sección en el sidebar con ícono de campanita.

### `/admin/notificaciones` (dashboard)
- Notificaciones enviadas hoy
- Suscriptores activos
- Tasa de lectura
- Accesos directos a sub-páginas

### `/admin/notificaciones/plantillas`
- Tabla: nombre, tipo, destinatario, estado (activa/inactiva)
- CRUD con editor de título y mensaje
- Variables disponibles como chips clickeables que se insertan en el texto
- Toggle activa/inactiva desde la tabla

### `/admin/notificaciones/enviar`
- Selector de plantilla (opcional, puede ser libre)
- Editor de título y mensaje (pre-rellenado si eligió plantilla)
- Segmentación:
  - Todos los clientes
  - Cliente específico (buscador)
  - Por zona de entrega (dropdown)
  - Por rol (admin, vendedor, repartidor)
  - Por inactividad (clientes que no compran hace X días)
- Preview de cantidad de destinatarios
- Botón "Enviar" con confirmación

### `/admin/notificaciones/historial`
- Tabla: fecha, título, tipo, destinatarios, leídas/total, enviada por
- Click en fila → detalle con lista de destinatarios y estado (enviada, leída, error)

### `/admin/notificaciones/configuracion`
- Toggles globales por tipo de notificación
- Configuración de automáticas (ej: carrito abandonado después de X horas)

---

## Hoja de Ruta - Notificar clientes

En `/admin/ventas/hoja-ruta`:

- Botón "Enviar notificaciones" en la cabecera de la hoja de ruta
- Envía "Pedido en camino" a todos los clientes de la hoja
- Usa la plantilla correspondiente con variables reemplazadas
- Resumen previo: "Se notificará a X clientes" con lista
- Estado post-envío: éxito / fallidas / sin push
- Botón cambia a "Notificaciones enviadas ✓" para evitar duplicados

---

## Tienda Online - Lado del cliente

### Campanita en TiendaNavbar
- Ícono de campana junto al carrito
- Badge rojo con contador de no leídas
- Click → dropdown con últimas 10 notificaciones
- Cada una muestra: título, mensaje truncado, tiempo relativo
- Click marca como leída y navega a la URL
- Link "Ver todas" → `/cuenta/notificaciones`

### `/cuenta/notificaciones`
Nueva sub-página en "Mi Cuenta":

**Sección Preferencias:**
- Toggle general de push notifications
- Toggles por categoría: Pedidos, Promociones, Recordatorios, Novedades, Cuenta corriente
- Si el navegador no soporta push, mensaje explicativo con botón para solicitar permiso

**Sección Historial:**
- Lista de notificaciones recibidas (últimos 5 días), más recientes primero
- No leídas con fondo destacado
- Botón "Marcar todas como leídas"
- Paginación

### Registro de push subscription
- Al activar por primera vez, pide permiso del navegador
- Guarda suscripción en `push_subscriptions` con `cliente_id`
- Al desactivar todo, elimina la suscripción

---

## API Routes

### Nuevas rutas

**`POST /api/notificaciones/enviar`** - Enviar notificación
- Recibe: titulo, mensaje, segmentacion, plantilla_id (opcional), url (opcional)
- Resuelve destinatarios según segmentación
- Filtra por preferencias del cliente (respeta toggles)
- Crea registros en `notificaciones` + `notificacion_destinatarios`
- Envía push a los que tienen suscripción activa
- Devuelve resumen: enviadas, fallidas, sin push

**`GET /api/notificaciones/cliente`** - Notificaciones del cliente logueado
- Filtra por `cliente_id`, últimos 5 días
- Incluye conteo de no leídas

**`PATCH /api/notificaciones/leer`** - Marcar como leída(s)
- Recibe: `notificacion_destinatario_id` o `todas`

**`GET/PUT /api/notificaciones/preferencias`** - Preferencias del cliente
- GET: preferencias actuales
- PUT: actualizar toggles

**`CRUD /api/notificaciones/plantillas`** - ABM de plantillas (solo admin)

### Rutas existentes
- `/api/push/subscribe` - Se mantiene, se usa internamente
- `/api/push/send` - Se mantiene para envío bajo nivel
- `/api/push/caja-reminder` - Se mantiene como está
