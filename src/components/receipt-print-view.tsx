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
  fontSizeEmpresa: number;
  fontSizeCliente: number;
  fontSizeProductos: number;
  fontSizeResumen: number;
  logoHeight: number;
  mostrarLogo: boolean;
  mostrarVendedor: boolean;
  mostrarDescuento: boolean;
  mostrarVuelto: boolean;
  mostrarDireccion: boolean;
  mostrarTelefono: boolean;
  mostrarFormaPago: boolean;
  mostrarMoneda: boolean;
}

export const defaultReceiptConfig: ReceiptConfig = {
  logoUrl: "https://res.cloudinary.com/dss3lnovd/image/upload/v1774505786/dulcesur/logo-dulcesur-negro.jpg",
  empresaNombre: "",
  empresaWeb: "",
  empresaDomicilio: "",
  empresaTelefono: "",
  empresaCuit: "",
  empresaIva: "",
  empresaInicioAct: "",
  empresaIngrBrutos: "",
  footerTexto: "Gracias por su compra",
  fontSize: 13,
  fontSizeEmpresa: 13,
  fontSizeCliente: 12,
  fontSizeProductos: 12,
  fontSizeResumen: 15,
  logoHeight: 60,
  mostrarLogo: true,
  mostrarVendedor: true,
  mostrarDescuento: true,
  mostrarVuelto: false,
  mostrarDireccion: true,
  mostrarTelefono: true,
  mostrarFormaPago: true,
  mostrarMoneda: true,
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
  cobroSaldoMonto?: number;
  cashReceived?: number;
  cashChange?: number;
  pagoEfectivo?: number;
  pagoTransferencia?: number;
  pagoCuentaCorriente?: number;
  cuentaBancaria?: string;
}

// Items per page (conservative to avoid overflow)
const ITEMS_FIRST_PAGE = 25; // First page has header + client info
const ITEMS_OTHER_PAGE = 32; // Other pages only have header

