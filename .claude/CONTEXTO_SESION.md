# CONTEXTO DE SESION - DulceSur/Enexpro
## Fecha: 24/03/2026

---

## RESUMEN GENERAL
Sistema de facturación + POS + Ecommerce para mayorista/minorista DulceSur.
Stack: Next.js 16 + TypeScript + Supabase + Cloudinary
Deploy: Vercel → sistema.dulcesur.com
Repo: https://github.com/mmarianomiguel/dulcesur

---

## LO QUE SE HIZO HOY (30+ commits)

### FASES 1-4 COMPLETAS
1. Búsqueda global (Ctrl+K) - productos, clientes, ventas
2. Alertas stock bajo en dashboard
3. Reimprimir último comprobante en POS
4. Cierre de caja obligatorio
5. Auditoría de cambios de precio (precio_historial)
6. Límite de crédito por cliente
7. Historial de precios visual (timeline)
8. Cobro parcial en cuenta corriente
9. Recibo imprimible de cobro
10. Ranking de clientes con filtros
11. Rentabilidad por producto
12. Comparativa mensual

### MEJORAS PRODUCTOS
- Editar producto: costo recalcula precio manteniendo margen
- Margen % es input editable
- Presentaciones se sincronizan automáticamente
- Descuentos integrados en edición de producto
- Historial de precios visual (timeline con colores)
- 5 pestañas: Información | Precios | Descuentos | Stock | Historial

### MEJORAS VENTAS/PEDIDOS
- Vista unificada POS + Tienda online con filtros
- Cards interactivas con estados clickeables
- Desglose de pago mixto (efectivo + transferencia)
- Asignar cuenta bancaria a pedidos con transferencia
- Imprimir remito desde detalle
- Estados simplificados: Pendiente → Armado → Entregado → Completado → Cancelado

### TIENDA ONLINE
- Checkout requiere cuenta (login/registro obligatorio)
- Descuentos por volumen visibles
- Pantalla de éxito con botón WhatsApp
- Botón WhatsApp envía mensaje al negocio (1162991571)
- Fix: precio de cajas se guarda correctamente
- "Medio Cartón" se muestra correcto para cigarros

### PROVEEDORES
- Rediseño completo con 11 campos nuevos
- Secciones: Datos principales, Contacto, Dirección, Condiciones comerciales
- Cuentas bancarias vinculables (alias propio o de proveedor)
- Exportar Excel

### LISTA DE PRECIOS PDF
- 3 modos de agrupación (sin cat / por cat / por subcat)
- Columna CAJA con cantidad y descuento
- Logo más grande, subcategorías de la DB
- Selector de categorías a incluir/excluir

### EDITAR PRECIOS
- Edición masiva con preview
- Redondeo a múltiplos de 5 o 10 (más cercano/arriba/abajo)
- Costos con decimales
- Dialog post-guardado: "¿Imprimir carteles de precios?"
- Navega a Lista de Precios con productos pre-seleccionados

### SEGURIDAD
- RLS: anon no puede UPDATE clientes
- Lock optimista en saldo CC
- Tabla cobros creada
- UNIQUE constraint en ventas.numero (compuesto con punto_venta)
- Headers de seguridad en middleware

---

## IMPORTACIÓN DE DATOS (HOY)
- Se vació la DB (productos, clientes, ventas, etc.)
- Se importaron 1029 productos desde 2 Excels fusionados
- 313 productos con presentación de caja
- 29 cigarros con presentación "Medio Cartón" (cantidad 0.5)
- 7 categorías, 40 subcategorías, 127 marcas creadas
- 17 proveedores creados y vinculados a productos
- 24 imágenes de cigarros subidas a Cloudinary
- Costos actualizados con decimales (sin redondear)

## CREDENCIALES
- Supabase URL: https://oepqhdjuujfdlpjjktbs.supabase.co
- Supabase Service Role: en .env
- Cloudinary: cloud=dss3lnovd, key=875629828189924, secret=i9YlVSjAN6ZxrjyOGxtZLfdQ-HE
- WhatsApp negocio: 1162991571

---

## PENDIENTE PARA MAÑANA

### CRÍTICO
1. **Descuento automático por caja** - Si precio_caja < precio_unitario × cantidad → mostrar descuento automático en tienda y POS (ej: Guaymallén caja más barata que unidad × 40)
2. **Ingreso mercadería mejorado** - Columnas Cajas + Unidades sueltas, precio caja visible, mejor buscador con presentaciones

### BUGS CONOCIDOS
3. Checkout tienda: pago mixto/transferencia puede mostrar montos incorrectos en el resumen
4. Estados de entrega en listado: verificar que se guardan bien para pedidos online
5. Total facturado en listado: puede flashear al cargar

### MEJORAS PEDIDAS
6. Compras/ingreso mercadería: rediseño con cajas + unidades sueltas + precio caja
7. Confirmación de compra: más datos (items, cuenta bancaria, factura proveedor)
8. Imágenes: faltan subir las de dulcesur.com (excepto cigarros que ya están)
9. Tienda online: WhatsApp flotante, filtro por marca, skeleton loading, carrito mini
10. Admin: Dashboard gráfico ventas del día, accesos rápidos, notificaciones campana
11. Admin: Calendario entregas, alertas precios proveedor, tags productos, vista rápida

### DISEÑO
12. Rediseño checkout tienda (steps visuales)
13. Mejor diseño de productos relacionados (swipe mobile)

---

## ARCHIVOS CLAVE MODIFICADOS
- src/app/(admin)/admin/productos/page.tsx - Editar producto con 5 tabs
- src/app/(admin)/admin/productos/editar-precios/page.tsx - Edición masiva + redondeo
- src/app/(admin)/admin/productos/lista-precios/page.tsx - PDF con agrupación
- src/app/(admin)/admin/ventas/page.tsx - POS
- src/app/(admin)/admin/ventas/listado/page.tsx - Historial y pedidos unificado
- src/app/(admin)/admin/ventas/hoja-ruta/page.tsx - Hoja de ruta
- src/app/(admin)/admin/proveedores/page.tsx - Proveedores rediseñado
- src/app/(admin)/admin/clientes/page.tsx - Clientes con CC
- src/app/(admin)/admin/page.tsx - Dashboard
- src/app/(tienda)/checkout/page.tsx - Checkout tienda
- src/app/(tienda)/producto/[slug]/page.tsx - Página de producto
- src/components/global-search.tsx - Ctrl+K
- src/components/image-upload.tsx - Upload imágenes

## EXCEL REVISIÓN
- C:\Users\N3yck\Desktop\DulceSur_datos_completos.xlsx (Productos + Proveedores + Clientes)
- C:\Users\N3yck\Desktop\productos_fusion_revision.xlsx (Fusión original)

## ÚLTIMO COMMIT
d53382c - Feature: dialog post-guardado ofrece imprimir carteles de precios modificados
