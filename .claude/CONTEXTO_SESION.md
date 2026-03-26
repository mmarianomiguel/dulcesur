# Contexto de Sesión - 26 de Marzo 2026

## Proyecto
Enexpro - Sistema E-commerce + POS para DulceSur (mayorista/minorista)
- **Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase, Cloudinary
- **Deploy**: Vercel (dulcesur.com + sistema.dulcesur.com)
- **Dominio**: dulcesur.com apunta a Vercel (DNS en Hostinger configurados hoy)

## Lo que se hizo hoy (26/03/2026)

### Scanner de código de barras (POS)
- Reescrito completamente el handler del scanner
- Usa fase de captura (`addEventListener("keydown", handler, true)`) para interceptar antes que React
- Cooldown de 800ms después de cada escaneo para evitar contaminar inputs
- Si estás en un input, los dígitos pasan normal (no bloquea edición de cantidad)
- Toast verde al escanear producto + toast amarillo si no se encuentra
- `addItem` usa `setItems((prev) => ...)` funcional para evitar stale closure al escanear rápido

### Sincronización de precios Producto ↔ Presentación
- **50 productos** tenían precios desincronizados entre tabla `productos` y `presentaciones` (Unidad)
- Se sincronizaron todos vía API
- **Fix permanente**: al editar producto (`handleSave`), auto-sincroniza presentación Unidad
- **Fix en importación Excel**: también sincroniza al importar
- **Pérdida de $2.500** en pedido de Mónica Maidana por precios viejos de Bolsas Arranque

### Pedidos tienda online - Cobro y Caja
- **Retiro en local**: NO registra en caja al momento del pedido — se cobra desde listado/dashboard
- **Envío**: solo registra transferencia al momento; efectivo se cobra al entregar
- **Panel de cobro**: estilo POS (Efect./Transf./Mixto/Cta Cte) en:
  - Listado de ventas (detalle del pedido)
  - Dashboard (al marcar entregado)
  - Hoja de ruta (ya existía)
- El panel muestra **monto pendiente** (total - ya pagado en caja - CC)
- Cuenta Corriente se suma al calcular "ya pagado" para no mostrar botón cobrar si ya está en CC

### POS - Pendiente de cobro
- Nuevo toggle "Cobro al entregar" (en vez de 5to botón)
- Cuando activo: no registra pago, estado="pendiente", metodo_entrega="envio"
- Requiere cliente seleccionado
- Stock SÍ se descuenta (reserva)
- Aparece en hoja de ruta para cobrar al entregar

### Numeración unificada
- Tienda online ahora usa numerador `venta` (mismo que POS)
- Antes usaba `pedido` → causaba números duplicados (00001-00000002 repetido)
- Próximo número: 00001-00000021

### Creación de clientes
- Formulario POS idéntico al de Clientes (mismo layout, mismos campos)
- Auto-crea cuenta de tienda online si tiene email + DNI (contraseña = DNI)
- Vendedor por defecto: Mariano Miguel (ID: 94b3d01c-6be8-4a38-a8f0-c42b6502b19e)
- Endpoint: `/api/auth/tienda` action `create-from-admin`
- Clientes registrados desde la web también tienen vendedor_id = Mariano Miguel

### Dashboard optimizado
- Queries de 6 meses en paralelo (antes secuencial)
- Productos + clientes + proveedores en paralelo
- POS: combo_items + descuentos + presentaciones en paralelo
- Pedidos retiro aparecen en tab "Hoy" (antes quedaban invisibles)

### Vendedores - Rediseño completo
- Vista principal: cards por vendedor con nombre, comisión %, ventas, comisión estimada
- Selector de periodo: Hoy | Esta semana | Este mes | Personalizado
- Click en card → detalle con tabla de ventas individuales
- **Notas de Crédito restan** de la comisión del vendedor
- NC hereda vendedor_id de la venta original
- Ventas anuladas no cuentan (filtro `neq("estado", "anulada")`)
- Ahora incluye TODAS las ventas (no solo "cerrada")

### Productos - Mejoras
- **Visibilidad**: badge "Oculto" clickeable en listado para hacer visible
- **Menú "Tienda online"**: reemplaza los 2 botones feos por dropdown con opciones:
  - Ocultar sin stock / Mostrar ocultos con stock / Mostrar ocultos sin stock / Mostrar todos
