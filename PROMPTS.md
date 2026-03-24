# PROMPTS DE MANTENIMIENTO - DULCESUR/ENEXPRO

---

## PROMPT 1: ENCONTRAR Y ARREGLAR ERRORES (Dejar listo para producción)

```
Sos un desarrollador senior Full-Stack especializado en Next.js + Supabase.
Estás trabajando en el sistema Dulcesur (Enexpro): un ERP con POS + Ecommerce para un mayorista/minorista argentino.

STACK: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Supabase (PostgreSQL + Auth) + Stripe + Cloudinary + jsPDF + XLSX
DEPLOY: Vercel (sistema.dulcesur.com)
REPO: github.com/mmarianomiguel/dulcesur
TIMEZONE: America/Argentina/Buenos_Aires
MONEDA: ARS (formato $1.234,56)
IVA: NO se discrimina (precios con IVA incluido)
STOCK NEGATIVO: PERMITIDO (el dueño factura antes de cargar compras)

═══════════════════════════════════════════════════════════════
ESTRUCTURA DEL PROYECTO
═══════════════════════════════════════════════════════════════

ADMIN (/src/app/(admin)/admin/):
- page.tsx → Dashboard (gráficos ventas, métricas, reportes)
- ventas/page.tsx → POS (punto de venta con búsqueda, barcode, presentaciones)
- ventas/listado/page.tsx → Historial y Pedidos (ventas POS + online unificadas)
- ventas/hoja-ruta/page.tsx → Hojas de ruta para entregas
- ventas/nota-credito/page.tsx → Notas de crédito
- ventas/nota-debito/page.tsx → Notas de débito
- ventas/remitos/page.tsx → Remitos
- clientes/page.tsx → ABM clientes + cuenta corriente + cobros
- productos/page.tsx → Catálogo + presentaciones + descuentos integrados
- productos/editar-precios/page.tsx → Edición masiva de precios
- productos/descuentos/page.tsx → Gestión de descuentos
- productos/lista-precios/page.tsx → Generación PDF lista de precios
- caja/page.tsx → Apertura/cierre + movimientos
- compras/page.tsx → Compras a proveedores
- compras/reposicion/page.tsx → Reposición automática
- stock/ajustes/page.tsx → Ajustes de stock
- reportes/ → Reportes y resúmenes
- configuracion/ → Config empresa + tienda + white-label

TIENDA ONLINE (/src/app/(tienda)/):
- page.tsx → Home con categorías y productos destacados
- productos/page.tsx → Catálogo con filtros
- productos/[id]/page.tsx → Detalle de producto
- carrito/page.tsx → Carrito (localStorage)
- checkout/page.tsx → Checkout con envío + pago
- cuenta/ → Mi cuenta (perfil, direcciones, pedidos)

SERVICIOS (/src/services/):
- base.ts → CRUD genérico sobre Supabase
- productos.ts → Productos, categorías, presentaciones
- ventas.ts → Ventas, caja, numeradores
- clientes.ts → Clientes, zonas entrega

LIBS (/src/lib/):
- supabase.ts → Cliente browser Supabase
- formatters.ts → Formato moneda/fecha Argentina
- constants.ts → Constantes (formas pago, tipos comprobante)
- audit.ts → Log de auditoría

API (/src/app/api/):
- usuarios/route.ts → CRUD usuarios con Supabase Auth
- upload/route.ts → Upload imágenes a Cloudinary
- pull/route.ts → Webhook deploy automático

═══════════════════════════════════════════════════════════════
TABLAS PRINCIPALES EN SUPABASE
═══════════════════════════════════════════════════════════════

- empresa → Config empresa, datos fiscales, white-label
- usuarios → Usuarios con roles (admin, vendedor)
- productos → Catálogo (nombre, código, precio, costo, stock, stock_minimo, stock_maximo, categoria_id, marca_id, imagen_url, activo, visibilidad, es_combo)
- presentaciones → Variantes de producto (nombre, cantidad, precio, costo, codigo, producto_id)
- categorias / subcategorias / marcas → Clasificación
- clientes → Datos completos + saldo + limite_credito
- clientes_auth → Auth para tienda online
- cliente_direcciones → Direcciones de envío
- proveedores → Proveedores con saldo
- ventas → Cabecera ventas (numero, fecha, cliente_id, forma_pago, subtotal, descuento_porcentaje, recargo_porcentaje, total, monto_efectivo, monto_transferencia, estado, entregado, origen, metodo_entrega)
- venta_items → Detalle items (producto_id, descripcion, cantidad, precio_unitario, subtotal, descuento, presentacion, unidades_por_presentacion)
- pedidos_tienda → Pedidos online (numero, estado, metodo_entrega, metodo_pago, subtotal, total, monto_efectivo, monto_transferencia, recargo_transferencia)
- pedido_tienda_items → Items pedido online
- compras / compra_items → Compras a proveedores
- caja_movimientos → Movimientos de caja (tipo: ingreso/egreso, metodo_pago, monto, referencia_id, referencia_tipo)
- turnos_caja → Apertura/cierre de caja
- cuenta_corriente → Historial CC por cliente
- cobros → Registro de cobros a clientes
- stock_movimientos → Auditoría de cambios de stock
- numeradores → Numeración secuencial de comprobantes
- descuentos → Descuentos por producto/categoría/marca
- precio_historial → Historial de cambios de precio
- audit_logs → Log de auditoría general
- tienda_config → Configuración de la tienda online
- cuentas_bancarias → Cuentas para transferencias (propias + proveedores)

═══════════════════════════════════════════════════════════════
PATRONES CLAVE DEL CÓDIGO
═══════════════════════════════════════════════════════════════

1. Todos los page.tsx usan "use client" (Client Components)
2. Queries directas a Supabase desde componentes (no server actions)
3. Estado local con useState + useEffect para fetch
4. Presentaciones: producto base (Unidad) + cajas (x6, x10, x12, x14, x16, etc.)
5. Precio caja en DB puede ser: precio total O precio unitario (si es igual al base, multiplicar por cantidad)
6. Descuentos: por producto, por categoría, por marca, con cantidad_minima y presentación específica
7. Pago mixto: Efectivo + Transferencia + Cuenta Corriente (cualquier combinación)
8. Recargo transferencia: configurable en tienda_config.recargo_transferencia (%)
9. Stock se decrementa con RPC decrementar_stock_venta (atómico)
10. Numeración con RPC next_numero (por tipo: venta, pedido, etc.)

═══════════════════════════════════════════════════════════════
INSTRUCCIONES
═══════════════════════════════════════════════════════════════

TU MISIÓN: Encontrar y arreglar TODOS los errores del sistema.

PROCESO:
1. Abrí sistema.dulcesur.com en Chrome y navegá CADA sección
2. Probá CADA funcionalidad: crear venta POS, pedido online, cobro, ajuste stock, etc.
3. Revisá la consola del navegador buscando errores
4. Revisá el código fuente buscando bugs lógicos
5. Verificá que los cálculos sean correctos (subtotales, recargos, descuentos, stock)
6. Verificá que la DB tenga constraints correctos (no UNIQUE donde no debe haber)

ÁREAS CRÍTICAS A REVISAR:
- POS: agregar items, presentaciones, descuentos, pago mixto, recargo transferencia
- Checkout tienda: precios correctos de cajas, pago mixto, recargo, stock
- Listado ventas: cards interactivas, estados de entrega, imprimir remito
- Dashboard: totales correctos, no duplicar ventas POS+online
- Caja: apertura/cierre, movimientos, balance
- Clientes: saldo CC, límite crédito, cobros
- Hoja de ruta: pedidos online con envío, cobro, entrega
- Productos: editar precios (costo → precio automático), margen editable, descuentos

REGLAS CRÍTICAS:
- NO romper funcionalidades existentes
- NO eliminar código sin reemplazar
- NO cambiar lógica de negocio sin consultar
- Mantener compatibilidad con datos actuales
- Siempre hacer build antes de push
- Commitear y pushear después de cada fix

FORMATO DE REPORTE:
Para cada error encontrado:
1. DÓNDE: archivo + línea
2. QUÉ: descripción del bug
3. POR QUÉ: causa raíz
4. CÓMO: fix aplicado
5. IMPACTO: qué se arregló
```

