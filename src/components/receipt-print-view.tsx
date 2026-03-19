export interface ReceiptConfig {
  logoUrl: string;
  empresaNombre: string;
  empresaWeb: string;
  empresaDomicilio: string;
  empresaTelefono: string;
  empresaCuit: string;
  empresaIva: string;
  empresaInicioAct: string;
  empresaIngrBrutos: string;
  footerTexto: string;
  fontSize: number;
  logoHeight: number;
  mostrarLogo: boolean;
  mostrarVendedor: boolean;
  mostrarDescuento: boolean;
}

export const defaultReceiptConfig: ReceiptConfig = {
  logoUrl: "https://www.dulcesur.com/assets/logotipo.png",
  empresaNombre: "DULCE SUR",
  empresaWeb: "www.dulcesur.com",
  empresaDomicilio: "Francisco Canaro 4012",
  empresaTelefono: "116299-1571",
  empresaCuit: "20443387898",
  empresaIva: "Monotributista Social",
  empresaInicioAct: "15/2/2021",
  empresaIngrBrutos: "20443387898",
  footerTexto: "Gracias por su compra",
  fontSize: 12,
  logoHeight: 60,
  mostrarLogo: true,
  mostrarVendedor: true,
  mostrarDescuento: true,
};

export interface ReceiptLineItem {
  id: string;
  producto_id: string;
  code: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  subtotal: number;
  presentacion: string;
  unidades_por_presentacion: number;
  stock: number;
  es_combo?: boolean;
  comboItems?: { nombre: string; cantidad: number }[];
}

export interface ReceiptSale {
  numero: string;
  total: number;
  subtotal: number;
  descuento: number;
  recargo: number;
  transferSurcharge: number;
  tipoComprobante: string;
  formaPago: string;
  moneda: string;
  cliente: string;
  clienteDireccion?: string | null;
  clienteTelefono?: string | null;
  clienteCondicionIva?: string | null;
  vendedor: string;
  items: ReceiptLineItem[];
  fecha: string;
  saldoAnterior: number;
  saldoNuevo: number;
  cashReceived?: number;
  cashChange?: number;
}