export function ReceiptPrintView({
  sale,
  config,
}: {
  sale: ReceiptSale;
  config: ReceiptConfig;
}) {
  const fsEmpresa = config.fontSizeEmpresa || config.fontSize;
  const fsCliente = config.fontSizeCliente || config.fontSize - 1;
  const fsProductos = config.fontSizeProductos || config.fontSize - 2;
  const fsResumen = config.fontSizeResumen || config.fontSize + 6;
  const fmtCur = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

  // B&W friendly styles
  const rowPad = "4px 5px";
  const altRowBg = "#f0f0f0";

  // Split items into pages
  const pages: ReceiptLineItem[][] = [];
  const allItems = [...sale.items];

  if (allItems.length <= ITEMS_FIRST_PAGE) {
    pages.push(allItems);
  } else {
    pages.push(allItems.splice(0, ITEMS_FIRST_PAGE));
    while (allItems.length > 0) {
      pages.push(allItems.splice(0, ITEMS_OTHER_PAGE));
    }
  }

  const totalPages = pages.length;

  // Clean item description helper
  const cleanDesc = (item: ReceiptLineItem) => {
    let d = item.description
      .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
      .replace(/\s*\(Unidad\)$/, "")
      .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Carton")
      .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
    if (item.presentacion && item.presentacion !== "Unidad") {
      const escaped = item.presentacion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      d = d.replace(new RegExp(`(\\(?${escaped}\\)?)\\s*\\(?${escaped}\\)?`, "gi"), "$1");
    }
    return d;
  };

  // Header component (repeated on every page)
  const PageHeader = ({ pageNum }: { pageNum: number }) => (
    <>
      <div style={{ display: "flex", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "4px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            {config.mostrarLogo && config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="Logo" style={{ height: `${config.logoHeight}px` }} />
            )}
            {!config.mostrarLogo && (
              <div style={{ fontSize: `${fsEmpresa + 8}px`, fontWeight: "bold" }}>{config.empresaNombre}</div>
            )}
          </div>
          <div style={{ fontSize: `${fsEmpresa - 2}px`, lineHeight: "1.5" }}>
            {config.empresaWeb && <div style={{ fontWeight: "bold" }}>{config.empresaWeb}</div>}
            <div>{config.empresaDomicilio} | Tel: {config.empresaTelefono}</div>
          </div>
        </div>
        <div style={{ width: "55px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: "2px solid #000", borderRight: "2px solid #000", padding: "0 8px" }}>
          <div style={{ fontSize: "30px", fontWeight: "bold", lineHeight: 1 }}>{(() => {
            const match = sale.tipoComprobante.match(/[ABC]$/);
            return match ? match[0] : "X";
          })()}</div>
          <div style={{ fontSize: "8px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>{sale.tipoComprobante.match(/[ABC]$/) ? "Documento fiscal" : "Documento no valido como factura"}</div>
        </div>
        <div style={{ flex: 1, paddingLeft: "10px" }}>
          <div style={{ fontSize: `${fsEmpresa + 4}px`, fontWeight: "bold", marginBottom: "4px" }}>
            {sale.tipoComprobante}
          </div>
          <div style={{ fontSize: `${fsEmpresa + 2}px`, fontWeight: "bold", marginBottom: "4px" }}>
            N° {sale.numero}
          </div>
          <div style={{ fontSize: `${fsEmpresa - 2}px`, lineHeight: "1.5" }}>
            <div>Fecha: {sale.fecha}</div>
            <div>CUIT: {config.empresaCuit}</div>
            {config.empresaIngrBrutos && <div>IIBB: {config.empresaIngrBrutos}</div>}
          </div>
        </div>
      </div>

      {/* Page number (only if multi-page) */}
      {totalPages > 1 && (
        <div style={{ textAlign: "right", fontSize: `${config.fontSize - 2}px`, color: "#888", marginBottom: "2px" }}>
          Página {pageNum} de {totalPages}
        </div>
      )}
    </>
  );

  // Client info (only on first page) — compact single block
  const ClientInfo = () => (
    <div style={{ border: "1px solid #000", padding: "3px 6px", marginBottom: "4px", fontSize: `${fsCliente}px`, lineHeight: "1.4" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span><span style={{ fontWeight: "bold" }}>Cliente:</span> {sale.cliente}{config.mostrarTelefono && sale.clienteTelefono && <span> · Tel: {sale.clienteTelefono}</span>}{sale.clienteCondicionIva && <span> · {sale.clienteCondicionIva}</span>}</span>
        {config.mostrarVendedor && (
          <span><span style={{ fontWeight: "bold" }}>Vendedor:</span> {sale.vendedor || (sale.tipoComprobante?.toLowerCase().includes("pedido web") || sale.tipoComprobante?.toLowerCase().includes("web") ? "Tienda Online" : "—")}</span>
        )}
      </div>
      {config.mostrarDireccion && sale.clienteDireccion && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span><span style={{ fontWeight: "bold" }}>Domicilio:</span> {sale.clienteDireccion}</span>
          {config.mostrarFormaPago && <span><span style={{ fontWeight: "bold" }}>Pago:</span> {sale.formaPago}</span>}
        </div>
      )}
      {!sale.clienteDireccion && config.mostrarFormaPago && (
        <div><span style={{ fontWeight: "bold" }}>Pago:</span> {sale.formaPago}</div>
      )}
    </div>
  );

  // Items table for a page
  const ItemsTable = ({ items, showContinue }: { items: ReceiptLineItem[]; showContinue?: boolean }) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: `${fsProductos}px` }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #000", borderTop: "2px solid #000" }}>
          <th style={{ textAlign: "left", padding: rowPad, fontWeight: "bold" }}>Cant.</th>
          <th style={{ textAlign: "left", padding: rowPad, fontWeight: "bold" }}>Producto</th>
          <th style={{ textAlign: "center", padding: rowPad, fontWeight: "bold" }}>U/Med</th>
          <th style={{ textAlign: "right", padding: rowPad, fontWeight: "bold", whiteSpace: "nowrap" }}>P.Unit.</th>
          {config.mostrarDescuento && (
            <th style={{ textAlign: "right", padding: rowPad, fontWeight: "bold" }}>Dto.%</th>
          )}
          <th style={{ textAlign: "right", padding: rowPad, fontWeight: "bold" }}>Importe</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          const totalComboUnits = item.es_combo && item.comboItems && item.comboItems.length > 0
            ? item.comboItems.reduce((s, ci) => s + ci.cantidad, 0)
            : 0;
          const isBox = !item.es_combo && item.unidades_por_presentacion > 1;
          const isMedio = (item.unidades_por_presentacion || 1) < 1;
          const displayQty = isMedio ? item.qty * (item.unidades_por_presentacion || 0.5) : item.qty;
          const precioUnitario = item.price;
          return (
            <tr key={i} style={{ borderBottom: "1px solid #ccc", background: i % 2 === 1 ? altRowBg : "transparent" }}>
              <td style={{ padding: rowPad, textAlign: "left" }}>{displayQty}</td>
              <td style={{ padding: rowPad, textAlign: "left", maxWidth: "180px", wordBreak: "break-word", overflow: "hidden" }}>
                {item.es_combo && (
                  <span style={{ fontSize: `${fsProductos - 3}px`, fontWeight: "bold", border: "1px solid #000", padding: "0 3px", marginRight: "4px", letterSpacing: "0.5px" }}>COMBO</span>
                )}
                {cleanDesc(item)}
                {item.es_combo && item.comboItems && item.comboItems.length > 0 && (
                  <div style={{ fontSize: `${fsProductos - 3}px`, color: "#555", marginTop: "1px", lineHeight: "1.2" }}>
                    {item.comboItems.map((ci) => `${ci.nombre} x${ci.cantidad}`).join(" · ")}
                  </div>
                )}
              </td>
              <td style={{ padding: rowPad, textAlign: "center" }}>
                {item.es_combo && totalComboUnits > 0 ? `x${totalComboUnits} un` : isBox ? `x${item.unidades_por_presentacion} un` : (item.unit === "Unidad" ? "Un" : item.unit) || "Un"}
              </td>
              <td style={{ padding: rowPad, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCur(precioUnitario)}</td>
              {config.mostrarDescuento && (
                <td style={{ padding: rowPad, textAlign: "right" }}>{item.discount ? `${item.discount}%` : ""}</td>
              )}
              <td style={{ padding: rowPad, textAlign: "right", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>{fmtCur(item.subtotal)}</td>
            </tr>
          );
        })}
      </tbody>
      {showContinue && (
        <tfoot>
          <tr>
            <td colSpan={config.mostrarDescuento ? 6 : 5} style={{ textAlign: "center", padding: "6px", fontSize: `${fsProductos - 1}px`, fontStyle: "italic", borderTop: "1px solid #000" }}>
              Continúa en la siguiente página...
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  // Totals + Payment section (only on last page) — compact, B&W friendly
  const TotalsAndPayment = () => {
    const fs = config.fontSize;
    const showDesglose = sale.formaPago === "Mixto" || sale.pagoEfectivo || sale.pagoTransferencia || sale.pagoCuentaCorriente;
    const showVuelto = config.mostrarVuelto && sale.formaPago === "Efectivo" && sale.cashReceived != null && sale.cashReceived > 0;
    const showSaldo = sale.saldoNuevo !== 0 || sale.saldoAnterior !== 0 || (sale.pagoCuentaCorriente ?? 0) > 0;
    const totalPagado = (sale.pagoEfectivo || 0) + (sale.pagoTransferencia || 0);
    const hasPaymentOrCC = showDesglose || showVuelto || showSaldo;

    // Build payment parts as inline text
    const paymentParts: string[] = [];
    if (showDesglose) {
      if (sale.pagoEfectivo != null && sale.pagoEfectivo > 0) paymentParts.push(`Efectivo ${fmtCur(Math.round(sale.pagoEfectivo))}`);
      if (sale.pagoTransferencia != null && sale.pagoTransferencia > 0) {
        let t = `Transf. ${fmtCur(Math.round(sale.pagoTransferencia))}`;
        if (sale.transferSurcharge > 0) t += ` (inc. rec. ${fmtCur(Math.round(sale.transferSurcharge))})`;
        paymentParts.push(t);
      }
      if (sale.pagoCuentaCorriente != null && sale.pagoCuentaCorriente > 0) paymentParts.push(`Cta.Cte. ${fmtCur(Math.round(sale.pagoCuentaCorriente))}`);
    } else {
      if (sale.formaPago === "Efectivo") paymentParts.push(`Efectivo ${fmtCur(sale.total)}`);
      if (sale.formaPago === "Transferencia") {
        let t = `Transf. ${fmtCur(sale.total)}`;
        if (sale.transferSurcharge > 0) t += ` (inc. rec. ${fmtCur(Math.round(sale.transferSurcharge))})`;
        paymentParts.push(t);
      }
      if (sale.formaPago === "Cuenta Corriente") paymentParts.push(`Cta.Cte. ${fmtCur(sale.total)}`);
    }

    return (
      <>
        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* TOTAL bar — bold, big, clear */}
        <div style={{ borderTop: "2px solid #000", borderBottom: "2px solid #000", padding: "6px 4px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: `${fs}px`, fontVariantNumeric: "tabular-nums" }}>
            {(sale.descuento > 0 || sale.recargo > 0 || sale.transferSurcharge > 0) && (
              <span>
                Subtotal {fmtCur(Math.round(sale.subtotal))}
                {sale.descuento > 0 && <span> — Dto. -{fmtCur(Math.round(sale.descuento))}</span>}
                {sale.recargo > 0 && <span> — Rec. +{fmtCur(Math.round(sale.recargo))}</span>}
                {sale.transferSurcharge > 0 && !sale.recargo && <span> — Rec.Transf. +{fmtCur(Math.round(sale.transferSurcharge))}</span>}
                <span style={{ margin: "0 10px" }}>|</span>
              </span>
            )}
          </div>
          <div style={{ fontSize: `${fsResumen + 2}px`, fontWeight: "bold", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            TOTAL {fmtCur(Math.round(sale.total))}
          </div>
        </div>

        {/* Payment + CC — right-aligned layout */}
        {hasPaymentOrCC && (
          <div style={{ padding: "4px 0 2px", fontSize: `${fs - 1}px`, borderBottom: "1px solid #000" }}>
            {/* Abonó / Adeuda line */}
            {showDesglose && totalPagado > 0 && (sale.pagoCuentaCorriente ?? 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "3px", fontSize: `${fs}px` }}>
                <span>Abonó <span style={{ fontWeight: "bold" }}>{fmtCur(Math.round(totalPagado))}</span></span>
                <span>|</span>
                <span>Adeuda <span style={{ fontWeight: "bold" }}>{fmtCur(Math.round(sale.pagoCuentaCorriente || 0))}</span></span>
              </div>
            )}

            {/* Payment methods */}
            {paymentParts.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px", marginBottom: "2px", fontSize: `${fs - 1}px` }}>
                <span>{paymentParts.join(" · ")}</span>
              </div>
            )}

            {/* Vuelto */}
            {showVuelto && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px", marginBottom: "2px" }}>
                <span>Recibido {fmtCur(sale.cashReceived!)} — <span style={{ fontWeight: "bold" }}>Vuelto {fmtCur(sale.cashChange ?? 0)}</span></span>
              </div>
            )}

            {/* Saldo a favor aplicado */}
            {sale.cobroSaldoMonto != null && sale.cobroSaldoMonto > 0 && sale.saldoAnterior < 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px", marginBottom: "2px", fontSize: `${fs - 1}px` }}>
                <span>(inc. saldo a favor {fmtCur(Math.round(sale.cobroSaldoMonto))})</span>
              </div>
            )}

            {/* Cuenta Corriente — right-aligned block */}
            {showSaldo && (() => {
              const anterior = Math.round(sale.saldoAnterior);
              const ccVenta = Math.round(sale.pagoCuentaCorriente || 0);
              const cobro = Math.round(sale.cobroSaldoMonto || 0);
              const saldoFinal = Math.round(sale.saldoNuevo);
              const ccWidth = "260px";
              const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: `${fs - 1}px`, marginBottom: "1px" };
              return (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                  <div style={{ width: ccWidth, borderTop: "1px solid #000", paddingTop: "3px" }}>
                    <div style={{ fontWeight: "bold", fontSize: `${fs - 1}px`, marginBottom: "3px" }}>CUENTA CORRIENTE</div>
                    <div style={rowStyle}>
                      <span>Saldo anterior</span>
                      <span>{anterior > 0 ? fmtCur(anterior) : anterior < 0 ? `${fmtCur(Math.abs(anterior))} a favor` : "$0"}</span>
                    </div>
                    {ccVenta > 0 && (
                      <div style={rowStyle}>
                        <span>+ Esta venta</span>
                        <span>{fmtCur(ccVenta)}</span>
                      </div>
                    )}
                    {cobro > 0 && (
                      <div style={rowStyle}>
                        <span>Cobro en esta venta</span>
                        <span>-{fmtCur(cobro)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: "1px solid #000", marginTop: "2px", paddingTop: "2px", display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: `${fs}px` }}>
                      <span>SALDO</span>
                      <span style={{ textDecoration: saldoFinal > 0 ? "underline" : "none" }}>
                        {saldoFinal > 0 ? fmtCur(saldoFinal) : saldoFinal < 0 ? `${fmtCur(Math.abs(saldoFinal))} a favor` : "$0"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Footer — minimal */}
        <div style={{ textAlign: "center", padding: "6px 0 2px", fontSize: `${fs - 2}px` }}>
          {config.footerTexto} — {sale.items.length} artículo{sale.items.length !== 1 ? "s" : ""}
        </div>
      </>
    );
  };

  // Single page - render normally
  if (totalPages === 1) {
    return (
      <div
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "8mm 10mm",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: `${config.fontSize}px`,
          color: "#000",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PageHeader pageNum={1} />
        <ClientInfo />
        <ItemsTable items={pages[0]} />
        <TotalsAndPayment />
      </div>
    );
  }

  // Multi-page - render each page separately
  return (
    <>
      {pages.map((pageItems, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === totalPages - 1;

        return (
          <div
            key={pageIndex}
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: "8mm 10mm",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: `${config.fontSize}px`,
              color: "#000",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              pageBreakAfter: isLastPage ? "auto" : "always",
            }}
          >
            <PageHeader pageNum={pageIndex + 1} />
            {isFirstPage && <ClientInfo />}
            {!isFirstPage && (
              <div style={{ fontSize: `${fsCliente}px`, color: "#888", marginBottom: "4px", fontStyle: "italic" }}>
                Cliente: {sale.cliente} — {sale.tipoComprobante} N° {sale.numero}
              </div>
            )}
            <ItemsTable items={pageItems} showContinue={!isLastPage} />
            {isLastPage && <TotalsAndPayment />}
            {!isLastPage && <div style={{ flex: 1 }} />}
          </div>
        );
      })}
    </>
  );
}
