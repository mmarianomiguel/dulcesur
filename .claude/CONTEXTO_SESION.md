# Contexto de Sesión - 27 de Marzo 2026

## Proyecto
Enexpro - Sistema E-commerce + POS para DulceSur (mayorista/minorista)
- **Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase, Cloudinary
- **Deploy**: Vercel (dulcesur.com + sistema.dulcesur.com)
- **Dominio**: dulcesur.com apunta a Vercel (DNS en Hostinger)

## Credenciales Admin
- **Email**: marianomigu3l@gmail.com
- **Contraseña**: Dulcesurmm10%
- **Vendedor ID Mariano Miguel**: 94b3d01c-6be8-4a38-a8f0-c42b6502b19e

## Lo que se hizo (26-27/03/2026)

### Nuevas funcionalidades
- **Autoconsumo familiar** (Stock → Autoconsumo): cards por miembro, PIN, registro retiros a precio costo
- **Página pública autoconsumo** `/autoconsumo/[pin]`: mobile-first, fotos productos, búsqueda, filtros período
- **Anulación autoconsumo visual**: marca como anulado (no borra), tachado + badge ANULADO, devuelve stock
- **Compras pendientes**: "Guardar pendiente" + "Confirmar e ingresar al stock" separados
- **Copiar pedido / WhatsApp**: en compras pendientes y pedidos a proveedores
- **Historial compras en proveedores**: al editar proveedor ve sus últimas 20 compras
- **Teclado numérico POS**: teclas 0-9 + Enter en modal pago efectivo
- **Ordenar clientes**: A-Z, Z-A, Recientes, Mayor deuda
- **Vendedores rediseñado**: cards + detalle ventas + períodos
- **POS pendiente de cobro**: toggle "Cobro al entregar"
- **Numeración unificada**: tienda y POS comparten numerador
- **Creación clientes POS**: igual a Clientes, auto-crea cuenta tienda
- **Login rediseñado**: logo DulceSur, "mayorista de golosinas", diseño oscuro

### Fixes críticos
- **Caja no se resetea por día**: mantiene movimientos desde apertura hasta cierre manual (multi-día)
- **Cancelaciones ≠ egresos**: tipo "cancelacion" en caja_movimientos, separado de gastos reales
- **Números duplicados**: 5 pedidos tienda renumerados (21-25), numerador unificado en 25
- **Precios presentaciones sincronizados**: 50 productos + fix permanente auto-sync
- **"Falta asignar cuenta"**: solo aparece con transferencia real (monto_transferencia > 0)
- **Rentabilidad con descuentos**: usa precio real de venta_items
- **Top 10 sin "Sin cliente"**: excluye consumidor final
- **Vendedores detalle**: campo `numero` en vez de `nro_comprobante`
- **Anular compra pendiente**: no toca stock, solo borra
- **Compras eliminadas al anular**: DELETE en vez de marcar Anulada

### UI/UX
- **22 confirm() nativos** reemplazados con modales shadcn/ui en 14 archivos
- **Cobro CC rediseñado**: sin Tarjeta, botones visuales 💵/🏦
- **Filtros Compras**: Hoy | Esta semana | Este mes | Personalizado (igual que Vendedores)
- **Compras columna Estado**: Confirmada/Pendiente en vez de Pagada
- **Dropdown clientes**: overflow-visible
- **Zonas entrega**: días corregidos, clientes intercambiados
- **Footer**: restaurado sin zonas
- **Filtro vendedores**: "Día" en español
- **Autoconsumo admin**: filas alternadas, fecha+hora en una columna, botón anular con ícono

### Base de datos
- Tablas creadas: `miembros_familia`, `autoconsumo` (con columna `anulado`)
- Constraint `caja_movimientos_tipo_check` actualizado: permite "cancelacion"
- Migración: registros existentes de anulación cambiados a tipo "cancelacion"
- RLS policies en miembros_familia y autoconsumo
- Usuario "prueba" eliminado, email admin cambiado

### Archivos clave modificados
- `src/app/(admin)/admin/caja/page.tsx` — multi-día, cancelaciones
- `src/app/(admin)/admin/compras/page.tsx` — pendientes, filtros, WhatsApp, anulación
- `src/app/(admin)/admin/compras/pedidos/page.tsx` — WhatsApp, copiar pedido
- `src/app/(admin)/admin/vendedores/page.tsx` — rediseño, fix detalle
- `src/app/(admin)/admin/clientes/page.tsx` — cobro rediseñado, ordenar, overflow
- `src/app/(admin)/admin/proveedores/page.tsx` — historial compras
- `src/app/(admin)/admin/stock/autoconsumo/page.tsx` — NUEVA página
- `src/app/autoconsumo/[pin]/page.tsx` — NUEVA página pública
- `src/app/login/page.tsx` — rediseño login
- `src/components/venta-detail-dialog.tsx` — fix cuenta bancaria
- `src/components/sidebar.tsx` — link autoconsumo
- `src/components/tienda/footer.tsx` — restaurado
- `src/services/ventas.ts` — tipo cancelacion
- `src/types/database.ts` — tipo cancelacion
- 14 archivos con confirm() reemplazados

## Pendientes
- Unificar Pedidos con Compras (pedido genera compra pendiente) — EN PROGRESO
- Rediseño presentaciones (inputs grandes, margen editable)
- Separador de miles en algunos inputs faltantes
- Hoja de ruta manual (agregar cualquier pedido, ordenar, mapa)
- Página pública `/autoconsumo/[pin]` — revisar errores
- Rediseño home tienda online (usuario dijo "mejor no" por ahora)