export function ReceiptPrintView({
  sale,
  config,
}: {
  sale: ReceiptSale;
  config: ReceiptConfig;
}) {
  const fs = config.fontSize;
  const fmtCur = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm 10mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: `${fs}px`,
        color: "#000",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "4px" }}>
        {/* Left: Logo & company */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            {config.mostrarLogo && config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="Logo" style={{ height: `${config.logoHeight}px` }} />
            )}
            {!config.mostrarLogo && (
              <div style={{ fontSize: `${fs + 8}px`, fontWeight: "bold" }}>{config.empresaNombre}</div>
            )}
          </div>
          <div style={{ fontSize: `${fs - 2}px`, lineHeight: "1.5" }}>
            {config.empresaWeb && <div style={{ fontWeight: "bold" }}>{config.empresaWeb}</div>}
            <div>{config.empresaDomicilio} | Tel: {config.empresaTelefono}</div>
          </div>
        </div>

        {/* Center: X */}
        <div style={{ width: "55px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: "2px solid #000", borderRight: "2px solid #000", padding: "0 8px" }}>
          <div style={{ fontSize: "30px", fontWeight: "bold", lineHeight: 1 }}>X</div>
          <div style={{ fontSize: "8px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>Documento no válido como factura</div>
        </div>

        {/* Right: Number & fiscal data */}
        <div style={{ flex: 1, paddingLeft: "10px" }}>
          <div style={{ fontSize: `${fs + 4}px`, fontWeight: "bold", marginBottom: "4px" }}>
            {sale.tipoComprobante}
          </div>
          <div style={{ fontSize: `${fs + 2}px`, fontWeight: "bold", marginBottom: "4px" }}>
            N° {sale.numero}
          </div>
          <div style={{ fontSize: `${fs - 2}px`, lineHeight: "1.6" }}>
            <div>Fecha: {sale.fecha}</div>
            <div>CUIT: {config.empresaCuit}</div>
            <div>Ing.Brutos: {config.empresaIngrBrutos}</div>
            <div>Cond.IVA: {config.empresaIva}</div>
            <div>Inicio de Actividad: {config.empresaInicioAct}</div>
          </div>
        </div>
      </div>

      {/* ── Client info ── */}
      <div style={{ border: "1px solid #ccc", padding: "4px 6px", marginBottom: "4px", fontSize: `${fs - 1}px`, lineHeight: "1.7" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          {/* Left: Cliente, Domicilio, Forma de pago */}
          <div style={{ flex: 1 }}>
            <div><span style={{ fontWeight: "bold" }}>Cliente:</span> {sale.cliente}</div>
            {sale.clienteDireccion && <div><span style={{ fontWeight: "bold" }}>Domicilio:</span> {sale.clienteDireccion}</div>}
            <div><span style={{ fontWeight: "bold" }}>Forma de pago:</span> {sale.formaPago}</div>
          </div>
          {/* Center: Teléfono, Moneda */}
          <div style={{ flex: 1, textAlign: "center" }}>
            {sale.clienteTelefono && <div><span style={{ fontWeight: "bold" }}>Teléfono:</span> {sale.clienteTelefono}</div>}
            <div><span style={{ fontWeight: "bold" }}>Moneda:</span> {sale.moneda || "ARS"}</div>
            {sale.clienteCondicionIva && <div><span style={{ fontWeight: "bold" }}>Cond. IVA:</span> {sale.clienteCondicionIva}</div>}
          </div>
          {/* Right: Vendedor */}
          <div style={{ flex: 1, textAlign: "right" }}>
            {config.mostrarVendedor && (
              <div><span style={{ fontWeight: "bold" }}>Vendedor:</span> {sale.vendedor || (sale.tipoComprobante === "Pedido Web" ? "Pedido Online" : "")}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: `${fs - 1}px`, flex: 1 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000", borderTop: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Cant.</th>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Producto</th>
            <th style={{ textAlign: "center", padding: "4px 4px", fontWeight: "bold" }}>U/Med</th>
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Precio Un.</th>
            {config.mostrarDescuento && (
              <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Desc.%</th>
            )}
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, i) => {
            const totalComboUnits = item.es_combo && item.comboItems && item.comboItems.length > 0
              ? item.comboItems.reduce((s, ci) => s + ci.cantidad, 0)
              : 0;
            const isBox = !item.es_combo && item.unidades_por_presentacion > 1;
            const precioUnitario = item.es_combo && totalComboUnits > 0
              ? item.price / totalComboUnits
              : isBox
                ? item.price / item.unidades_por_presentacion
                : item.unidades_por_presentacion > 0 && item.unidades_por_presentacion < 1
                  ? item.price / item.unidades_por_presentacion
                  : item.price;
            // Strip trailing " - Unidad", "(Unidad)", and any duplicate presentation text
            let cleanDescription = item.description
              .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
              .replace(/\s*\(Unidad\)$/, "")
              // Replace "Caja (x0.5)" or "Caja x0.5" with "Medio Cartón"
              .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
              // Clean up duplicate "Medio Cartón" / "(Medio Cartón)"
              .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
            // Remove duplicate presentation: e.g. "Producto (Caja x40) (Caja x40)" → "Producto (Caja x40)"
            if (item.presentacion && item.presentacion !== "Unidad") {
              const escaped = item.presentacion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              cleanDescription = cleanDescription.replace(new RegExp(`(\\(?${escaped}\\)?)\\s*\\(?${escaped}\\)?`, "gi"), "$1");
            }
            return (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "3px 4px", textAlign: "left" }}>{item.unidades_por_presentacion > 0 && item.unidades_por_presentacion < 1 ? item.qty * item.unidades_por_presentacion : item.qty}</td>
                <td style={{ padding: "3px 4px", textAlign: "left" }}>
                  {item.es_combo && (
                    <span style={{ fontSize: `${fs - 4}px`, fontWeight: "bold", background: "#000", color: "#fff", padding: "0px 2px", borderRadius: "2px", marginRight: "3px", letterSpacing: "0.5px" }}>COMBO</span>
                  )}
                  {cleanDescription}
                  {item.es_combo && item.comboItems && item.comboItems.length > 0 && (
                    <div style={{ fontSize: `${fs - 4}px`, color: "#777", marginTop: "0px", lineHeight: "1.1" }}>
                      {item.comboItems.map((ci) => `${ci.nombre} x${ci.cantidad}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td style={{ padding: "3px 4px", textAlign: "center" }}>
                  {item.es_combo && totalComboUnits > 0 ? `x${totalComboUnits} un` : isBox ? `x${item.unidades_por_presentacion} un` : item.unit || "Un"}
                </td>
                <td style={{ padding: "3px 4px", textAlign: "right" }}>{fmtCur(precioUnitario)}</td>
                {config.mostrarDescuento && (
                  <td style={{ padding: "3px 4px", textAlign: "right" }}>{item.discount ? `(-${item.discount}%)` : "0"}</td>
                )}
                <td style={{ padding: "3px 4px", textAlign: "right" }}>{fmtCur(item.subtotal)}</td>
              </tr>
            );
          })}
          {/* Empty rows to fill space */}
          {sale.items.length < 20 &&
            Array.from({ length: 20 - sale.items.length }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ padding: "3px 4px" }}>&nbsp;</td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                {config.mostrarDescuento && <td style={{ padding: "3px 4px" }}></td>}
                <td style={{ padding: "3px 4px" }}></td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* ── Footer totals ── */}
      <div style={{ borderTop: "2px solid #000", marginTop: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 4px", fontSize: `${fs}px`, gap: "30px" }}>
          <div>
            <span>Subtotal: </span>
            <span style={{ fontWeight: "bold" }}>{fmtCur(sale.subtotal)}</span>
          </div>
          {sale.descuento > 0 && (
            <div>
              <span>Descuento: </span>
              <span style={{ fontWeight: "bold" }}>-{fmtCur(sale.descuento)}</span>
            </div>
          )}
          {sale.recargo > 0 && (
            <div>
              <span>Recargo: </span>
              <span style={{ fontWeight: "bold" }}>+{fmtCur(sale.recargo)}</span>
            </div>
          )}
          {sale.transferSurcharge > 0 && (
            <div>
              <span>Rec. Transferencia: </span>
              <span style={{ fontWeight: "bold" }}>+{fmtCur(sale.transferSurcharge)}</span>
            </div>
          )}
        </div>
        <div style={{ borderTop: "2px solid #000", display: "flex", justifyContent: "flex-end", padding: "8px 4px" }}>
          <div style={{ fontSize: `${fs + 6}px`, fontWeight: "bold" }}>
            TOTAL: {fmtCur(sale.total)}
          </div>
        </div>
        {/* Cash change info */}
        {sale.formaPago === "Efectivo" && sale.cashReceived != null && sale.cashReceived > 0 && (
          <div style={{ borderTop: "1px solid #ccc", padding: "6px 4px", fontSize: `${fs - 1}px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Recibido:</span>
              <span>{fmtCur(sale.cashReceived)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>Vuelto:</span>
              <span>{fmtCur(sale.cashChange ?? 0)}</span>
            </div>
          </div>
        )}
        {/* Saldo info for Cuenta Corriente */}
        {(sale.formaPago === "Cuenta Corriente" || (sale.formaPago === "Mixto" && sale.saldoNuevo !== sale.saldoAnterior)) && (
          <div style={{ borderTop: "1px solid #ccc", padding: "6px 4px", fontSize: `${fs - 1}px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Saldo anterior:</span>
              <span>{sale.saldoAnterior < 0 ? `${fmtCur(Math.abs(sale.saldoAnterior))} (a favor)` : fmtCur(sale.saldoAnterior)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>Saldo actual:</span>
              <span style={{ color: sale.saldoNuevo < 0 ? "#059669" : sale.saldoNuevo > 0 ? "#ea580c" : "#000" }}>
                {sale.saldoNuevo < 0 ? `${fmtCur(Math.abs(sale.saldoNuevo))} (a favor)` : fmtCur(sale.saldoNuevo)}
              </span>
            </div>
          </div>
        )}
        <div style={{ textAlign: "center", padding: "8px 0", fontSize: `${fs - 2}px`, borderTop: "1px solid #ccc" }}>
          <div>{config.footerTexto}</div>
          <div style={{ marginTop: "2px" }}>{sale.items.length} artículo{sale.items.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
    </div>
  );
}
