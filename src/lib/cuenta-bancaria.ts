/**
 * Helpers para normalizar el formato de `caja_movimientos.cuenta_bancaria`.
 *
 * Historicamente el campo se guardo de varias formas inconsistentes:
 *   - "Banco" (solo nombre)
 *   - "Banco — alias" (nombre + alias)
 *   - "alias" (solo alias)
 *   - null
 *
 * Esto rompe los reportes que agrupan por cuenta. Para evitarlo, todos los
 * inserts a caja_movimientos deberian pasar el valor por `formatCuentaCanonica`
 * antes de persistirlo, asi se guarda siempre como "Nombre — alias" cuando es
 * posible identificar la cuenta unica del master.
 */

export interface CuentaMasterRef {
  nombre: string;
  alias: string | null;
}

/**
 * Devuelve el nombre canonico "Nombre — alias" si se puede identificar la
 * cuenta dentro del master `cuentasMaster`. Si no, devuelve el valor crudo
 * trimeado, o null si el input es null/empty.
 *
 * El input puede ser:
 *   - Un objeto cuenta (con nombre y opcionalmente alias) — caso ideal.
 *   - Un string como "Banco", "Banco — alias", o "alias" suelto.
 *   - null/undefined.
 */
export function formatCuentaCanonica(
  input: { nombre: string; alias?: string | null } | string | null | undefined,
  cuentasMaster?: CuentaMasterRef[]
): string | null {
  if (!input) return null;

  // Objeto cuenta directo: ya tenemos nombre + alias.
  if (typeof input === "object") {
    const nombre = (input.nombre || "").trim();
    if (!nombre) return null;
    const alias = (input.alias || "").trim();
    return alias ? `${nombre} — ${alias}` : nombre;
  }

  // String: intentar matchear contra el master.
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!cuentasMaster || cuentasMaster.length === 0) return trimmed;

  const partes = trimmed.split(/\s+—\s+|\s+-\s+/);
  const banco = (partes[0] || "").trim();
  const alias = (partes[1] || "").trim();

  // 1) Match exacto: nombre y alias.
  if (banco && alias) {
    const exact = cuentasMaster.find((c) => c.nombre === banco && (c.alias || "") === alias);
    if (exact) return exact.alias ? `${exact.nombre} — ${exact.alias}` : exact.nombre;
  }
  // 2) Solo el nombre — si hay una unica cuenta con ese nombre, la asumimos.
  if (banco && !alias) {
    const matches = cuentasMaster.filter((c) => c.nombre === banco);
    if (matches.length === 1) {
      const m = matches[0];
      return m.alias ? `${m.nombre} — ${m.alias}` : m.nombre;
    }
    if (matches.length > 1) return banco;
  }
  // 3) El input es un alias suelto.
  if (banco) {
    const aliasMatch = cuentasMaster.find((c) => (c.alias || "") === banco);
    if (aliasMatch) return aliasMatch.alias ? `${aliasMatch.nombre} — ${aliasMatch.alias}` : aliasMatch.nombre;
  }
  return trimmed;
}
