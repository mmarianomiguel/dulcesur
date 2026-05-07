-- V23: Persistir costo y subtotal en ajuste_stock_items
-- Antes: ajuste_stock_items solo guardaba cantidad/stock_antes/stock_despues/direccion.
-- El detalle del ajuste no podía mostrar el valor económico de la mercadería movida,
-- y si el costo del producto cambiaba después, no había forma de reconstruir el costo
-- al momento del ajuste (importante p.ej. para "Venta al costo").
-- Ahora: cada item guarda su costo unitario y subtotal de ese momento.

ALTER TABLE ajuste_stock_items
  ADD COLUMN IF NOT EXISTS costo numeric,
  ADD COLUMN IF NOT EXISTS subtotal numeric;
