# Hoja de Ruta — Rediseño + Link Repartidor

**Fecha:** 2026-04-04
**Estado:** Aprobado por usuario

---

## Resumen

Rediseñar la hoja de ruta para que sea más cómoda de usar, persista el orden de entregas en DB, y permita generar un link para que el repartidor vea y gestione sus entregas desde el celular.

---

## Problemas actuales

- Armar la lista es lento (no queda claro qué va en la ruta de hoy)
- El orden de entregas (drag & drop) no se persiste — si se refresca o se abre en otro dispositivo, se pierde
- No hay resumen claro del estado general (entregado, pendiente, cobrado)
- No se muestra si hay saldo anterior pendiente del cliente al momento de la entrega
- No existe forma de que el repartidor vea la hoja desde su celular

---

## Solución: Hoja de ruta como sesión guardada

### Flujo admin

1. Admin abre `/admin/ventas/hoja-ruta`
2. Ve lista de entregas pendientes + botón **"Nueva hoja de ruta"**
3. Selecciona qué pedidos incluir (checkboxes)
4. Ordena con drag & drop o números de secuencia → orden guardado en DB
5. Configura el link del repartidor (modo + tipo) y lo copia para mandar por WhatsApp

### Flujo repartidor

1. Abre el link en el celular (no requiere login)
2. Ve la lista en el orden definido por admin
3. Toca una entrega → ve los detalles: cliente, dirección, monto, **saldo anterior pendiente** (si tiene)
4. Según el modo, puede confirmar entrega y/o registrar cobro
5. Al confirmar cobro → impacta caja exactamente igual que la hoja de ruta actual

---

## Base de datos — tablas nuevas

### `hoja_ruta`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| fecha | date | Fecha de la hoja |
| nombre | text | Ej: "Ruta del 4 de abril" |
| estado | text | `borrador`, `activa`, `completada` |
| modo_link | text | `solo_ver`, `confirmar`, `confirmar_cobrar` |
| token_fijo | text unique | Token permanente (nullable) |
| token_temp | text unique | Token temporal (nullable) |
| token_temp_expira | timestamptz | Expiración del token temporal |
| creado_por | uuid FK usuarios | |
| created_at | timestamptz | |

### `hoja_ruta_items`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| hoja_ruta_id | uuid FK hoja_ruta | |
| venta_id | uuid FK ventas | |
| orden | int | Posición en la ruta (1, 2, 3...) |
| completado | bool | Entrega confirmada |
| completado_at | timestamptz | |

---

## Módulos a crear/modificar

### 1. Admin — `/admin/ventas/hoja-ruta/page.tsx` (refactor completo)

**Tab "Pendientes" (rediseñado):**
- Card por cada hoja de ruta activa del día (con progreso: X/Y entregadas, total cobrado)
- Botón "Nueva hoja de ruta" → drawer lateral para seleccionar y ordenar pedidos
- Resumen global: entregas totales pendientes, monto por cobrar

**Creación de hoja (drawer):**
- Lista de ventas pendientes con checkboxes (búsqueda por cliente/número)
- Drag & drop para ordenar los seleccionados
- Input de nombre de hoja (opcional, default: fecha)
- Botón "Crear hoja"

**Detalle de hoja activa:**
- Lista ordenada de entregas con estado (pendiente/entregado)
- Badge de saldo anterior pendiente del cliente si tiene deuda previa
- Botón de cobrar/confirmar por entrega
- Sección "Generar link repartidor" con:
  - Selector de modo: Solo ver / Confirmar entrega / Confirmar + cobrar
  - Selector de tipo: Link fijo (persistente) o Link temporal (expira en X horas)
  - Botón copiar link

**Tab "Historial" (sin cambios funcionales, solo layout mejorado)**

### 2. API route — `/api/ruta/[token]/route.ts`

- `GET`: Valida token (fijo o temporal), retorna datos de la hoja + items + ventas + clientes
- `POST`: Confirma entrega / registra cobro → misma lógica de caja que la hoja de ruta actual
- Sin autenticación (acceso por token)
- Si token temporal expirado → 401

### 3. Página pública — `/ruta/[token]/page.tsx`

**Sin layout admin (sin sidebar)**. Diseño mobile-first.

- Header: nombre de la hoja, fecha, progreso (X/Y)
- Lista de entregas en orden con:
  - Número de secuencia
  - Nombre cliente + dirección
  - Monto a cobrar
  - Badge naranja si tiene saldo anterior pendiente (con monto)
  - Estado: pendiente / entregado ✓
- Al tocar una entrega → panel/drawer de detalle:
  - Items del pedido
  - Monto total + saldo pendiente anterior (si aplica)
  - Según modo:
    - `solo_ver`: solo información
    - `confirmar`: botón "Marcar como entregado"
    - `confirmar_cobrar`: formulario de cobro (igual que hoja de ruta actual) + botón confirmar

**Saldo anterior en la vista del repartidor:**
Si el cliente tiene `saldo > 0` en la tabla `clientes`, mostrar un badge prominente:
> "⚠ Tiene saldo pendiente de $X,XXX de comprobantes anteriores"
Esto aplica tanto en la vista admin como en la del repartidor.

---

## Modos del link

| Modo | Puede ver | Puede confirmar entrega | Puede cobrar |
|------|-----------|------------------------|--------------|
| `solo_ver` | ✓ | ✗ | ✗ |
| `confirmar` | ✓ | ✓ | ✗ (admin cobra después) |
| `confirmar_cobrar` | ✓ | ✓ | ✓ (impacta caja) |

---

## Tipos de link

- **Fijo:** `token_fijo` en `hoja_ruta`. Siempre apunta a la hoja. No expira.
  URL: `/ruta/abc123def456`
- **Temporal:** `token_temp` + `token_temp_expira`. El admin elige duración (4h, 8h, 24h).
  Mismo formato de URL. Al expirar, la página muestra "Este link ya no está activo."

---

## Comportamiento de caja (sin cambios)

Cuando el repartidor cobra desde el link (`confirmar_cobrar`):
- Crea entradas en `caja_movimientos` igual que la hoja de ruta actual
- Actualiza `ventas.monto_pagado`, `ventas.forma_pago`, `ventas.entregado`
- Si hay saldo anterior y el modo lo permite, puede cobrarlo en el mismo acto (misma lógica FIFO actual)
- Actualiza `clientes.saldo` vía RPC atómica

---

## Out of scope

- Mapas / GPS / optimización de ruta
- Múltiples repartidores por hoja
- Notificaciones push al admin cuando el repartidor confirma
