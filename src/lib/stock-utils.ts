/**
 * Construye el payload de update para un producto considerando cambio de stock.
 *
 * Reglas:
 * - Si el nuevo stock es <= 0 (sin stock o negativo) Y el anterior era > 0:
 *   setear fecha_sin_stock a ahora.
 * - Si el nuevo stock es > 0 Y el anterior era <= 0:
 *   limpiar fecha_sin_stock (hay stock de nuevo).
 * - En cualquier otro caso: no tocar fecha_sin_stock.
 */
export function buildStockUpdate(
  stockNuevo: number,
  stockAnterior: number,
  extraFields: Record<string, any> = {}
): Record<string, any> {
  const payload: Record<string, any> = {
    stock: stockNuevo,
    ...extraFields,
  };

  // Pasó de CON stock a SIN stock (incluye negativo)
  if (stockNuevo <= 0 && stockAnterior > 0) {
    payload.fecha_sin_stock = new Date().toISOString();
  }
  // Pasó de SIN stock (o negativo) a CON stock
  else if (stockNuevo > 0 && stockAnterior <= 0) {
    payload.fecha_sin_stock = null;
  }

  return payload;
}