- **Presentaciones rediseñadas**: cards con inputs grandes, margen % editable, precio por unidad en cajas
  - Unidad representada por las 3 cards de Costo/Precio/Margen (no duplicada en presentaciones)
  - Cajas con mismo estilo visual (3 cards Costo/Precio/Margen + extras compactos)
- **Compras**: detecta combos ocultos que contienen productos comprados
  - Dialog rediseñado con checkboxes, separación Productos/Combos, seleccionar todos/ninguno
- **Historial agrupado**: movimientos de combos agrupados por orden_id en una sola card

### Tienda online
- Precio por caja: "📦 5% OFF por Caja x24" (ya existía, se mejoró)
- Fix localStorage corrupto: carrito de web vieja era objeto, no array → validación Array.isArray
- Footer: UUIDs de categorías corregidos
- Mi cuenta/Pedidos/Direcciones: redirigen a login si no está logueado
- Letra de productos en comprobantes reducida 2px

### Fixes varios
- Cuenta bancaria NO aparece en Mixto sin transferencia (fix Diego Surbano)
- Boleta Mixto muestra desglose completo (efectivo + transferencia desde pedidos_tienda)
- Medio cartón muestra 0.5 en boletas
- Hoja de ruta: selector cuenta bancaria muestra nombre/alias, no UUID
- Nota de crédito: selector comprobante origen muestra nombre, no UUID
- Select dropdown z-index 200 + max-height 300px (fix para dialogs)
- Reportes ordenados por hora (created_at desc)
- Error handling: try-catch en dashboard fetchAll + confirmDelivery
- cliente_id incluido en select de ventas online

### Base de datos
- Tabla `precio_historial` existe y funciona (6 registros)
- Clientes de prueba eliminados (base limpia)
- Vendedores inactivos filtrados del POS

## Pendientes / Para hacer después
- Rediseño página de inicio tienda (usuario dijo "mejor no lo hagas" por ahora)
- 30 productos sin imagen (upload manual)
- Imágenes viejas en Cloudinary (carpetas "productos/" y "avatar/") NO borrar hasta que diga
- Verificar dominio dulcesur.com en Vercel (DNS propagando)

## Credenciales / IDs importantes
- **Supabase URL**: oepqhdjuujfdlpjjktbs.supabase.co
- **Cloudinary**: cloud dss3lnovd, folder "dulcesur/"
- **Mariano Miguel ID**: 94b3d01c-6be8-4a38-a8f0-c42b6502b19e
- **Logo negro**: https://res.cloudinary.com/dss3lnovd/image/upload/v1774505786/dulcesur/logo-dulcesur-negro.jpg

## Archivos clave modificados hoy
- `src/app/(admin)/admin/ventas/page.tsx` — POS (scanner, addItem, pendiente cobro, crear cliente)
- `src/app/(admin)/admin/ventas/listado/page.tsx` — panel cobro, cuenta bancaria fix
- `src/app/(admin)/admin/page.tsx` — dashboard (cobro, optimización, retiro en hoy)
- `src/app/(admin)/admin/productos/page.tsx` — presentaciones, visibilidad, historial agrupado
- `src/app/(admin)/admin/compras/page.tsx` — combos ocultos, dialog rediseñado
- `src/app/(admin)/admin/vendedores/page.tsx` — rediseño completo
- `src/app/(admin)/admin/ventas/nota-credito/page.tsx` — NC hereda vendedor, fix selector
- `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` — cuenta bancaria nombre
- `src/app/(tienda)/checkout/page.tsx` — retiro no registra caja, numerador unificado
- `src/app/(tienda)/productos/page.tsx` — Array.isArray fix, precio caja
- `src/app/api/auth/tienda/route.ts` — create-from-admin, vendedor default
- `src/components/tienda/cart-drawer.tsx` — Array.isArray fix
- `src/components/tienda/footer.tsx` — UUIDs categorías, links cuenta
- `src/components/receipt-print-view.tsx` — medio cartón 0.5, font size
- `src/components/ui/select.tsx` — z-index 200, max-height 300px
