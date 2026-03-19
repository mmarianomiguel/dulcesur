# Enexpro - Sistema Ecommerce + POS

## Qué es
Sistema integrado de ecommerce y punto de venta (POS) para negocio mayorista/minorista (Dulcesur). Tiene dos interfaces: panel admin/POS y tienda online para clientes.

## Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Next.js API Routes, Supabase (PostgreSQL + Auth + Realtime)
- **Integraciones**: Stripe (pagos), Cloudinary (imágenes), jsPDF (recibos), XLSX (Excel)
- **Deploy**: VPS con webhook de git pull automático

## Estructura del proyecto
```
/src
├── app/
│   ├── (admin)/admin/          # Panel administrativo y POS
│   │   ├── page.tsx            # Dashboard con analytics
│   │   ├── caja/               # Gestión de caja (movimientos, apertura/cierre)
│   │   ├── clientes/           # ABM clientes, saldo, cuenta corriente
│   │   ├── compras/            # Órdenes de compra a proveedores
│   │   ├── configuracion/      # Config empresa, tienda, roles, white-label
│   │   ├── productos/          # Catálogo, categorías, marcas, presentaciones
│   │   ├── proveedores/        # ABM proveedores
│   │   ├── reportes/           # Reportes de ventas, resúmenes mensuales
│   │   ├── stock/              # Ajustes de stock, movimientos
│   │   ├── usuarios/           # Gestión de usuarios y roles
│   │   └── ventas/             # Módulo principal de ventas
│   │       ├── listado/        # Listado de ventas con filtros
│   │       ├── carga-manual/   # Carga manual de pedidos
│   │       ├── hoja-ruta/      # Hojas de ruta para entregas
│   │       ├── nota-credito/   # Notas de crédito
│   │       ├── nota-debito/    # Notas de débito
│   │       ├── remitos/        # Remitos
│   │       ├── facturacion-lote/ # Facturación en lote
│   │       └── entregas-pendientes/ # Entregas pendientes
│   ├── (tienda)/               # Tienda online (cliente final)
│   │   ├── page.tsx            # Home de la tienda
│   │   ├── productos/          # Catálogo público
│   │   ├── carrito/            # Carrito de compras
│   │   ├── checkout/           # Proceso de checkout
│   │   ├── cuenta/             # Mi cuenta (perfil, direcciones, pedidos)
│   │   └── info/[slug]/        # Páginas informativas dinámicas
│   ├── api/
│   │   ├── usuarios/route.ts   # CRUD usuarios (Supabase Auth)
│   │   ├── upload/route.ts     # Upload imágenes a Cloudinary
│   │   ├── pull/route.ts       # Webhook git pull para deploy
│   │   └── fix-bug/route.ts    # Endpoint para fixes automáticos
│   └── login/                  # Login con Supabase Auth
├── components/
│   ├── ui/                     # Componentes shadcn/ui (button, input, dialog, etc.)
│   ├── tienda/                 # Componentes de la tienda (navbar, footer, cart-drawer)
│   ├── sidebar.tsx             # Sidebar del admin
│   ├── data-table.tsx          # Tabla reutilizable con filtros y paginación
│   ├── receipt-print-view.tsx  # Vista de impresión de recibos
│   └── image-upload.tsx        # Upload de imágenes
├── services/
│   ├── base.ts                 # Servicio CRUD genérico sobre Supabase
│   ├── productos.ts            # Lógica de productos, categorías, marcas
│   ├── ventas.ts               # Ventas, caja, cuenta corriente
│   ├── clientes.ts             # Clientes y zonas de entrega
│   └── index.ts
├── hooks/
│   ├── use-white-label.ts      # Tema dinámico (colores, logo)
│   ├── use-async-data.ts       # Fetch de datos con loading/error
│   ├── use-dialog.ts           # Estado de diálogos
│   └── use-pagination.ts       # Paginación
├── types/
│   └── database.ts             # Interfaces TypeScript de todas las tablas
├── lib/
│   ├── supabase.ts             # Cliente Supabase (browser + server)
│   ├── formatters.ts           # Formateo de fechas, moneda, números
│   ├── constants.ts            # Constantes (métodos de pago, tipos factura, IVA)
│   └── utils.ts                # Utilidades generales
└── middleware.ts               # Protección de rutas /admin (redirige a /login)
```

## Base de datos (Supabase PostgreSQL)
Tablas principales:
- **empresa**: Config de la empresa, datos fiscales, white-label, defaults
- **usuarios**: Usuarios del sistema con roles
- **productos**: Catálogo con SKU, precios, costos, stock, unidades
- **categorias / marcas**: Clasificación de productos
- **presentaciones**: Variantes de producto (distintas unidades/precios)
- **clientes**: Datos completos, situación IVA, zona de entrega, saldo
- **proveedores**: Proveedores con saldo
- **ventas / venta_items**: Cabecera y detalle de ventas
- **compras / compra_items**: Cabecera y detalle de compras
- **caja_movimientos**: Movimientos de caja (ingresos/egresos)
- **cuenta_corriente**: Historial de transacciones por cliente
- **zona_entrega**: Zonas de entrega con días configurables
- **stock_movimientos**: Auditoría de cambios de stock
- **numeradores**: Numeración secuencial de comprobantes

## Funcionalidades implementadas

### Admin/POS
- Dashboard con gráficos de ventas y revenue (Recharts)
- POS con búsqueda rápida, escaneo de código de barras, conversión automática de unidades a cajas
- Gestión completa de ventas: listado, carga manual, notas de crédito/débito, remitos, hojas de ruta
- Facturación en lote y entregas pendientes
- Gestión de clientes con cuenta corriente y cobranzas
- Gestión de stock con ajustes y movimientos
- Compras a proveedores
- Caja: apertura/cierre, movimientos, múltiples medios de pago (Efectivo, Transferencia, Mixto, Cuenta Corriente)
- Reportes: resumen mensual, ventas por vendedor
- Configuración: datos empresa, personalización tienda, roles y permisos
- White-label: color primario dinámico, logo, nombre de app
- Generación de recibos PDF e impresión
- Export a Excel

### Tienda Online
- Catálogo de productos con categorías
- Carrito con persistencia local
- Checkout con zonas de entrega
- Mi cuenta: perfil, direcciones, historial de pedidos
- Páginas informativas dinámicas

## API Routes
- `POST /api/usuarios` - Crear usuario (Supabase Auth + tabla)
- `DELETE /api/usuarios` - Desactivar usuario (soft delete)
- `POST /api/upload` - Subir imagen a Cloudinary
- `POST /api/pull` - Webhook para git pull (deploy automático, requiere x-pull-secret)

## Variables de entorno requeridas
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_PASSWORD
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
PULL_SECRET
```

## Convenciones
- Idioma del código: nombres de variables y componentes en inglés, UI y contenido en español
- Servicios en `/services` usan el servicio base CRUD genérico
- Componentes UI con shadcn/ui, estilos con Tailwind
- Auth: middleware protege /admin, redirige a /login si no autenticado
- Moneda: ARS (peso argentino), formato con separador de miles punto y decimal coma
- Siempre commitear y pushear después de cada cambio
