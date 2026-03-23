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
  logoUrl: "",
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
  cashReceived?: number;
  cashChange?: number;
  pagoEfectivo?: number;
  pagoTransferencia?: number;
  pagoCuentaCorriente?: number;
  cuentaBancaria?: string;
}

// Items per page (conservative to avoid overflow)
const ITEMS_FIRST_PAGE = 22; // First page has header + client info
const ITEMS_OTHER_PAGE = 28; // Other pages only have header

export function ReceiptPrintView({
  sale,
  config,
}: {
  sale: ReceiptSale;
  config: ReceiptConfig;
}) {
  const fsEmpresa = config.fontSizeEmpresa || config.fontSize;
  const fsCliente = config.fontSizeCliente || config.fontSize - 1;
  const fsProductos = (config.fontSizeProductos || config.fontSize - 1) + 2;
  const fsResumen = config.fontSizeResumen || config.fontSize + 6;
  const fmtCur = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

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
          <div style={{ fontSize: "30px", fontWeight: "bold", lineHeight: 1 }}>X</div>
          <div style={{ fontSize: "8px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>Documento no valido como factura</div>
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

  // Client info (only on first page)
  const ClientInfo = () => (
    <div style={{ border: "1px solid #ccc", padding: "3px 6px", marginBottom: "4px", fontSize: `${fsCliente}px`, lineHeight: "1.3" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span><span style={{ fontWeight: "bold" }}>Cliente:</span> {sale.cliente}{config.mostrarTelefono && sale.clienteTelefono && <span> · <span style={{ fontWeight: "bold" }}>Tel:</span> {sale.clienteTelefono}</span>}</span>
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
        <tr style={{ borderBottom: "1px solid #000", borderTop: "1px solid #000" }}>
          <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Cant.</th>
          <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Producto</th>
          <th style={{ textAlign: "center", padding: "4px 4px", fontWeight: "bold" }}>U/Med</th>
          <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold", whiteSpace: "nowrap" }}>P.Unit.</th>
          {config.mostrarDescuento && (
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Desc.%</th>
          )}
          <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Importe</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
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
          return (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "2px 4px", textAlign: "left" }}>{item.unidades_por_presentacion > 0 && item.unidades_por_presentacion < 1 ? item.qty * item.unidades_por_presentacion : item.qty}</td>
              <td style={{ padding: "2px 4px", textAlign: "left" }}>
                {item.es_combo && (
                  <span style={{ fontSize: `${fsProductos - 3}px`, fontWeight: "bold", background: "#000", color: "#fff", padding: "0px 2px", borderRadius: "2px", marginRight: "3px", letterSpacing: "0.5px" }}>COMBO</span>
                )}
                {cleanDesc(item)}
                {item.es_combo && item.comboItems && item.comboItems.length > 0 && (
                  <div style={{ fontSize: `${fsProductos - 3}px`, color: "#777", marginTop: "0px", lineHeight: "1.1" }}>
                    {item.comboItems.map((ci) => `${ci.nombre} x${ci.cantidad}`).join(" · ")}
                  </div>
                )}
              </td>
              <td style={{ padding: "2px 4px", textAlign: "center" }}>
                {item.es_combo && totalComboUnits > 0 ? `x${totalComboUnits} un` : isBox ? `x${item.unidades_por_presentacion} un` : (item.unit === "Unidad" ? "Un" : item.unit) || "Un"}
              </td>
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{fmtCur(precioUnitario)}</td>
              {config.mostrarDescuento && (
                <td style={{ padding: "2px 4px", textAlign: "right" }}>{item.discount ? `(-${item.discount}%)` : "0"}</td>
              )}
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{fmtCur(item.subtotal)}</td>
            </tr>
          );
        })}
      </tbody>
      {showContinue && (
        <tfoot>
          <tr>
            <td colSpan={config.mostrarDescuento ? 6 : 5} style={{ textAlign: "center", padding: "6px", fontSize: `${fsProductos - 1}px`, color: "#888", fontStyle: "italic" }}>
              Continúa en la siguiente página...
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  // Totals + Payment section (only on last page)
  const TotalsAndPayment = () => {
    const fs = config.fontSize;
    const row = (label: string, value: string, bold = false, color?: string) => (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "2px", fontWeight: bold ? "bold" : "normal", fontSize: `${fs}px` }}>
        <span style={{ color: "#555" }}>{label}</span>
        <span style={{ minWidth: "100px", textAlign: "right", color: color || "#000" }}>{value}</span>
      </div>
    );
    const separator = () => <div style={{ borderTop: "1px solid #ccc", margin: "4px 0", marginLeft: "auto", width: "320px" }} />;

    const totalAhorro = sale.descuento > 0 ? sale.descuento : sale.items.filter(i => i.discount > 0).reduce((a, i) => a + (i.price * i.qty * i.discount / 100), 0);
    const showDesglose = sale.formaPago === "Mixto" || sale.pagoEfectivo || sale.pagoTransferencia || sale.pagoCuentaCorriente;
    const showVuelto = config.mostrarVuelto && sale.formaPago === "Efectivo" && sale.cashReceived != null && sale.cashReceived > 0;
    const showSaldo = sale.saldoNuevo !== 0 || sale.saldoAnterior !== 0 || (sale.pagoCuentaCorriente ?? 0) > 0;
    const totalPagado = (sale.pagoEfectivo || 0) + (sale.pagoTransferencia || 0);
    const showPaymentSection = showDesglose || showVuelto || showSaldo || totalAhorro > 0;

    return (
      <>
        {/* Spacer - pushes everything below to the bottom */}
        <div style={{ flex: 1 }} />

        {/* Totals */}
        <div style={{ borderTop: "2px solid #000" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 4px", fontSize: `${fsResumen - 2}px`, gap: "30px" }}>
            <div>
              <span>Subtotal: </span>
              <span style={{ fontWeight: "bold" }}>{fmtCur(Math.round(sale.subtotal))}</span>
            </div>
            {sale.descuento > 0 && (
              <div>
                <span>Descuento: </span>
                <span style={{ fontWeight: "bold", color: "#059669" }}>-{fmtCur(Math.round(sale.descuento))}</span>
              </div>
            )}
            {sale.recargo > 0 && (
              <div>
                <span>Recargo: </span>
                <span style={{ fontWeight: "bold" }}>+{fmtCur(Math.round(sale.recargo))}</span>
              </div>
            )}
            {sale.transferSurcharge > 0 && (
              <div>
                <span>Rec. Transf.: </span>
                <span style={{ fontWeight: "bold" }}>+{fmtCur(Math.round(sale.transferSurcharge))}</span>
              </div>
            )}
          </div>
          <div style={{ borderTop: "2px solid #000", display: "flex", justifyContent: "flex-end", padding: "8px 4px" }}>
            <div style={{ fontSize: `${fsResumen}px`, fontWeight: "bold" }}>
              TOTAL: {fmtCur(Math.round(sale.total))}
            </div>
          </div>
        </div>

        {/* Payment summary */}
        {showPaymentSection ? (
          <div style={{ borderTop: "2px solid #000", padding: "8px 4px" }}>
            <div style={{ fontSize: `${fs - 1}px`, fontWeight: "bold", textAlign: "right", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#333" }}>Detalle de pago</div>

            {totalAhorro > 0 && (<>
              {row("Ahorro en esta compra:", `-${fmtCur(Math.round(totalAhorro))}`, false, "#059669")}
              {separator()}
            </>)}

            {showDesglose && (<>
              {sale.pagoEfectivo != null && sale.pagoEfectivo > 0 && row("Efectivo:", fmtCur(Math.round(sale.pagoEfectivo)))}
              {sale.pagoTransferencia != null && sale.pagoTransferencia > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "2px", fontSize: `${fs}px` }}>
                  <span style={{ color: "#555" }}>
                    Transferencia:{sale.transferSurcharge > 0 && <span style={{ fontSize: `${fs - 3}px`, color: "#888" }}> (inc. rec. +{fmtCur(Math.round(sale.transferSurcharge))})</span>}
                  </span>
                  <span style={{ minWidth: "100px", textAlign: "right" }}>{fmtCur(Math.round(sale.pagoTransferencia))}</span>
                </div>
              )}
              {sale.pagoCuentaCorriente != null && sale.pagoCuentaCorriente > 0 && row("Cta. Corriente:", fmtCur(Math.round(sale.pagoCuentaCorriente)))}
              {separator()}
              {totalPagado > 0 && row("Abonado:", fmtCur(Math.round(totalPagado)), true)}
              {(sale.pagoCuentaCorriente ?? 0) > 0 && row("Adeuda:", fmtCur(Math.round(sale.pagoCuentaCorriente || 0)), true, "#dc2626")}
            </>)}

            {!showDesglose && sale.formaPago === "Efectivo" && row("Efectivo:", fmtCur(sale.total))}
            {!showDesglose && sale.formaPago === "Transferencia" && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "2px", fontSize: `${fs}px` }}>
                <span style={{ color: "#555" }}>
                  Transferencia:{sale.transferSurcharge > 0 && <span style={{ fontSize: `${fs - 3}px`, color: "#888" }}> (inc. rec. +{fmtCur(Math.round(sale.transferSurcharge))})</span>}
                </span>
                <span style={{ minWidth: "100px", textAlign: "right" }}>{fmtCur(sale.total)}</span>
              </div>
            )}
            {!showDesglose && sale.formaPago === "Cuenta Corriente" && row("Cta. Corriente:", fmtCur(sale.total), false, "#dc2626")}

            {showVuelto && (<>
              {separator()}
              {row("Recibido:", fmtCur(sale.cashReceived!))}
              {row("Vuelto:", fmtCur(sale.cashChange ?? 0), true, "#059669")}
            </>)}

            {showSaldo && (<>
              {separator()}
              <div style={{ fontSize: `${fs - 1}px`, fontWeight: "bold", textAlign: "right", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#333" }}>Cuenta Corriente</div>
              {row("Saldo anterior:", sale.saldoAnterior < 0 ? `${fmtCur(Math.abs(sale.saldoAnterior))} a favor` : sale.saldoAnterior === 0 ? "$0" : fmtCur(sale.saldoAnterior))}
              {(sale.pagoCuentaCorriente ?? 0) > 0 && row("Cargado en esta venta:", `+${fmtCur(Math.round(sale.pagoCuentaCorriente || 0))}`, false, "#dc2626")}
              {separator()}
              {row(
                "Saldo total pendiente:",
                sale.saldoNuevo < 0 ? `${fmtCur(Math.abs(sale.saldoNuevo))} a favor` : sale.saldoNuevo === 0 ? "$0" : fmtCur(sale.saldoNuevo),
                true,
                sale.saldoNuevo < 0 ? "#059669" : sale.saldoNuevo > 0 ? "#dc2626" : undefined
              )}
            </>)}

            <div style={{ textAlign: "center", padding: "10px 0 4px", marginTop: "8px", borderTop: "1px solid #ccc", fontSize: `${config.fontSize - 2}px` }}>
              <div>{config.footerTexto}</div>
              <div style={{ marginTop: "2px" }}>{sale.items.length} artículo{sale.items.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 0", fontSize: `${config.fontSize - 2}px`, borderTop: "1px solid #ccc" }}>
            <div>{config.footerTexto}</div>
            <div style={{ marginTop: "2px" }}>{sale.items.length} artículo{sale.items.length !== 1 ? "s" : ""}</div>
          </div>
        )}
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
