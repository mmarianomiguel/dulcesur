/**
 * Construye el payload de update para un producto considerando cambio de stock.
 * Si el nuevo stock es 0 (y el anterior era > 0), setea fecha_sin_stock.
 * Si el nuevo stock es > 0 (y el anterior era 0), limpia fecha_sin_stock.
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

  if (stockNuevo === 0 && stockAnterior > 0) {
    payload.fecha_sin_stock = new Date().toISOString();
  } else if (stockNuevo > 0 && stockAnterior === 0) {
    payload.fecha_sin_stock = null;
  }

  return payload;
}
