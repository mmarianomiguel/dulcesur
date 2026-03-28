# Contexto de Sesión - 27-28 de Marzo 2026

## Proyecto
Enexpro - Sistema E-commerce + POS para DulceSur (mayorista/minorista)
- **Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase, Cloudinary
- **Deploy**: Vercel (dulcesur.com + sistema.dulcesur.com)
- **Dominio**: dulcesur.com apunta a Vercel (DNS en Hostinger)

## Credenciales
- **Admin**: marianomigu3l@gmail.com / Dulcesurmm10%
- **Mariano Miguel ID**: 94b3d01c-6be8-4a38-a8f0-c42b6502b19e
- **Supabase URL**: oepqhdjuujfdlpjjktbs.supabase.co
- **Cloudinary**: cloud dss3lnovd, folder "dulcesur/"
- **Logo negro**: https://res.cloudinary.com/dss3lnovd/image/upload/v1774505786/dulcesur/logo-dulcesur-negro.jpg

## Lo que se hizo (27-28/03/2026)

### Nuevas funcionalidades
- **Autoconsumo familiar** (Stock → Autoconsumo): cards por miembro, registro retiros a costo, link público mobile `/autoconsumo/[pin]` con filtros Hoy/Semana/Mes, animación éxito, anulación visual (tachado)
- **Compras pendientes**: "Guardar pendiente" + "Confirmar ingreso al stock" separados
- **Pedidos unificados con Compras**: al guardar pedido "Enviado" crea compra Pendiente automáticamente. Al recibir mercadería, compra se actualiza a Confirmada
- **Pedidos - Pedir hasta máximo**: selector "Hasta máximo" / "Hasta mínimo". Resuelve cigarros (mín=0, máx=10, stock=3 → pide 7)
- **Copiar pedido / WhatsApp**: en compras pendientes y pedidos a proveedores
- **Historial de compras en proveedores**: últimas 20 compras con click al detalle
- **Teclado numérico POS**: modal pago efectivo acepta teclas 0-9 + Enter
- **Ordenar clientes**: A-Z, Z-A, Recientes, Mayor deuda
- **Toggle "Cobro al entregar"** en POS: reemplaza 5to botón "Pend."
- **Login rediseñado**: logo DulceSur, "mayorista de golosinas", diseño oscuro

### Fixes críticos
- **Cancelaciones ≠ egresos**: nuevo tipo "cancelacion" en caja. Egresos = gastos reales, cancelaciones = ventas anuladas/NC
- **Números duplicados**: 5 pedidos tienda renumerados (21-25). Numerador unificado POS+tienda
- **NC en hoja de ruta**: ya NO aparecen como entregas. NCs no cuentan como "cobrado" sino como reducción de deuda
- **NC detalle**: solo muestra productos devueltos (cantidad > 0), no toda la lista
- **Vendedores detalle**: ventas ahora se muestran (arreglado columna `hora` inexistente → usa `created_at`)
- **Dashboard NCs**: NCs se restan de ventas totales, excluidas de ganancia y gráfico mensual
- **Precios presentaciones sincronizados**: 50 productos + fix permanente en edición, Excel, editar-precios
- **"Precio actualizado" badge**: ahora se guarda `precio_anterior` + `fecha_actualizacion` desde TODOS los flujos de edición de precio
- **"Falta asignar cuenta"**: ya no aparece en ventas sin transferencia
- **Cuenta bancaria unificada**: "dulcesur10" → "Brubank" en todos los registros. Siempre guarda `nombre` no `alias`
- **Checkout online**: ahora guarda `cuenta_bancaria` en caja_movimientos
- **Anular compra pendiente**: no toca stock, solo borra
- **Comprobante desde dashboard**: vendedor "Mariano Miguel" (no "Pedido Online"), dirección completa desde pedidos_tienda
- **Búsqueda sin acentos**: normaliza tildes (Jésica = Jesica) en clientes
- **Rentabilidad con descuentos**: usa precio real de venta, no de lista
- **Top 10 sin "Sin cliente"**: excluye consumidor final

