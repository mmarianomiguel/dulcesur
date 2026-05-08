# Audit Fixes — Estado y pendientes

Esta rama (`audit-fixes`) aplica fixes derivados de la auditoría general del sistema.
Documenta lo resuelto y lo que queda pendiente, para guiar el merge a `main`.

## ✅ Fixes aplicados

### Seguridad (admin → tienda)
- `POST /api/auth/tienda?action=reset-password` ahora exige usuario admin autenticado.
  Antes era invocable por cualquiera con un `clienteAuthId` y permitía tomar control
  de cualquier cuenta de cliente. **Crítico.**
- `cliente_direcciones` update/delete filtra también por `cliente_auth_id`
  (defensa en profundidad contra IDOR desde DevTools).

### Integridad de stock / compras
- `Confirmar ingreso` de compra pendiente usa `atomic_update_stock` (RPC) —
  evita race condition con doble click o pestañas paralelas.
- Inserción de `caja_movimientos` solo si `forma_pago` no es null (evita
  violar NOT NULL constraint).
- Devolución parcial de compra usa `atomic_update_stock` con rollback de
  stocks si falla a mitad — antes podía dejar stock decrementado y caja sin
  contraparte.

### Validaciones de datos
- NC sobre venta anulada queda bloqueada con mensaje claro.
- Anular venta queda bloqueada si hay NCs activas asociadas — el reverso de
  saldo sería incorrecto. Hay que anular la NC primero.
- Form de cliente valida CUIT/DNI duplicado contra otros clientes activos.
- Reimport de Excel preserva `visibilidad` existente — antes reseteaba a
  `"visible"` y productos ocultos descontinuados re-aparecían.
- `clientesService.getConSaldo()` usa `.range(0, 49999)` — evita truncado
  silencioso en 1000 deudores.

### Reportes / tienda
- Ranking de clientes excluye ventas sin `cliente_id` para no inflar con
  un agrupado "Consumidor Final" sintético.
- Detalle de producto en tienda valida `activo=true` y `visibilidad!=oculto`
  — antes un producto oculto era accesible directo por slug.

---

## 🔴 Pendientes críticos (requieren PR aparte con testing)

### 1. RLS en tablas de tienda
`cliente_direcciones`, `clientes_auth`, `pedidos_tienda`, `pedido_tienda_items`
y `cobro_items` tienen RLS deshabilitado. Algunas tienen políticas pero no
están activas. Activar RLS sin probar las políticas con la auth real puede
romper la tienda y el admin.

**Plan recomendado:**
1. Migrar la auth de tienda a sesiones server-side con cookies httpOnly
   (eliminar `localStorage` `cliente_auth`).
2. Crear endpoint `/api/auth/tienda?action=session` que devuelva el cliente
   autenticado desde el cookie.
3. Activar RLS basada en `auth.uid()` o en un claim custom para la tienda.
4. Migrar los `.from(...)` directos del cliente a endpoints API que validen
   propiedad server-side.
5. Probar exhaustivamente: login, logout, registro, ver pedidos, ver/editar
   direcciones, cambiar contraseña, panel admin.

### 2. Saldo del cliente vs cuenta_corriente — atomicidad
El saldo se actualiza en distintos puntos sin transacción. Existe el script
`scripts/fix-saldos-reconcile.sql` para reparar manualmente, lo que
indica que el problema es real y recurrente. Idealmente se resuelve con
triggers en `cuenta_corriente` que mantengan el saldo en sync, o moviendo
toda la lógica a RPCs atómicas.

### 3. Numeradores y race conditions
La RPC `next_numero` debería verificarse que use `SELECT ... FOR UPDATE` o
`UPDATE ... RETURNING` para evitar duplicados bajo concurrencia. No se
verificó en esta sesión.

### 4. Comisiones de vendedor sin tabla `pago_comisiones`
Se calculan dinámicamente pero no hay registro de pagos efectivos. Para una
contabilidad seria hace falta una tabla `pago_comisiones` y un flujo de
"liquidar comisiones del mes".

---

## 🟡 Mejoras menores pendientes

- Constraint `UNIQUE` a nivel BD en `clientes(cuit)` y `clientes(numero_documento)`
  para defensa en profundidad (la validación cliente ya está, pero un
  insert directo puede saltarla).
- Importación CSV de clientes detectar duplicados dentro del mismo archivo.
- Open Graph fallback (logo de empresa) para productos sin imagen.
- Validaciones backend de fontSize en config de impresión.

---

## Cómo probar antes del merge

1. Levantar dev server: `npm run dev` desde `enexpro/`.
2. **Auth tienda:** intentar invocar `POST /api/auth/tienda` con
   `action=reset-password` desde curl/Postman sin estar logueado en admin —
   debe responder 401.
3. **Ingreso compra:** abrir una compra "Pendiente" en dos pestañas, hacer
   click en "Confirmar ingreso" simultáneamente — el stock debe quedar
   sumado una sola vez (no doble).
4. **NC sobre anulada:** anular una venta y luego intentar crear NC sobre
   ella — debe mostrar error.
5. **Anular con NC activa:** crear una NC sobre una venta y luego intentar
   anular la venta original — debe mostrar error y pedir anular NC primero.
6. **Cliente duplicado:** crear cliente con CUIT X. Intentar crear otro
   con el mismo CUIT — debe rechazar.
7. **Producto oculto:** marcar un producto como `visibilidad="oculto"` en
   admin. Acceder por URL `/productos/<slug>` — debe dar 404.
8. **Ranking:** ver ranking de clientes — no debe aparecer "Consumidor
   Final" como cliente top.