---

## PROMPT 2: RESTABLECER SISTEMA (Primer uso / Demo limpia)

```
Sos un desarrollador senior. Necesito restablecer el sistema Dulcesur (Enexpro) como si fuera el PRIMER USO.

STACK: Next.js 16 + Supabase + Vercel
REPO: github.com/mmarianomiguel/dulcesur
DB: Supabase (proyecto oepqhdjuujfdlpjjktbs)

═══════════════════════════════════════════════════════════════
QUÉ HACER
═══════════════════════════════════════════════════════════════

PASO 1: LIMPIAR DATOS DE PRUEBA (Supabase SQL)
Ejecutar en el SQL Editor de Supabase en ESTE ORDEN (respeta las FK):

-- 1. Eliminar items dependientes
TRUNCATE pedido_tienda_items CASCADE;
TRUNCATE venta_items CASCADE;
TRUNCATE compra_items CASCADE;
TRUNCATE stock_movimientos CASCADE;
TRUNCATE cuenta_corriente CASCADE;
TRUNCATE cobros CASCADE;
TRUNCATE caja_movimientos CASCADE;

-- 2. Eliminar cabeceras
TRUNCATE pedidos_tienda CASCADE;
TRUNCATE ventas CASCADE;
TRUNCATE compras CASCADE;
TRUNCATE turnos_caja CASCADE;

-- 3. Eliminar auditoría y historial
TRUNCATE audit_logs CASCADE;
TRUNCATE precio_historial CASCADE;

-- 4. Resetear numeradores
UPDATE numeradores SET ultimo_numero = 0;

-- 5. Resetear saldos de clientes
UPDATE clientes SET saldo = 0;

-- 6. Resetear saldos de proveedores
UPDATE proveedores SET saldo = 0;

-- 7. Resetear stock a 0 (OPCIONAL - si querés empezar sin stock)
-- UPDATE productos SET stock = 0;

-- 8. Eliminar descuentos de prueba (OPCIONAL)
-- TRUNCATE descuentos CASCADE;

PASO 2: VERIFICAR FUNCIONES RPC
Asegurarse de que existen las funciones:
- next_numero(p_tipo text) → genera números secuenciales
- decrementar_stock_venta(p_items jsonb) → decrementa stock atómicamente

PASO 3: VERIFICAR CONSTRAINTS
Asegurarse de que NO existan UNIQUE constraints incorrectos:
-- Esto NO debe tener UNIQUE en producto_id (un pedido puede tener 2 items del mismo producto)
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'pedido_tienda_items' AND constraint_type = 'UNIQUE';
-- Si aparece pedido_tienda_item_producto_id_key, eliminarlo:
-- ALTER TABLE pedido_tienda_items DROP CONSTRAINT IF EXISTS pedido_tienda_item_producto_id_key;

PASO 4: VERIFICAR RLS POLICIES
-- Clientes auth solo pueden leer, no modificar datos admin:
-- Los anon users solo pueden INSERT en pedidos_tienda y pedido_tienda_items
-- Los anon users solo pueden SELECT en productos, categorias, presentaciones, descuentos

PASO 5: CONFIGURACIÓN INICIAL
En el panel admin (/admin/configuracion):
1. Cargar datos de empresa (nombre, dirección, teléfono, CUIT)
2. Configurar tienda online (días entrega, recargo transferencia, monto mínimo)
3. Cargar cuentas bancarias (alias, CBU/CVU, titular)
4. Configurar footer (WhatsApp, redes sociales)
5. Personalizar colores (white-label)

PASO 6: DATOS INICIALES
1. Cargar categorías y subcategorías
2. Cargar marcas
3. Cargar productos con precios y presentaciones
4. Cargar clientes principales
5. Cargar proveedores

PASO 7: VERIFICAR TODO
Probar en este orden:
1. ✅ Login admin funciona
2. ✅ Dashboard carga sin errores
3. ✅ POS: buscar producto, agregar, cobrar efectivo → venta creada
4. ✅ POS: venta con transferencia → recargo aplicado
5. ✅ POS: venta mixto → montos correctos
6. ✅ POS: venta cuenta corriente → saldo cliente actualizado
7. ✅ Tienda: registro cliente → login → agregar al carrito → checkout
8. ✅ Tienda: pedido con efectivo → aparece en admin
9. ✅ Tienda: pedido con transferencia → recargo correcto
10. ✅ Tienda: pedido mixto → desglose correcto
11. ✅ Caja: abrir → cerrar → diferencia correcta
12. ✅ Stock: venta reduce stock, compra aumenta
13. ✅ Lista precios PDF: genera correctamente
14. ✅ Remito: se puede imprimir desde pedido online

═══════════════════════════════════════════════════════════════
NOTAS IMPORTANTES
═══════════════════════════════════════════════════════════════

- NO borrar la tabla productos ni clientes si ya tienen datos reales
- NO borrar usuarios de Supabase Auth
- NO modificar funciones RPC sin backup
- El stock negativo está PERMITIDO (el dueño factura antes de cargar compras)
- IVA NO se discrimina (todos los precios incluyen IVA)
- Timezone SIEMPRE Argentina (America/Argentina/Buenos_Aires)
- Moneda SIEMPRE ARS con formato argentino
```

---

## PROMPT 3: CONTEXTO RÁPIDO (Para cualquier sesión nueva)

```
Estoy trabajando en Dulcesur (sistema.dulcesur.com) - un ERP con POS + Ecommerce.

STACK: Next.js 16 + React 19 + TypeScript + Tailwind 4 + Supabase + Stripe + Cloudinary
REPO LOCAL: C:\Users\N3yck\Desktop\Proyectos Claude\enexpro
GITHUB: github.com/mmarianomiguel/dulcesur
DEPLOY: Vercel (auto-deploy en push a main)
SUPABASE: proyecto oepqhdjuujfdlpjjktbs

Lee CLAUDE.md para entender la estructura completa del proyecto.
Siempre hacé build (npx next build) antes de push.
Siempre commiteá y pusheá los cambios.
Usá Chrome (sistema.dulcesur.com) para verificar en producción.
Timezone Argentina, moneda ARS, IVA incluido en precios.
```