### UI/UX
- **22 confirm() nativos** reemplazados con modales shadcn/ui en 14 archivos
- **Cobro CC rediseñado**: sin Tarjeta, solo Efectivo/Transferencia, botones visuales
- **Filtros "Hoy|Semana|Mes|Personalizado"**: implementados en Compras y Vendedores
- **Vendedores "day" → "Día"**: traducido
- **Zonas de entrega**: días corregidos (Z1=Lun-Sáb, Z2=Lun-Mié-Vie), clientes intercambiados
- **Footer**: restaurado sin zonas (zonas solo en Info/Envíos)
- **Dropdown clientes**: overflow-visible
- **Compras columna Estado**: en vez de "Pago"
- **Stock bajo**: eliminado del dashboard

### Base de datos
- Tabla `miembros_familia` + `autoconsumo` creadas
- Columna `anulado` en `autoconsumo` (para anulación visual)
- Usuario "prueba" eliminado, Santiago eliminado
- Compras anuladas borradas de DB
- caja_movimientos: todos "dulcesur10" → "Brubank"
- Numerador venta actualizado a 25+ (unificado)

## Pendientes para próxima sesión
1. **Filtros unificados** en TODAS las páginas (Reportes, Caja, Historial ventas) — mismo diseño "Hoy|Semana|Mes|Personalizado"
2. **Separador de miles** en inputs de monto que todavía no lo tienen
3. **Rediseño presentaciones** — inputs más grandes, margen % editable, caja auto-calc
4. **Hoja de ruta manual** — agregar cualquier pedido, ordenar drag&drop, punto partida el local
5. **Búsqueda sin acentos** — aplicar en los 30+ archivos restantes (solo hecho en clientes)
6. **Pedido #27 Jésica**: entregado sin cobrar ($49.760 - NC $7.150 = $42.610 pendiente). Registrar cobro o resolver
7. **Cobro de CC** — verificar que descuenta correctamente del saldo del cliente
8. **Migración caja_movimientos**: ejecutar SQL `UPDATE caja_movimientos SET tipo = 'cancelacion' WHERE tipo = 'egreso' AND referencia_tipo IN ('anulacion', 'nota_credito');` (necesita check constraint en DB)

## Archivos clave modificados
- `src/app/(admin)/admin/ventas/page.tsx` — POS (scanner, pendiente cobro, teclado numérico)
- `src/app/(admin)/admin/ventas/listado/page.tsx` — NC pagos, CC fix, cuenta bancaria nombre
- `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` — NC excluidas, cobrado vs NC separado
- `src/app/(admin)/admin/ventas/nota-credito/page.tsx` — detalle solo items devueltos
- `src/app/(admin)/admin/page.tsx` — dashboard (NC resta, comprobante fix, optimización)
- `src/app/(admin)/admin/caja/page.tsx` — cancelacion tipo, cuenta nombre
- `src/app/(admin)/admin/productos/page.tsx` — precio_anterior en edición
- `src/app/(admin)/admin/productos/editar-precios/page.tsx` — precio_anterior + fecha_actualizacion en 3 flujos
- `src/app/(admin)/admin/compras/page.tsx` — filtros, compras pendientes editables
- `src/app/(admin)/admin/compras/pedidos/page.tsx` — hasta máximo/mínimo, sin "Recibir mercadería", crear compra pendiente
- `src/app/(admin)/admin/vendedores/page.tsx` — rediseño cards, detalle ventas, hora fix
- `src/app/(admin)/admin/proveedores/page.tsx` — historial compras
- `src/app/(admin)/admin/clientes/page.tsx` — búsqueda sin acentos, orden
- `src/app/(admin)/admin/stock/autoconsumo/page.tsx` — admin autoconsumo
- `src/app/autoconsumo/[pin]/page.tsx` — link público mobile
- `src/app/(tienda)/checkout/page.tsx` — cuenta_bancaria en caja
- `src/app/(admin)/admin/reportes/resumen-mensual/page.tsx` — rentabilidad con descuentos, top 10 sin "sin cliente"
- `src/app/login/page.tsx` — rediseño
- 14 archivos con confirm() → Dialog modal

## Cuentas bancarias
- **Brubank** (alias: dulcesur10) — propia, Mariano Miguel
- **Mercado Pago** (alias: almacenmariano) — propia, Alberto Miguel
- **Banco Credicoop** (alias: pameli.bz) — proveedor Pameli SA
- SIEMPRE guardar `nombre` no `alias` en caja_movimientos
