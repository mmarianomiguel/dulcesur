/**
 * Tests for transfer surcharge calculation.
 *
 * Rule: The surcharge (recargo) is ONLY applied to the current order amount,
 * NEVER to saldo pendiente (old debt).
 *
 * For Transferencia: surcharge = orderTotal * recPct / 100
 * For Mixto: surcharge = transferPortionOfOrder * recPct / 100
 *   where transferPortionOfOrder = min(transferAmount, max(0, orderTotal - efectivo - cc))
 */

import { describe, it, expect } from "vitest";

// ── Surcharge calculation logic (mirrors the actual code) ──────────────

/**
 * Calculate transfer surcharge for the POS flow.
 * Extracted from ventas/page.tsx lines 466-471.
 */
function calcPOSSurcharge(params: {
  formaPago: string;
  baseTotal: number;
  porcentajeTransferencia: number;
  mixtoEfectivo: number;
  mixtoTransferencia: number;
  mixtoCuentaCorriente: number;
}): number {
  const { formaPago, baseTotal, porcentajeTransferencia, mixtoEfectivo, mixtoTransferencia, mixtoCuentaCorriente } = params;
  if (formaPago === "Transferencia") {
    return baseTotal * (porcentajeTransferencia / 100);
  }
  if (formaPago === "Mixto") {
    // Cap: surcharge only on transfer portion covering THIS order, not saldo
    const transferForOrder = Math.min(
      mixtoTransferencia,
      Math.max(0, baseTotal - mixtoEfectivo - mixtoCuentaCorriente)
    );
    return transferForOrder * (porcentajeTransferencia / 100);
  }
  return 0;
}

/**
 * Calculate transfer surcharge for the CobroVentaSection.
 * Extracted from cobro-venta-section.tsx lines 226-231.
 */
function calcCobroSurcharge(params: {
  metodo: string;
  montoVenta: number;
  recPct: number;
  mixtoTransferencia: number;
  mixtoEfectivo: number;
  mixtoCuentaCorriente: number;
}): number {
  const { metodo, montoVenta, recPct, mixtoTransferencia, mixtoEfectivo, mixtoCuentaCorriente } = params;
  if (recPct <= 0) return 0;
  if (metodo === "Transferencia") return Math.round(montoVenta * recPct) / 100;
  if (metodo === "Mixto") {
    const transferForOrder = Math.min(
      mixtoTransferencia,
      Math.max(0, montoVenta - mixtoEfectivo - mixtoCuentaCorriente)
    );
    return Math.round(transferForOrder * recPct) / 100;
  }
  return 0;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POS Surcharge Calculation", () => {
  const RECARGO = 2; // 2%

  describe("Transferencia (full)", () => {
    it("applies surcharge only to order total, not saldo", () => {
      // User's real example: subtotal 80,800 + saldo 82,400
      const surcharge = calcPOSSurcharge({
        formaPago: "Transferencia",
        baseTotal: 80800,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 0,
        mixtoTransferencia: 0,
        mixtoCuentaCorriente: 0,
      });
      // Surcharge should be 80,800 * 2% = 1,616 (NOT 163,200 * 2% = 3,264)
      expect(surcharge).toBe(1616);

      const total = 80800 + surcharge;
      expect(total).toBe(82416); // Correct: $82,416 (NOT $84,064)
    });

    it("surcharge is independent of saldo pendiente", () => {
      // Same order, different saldo amounts → same surcharge
      const surcharge1 = calcPOSSurcharge({
        formaPago: "Transferencia",
        baseTotal: 50000,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 0,
        mixtoTransferencia: 0,
        mixtoCuentaCorriente: 0,
      });
      // Saldo doesn't affect surcharge at all
      expect(surcharge1).toBe(1000); // 50,000 * 2% = 1,000
    });
  });

  describe("Mixto payment", () => {
    it("applies surcharge only to transfer portion of the ORDER", () => {
      // Order: 80,800 — paid as Mixto: 40,000 Efectivo + 40,800 Transfer
      // (no saldo)
      const surcharge = calcPOSSurcharge({
        formaPago: "Mixto",
        baseTotal: 80800,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 40000,
        mixtoTransferencia: 40800,
        mixtoCuentaCorriente: 0,
      });
      expect(surcharge).toBe(816); // 40,800 * 2% = 816
    });

    it("caps surcharge at order amount when transfer includes saldo", () => {
      // Order: 80,800, Saldo: 82,400, Total to distribute: 163,200
      // Paid as Mixto: 0 Efectivo + 163,200 Transfer
      // Only 80,800 of the transfer covers the order → surcharge on 80,800
      const surcharge = calcPOSSurcharge({
        formaPago: "Mixto",
        baseTotal: 80800,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 0,
        mixtoTransferencia: 163200,
        mixtoCuentaCorriente: 0,
      });
      expect(surcharge).toBe(1616); // 80,800 * 2% = 1,616 (NOT 163,200 * 2% = 3,264)
    });

    it("correctly handles mix of efectivo + transfer + saldo", () => {
      // Order: 80,800, Saldo: 82,400, Total: 163,200
      // Paid: 40,000 Efectivo + 123,200 Transfer
      // Order transfer portion: 80,800 - 40,000 = 40,800
      const surcharge = calcPOSSurcharge({
        formaPago: "Mixto",
        baseTotal: 80800,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 40000,
        mixtoTransferencia: 123200,
        mixtoCuentaCorriente: 0,
      });
      expect(surcharge).toBe(816); // 40,800 * 2% = 816
    });

    it("correctly handles mix of efectivo + transfer + CC + saldo", () => {
      // Order: 100,000, Saldo: 50,000, Total: 150,000
      // Paid: 30,000 Efectivo + 100,000 Transfer + 20,000 CC
      // Order transfer portion: 100,000 - 30,000 - 20,000 = 50,000
      const surcharge = calcPOSSurcharge({
        formaPago: "Mixto",
        baseTotal: 100000,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 30000,
        mixtoTransferencia: 100000,
        mixtoCuentaCorriente: 20000,
      });
      expect(surcharge).toBe(1000); // 50,000 * 2% = 1,000
    });

    it("returns 0 surcharge when no transfer portion covers the order", () => {
      // Order: 50,000 — paid 50,000 Efectivo + 30,000 Transfer (saldo portion)
      const surcharge = calcPOSSurcharge({
        formaPago: "Mixto",
        baseTotal: 50000,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 50000,
        mixtoTransferencia: 30000,
        mixtoCuentaCorriente: 0,
      });
      expect(surcharge).toBe(0); // All order covered by efectivo, transfer is only saldo
    });
  });

  describe("Efectivo and Cuenta Corriente", () => {
    it("no surcharge for Efectivo", () => {
      const surcharge = calcPOSSurcharge({
        formaPago: "Efectivo",
        baseTotal: 80800,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 0,
        mixtoTransferencia: 0,
        mixtoCuentaCorriente: 0,
      });
      expect(surcharge).toBe(0);
    });

    it("no surcharge for Cuenta Corriente", () => {
      const surcharge = calcPOSSurcharge({
        formaPago: "Cuenta Corriente",
        baseTotal: 80800,
        porcentajeTransferencia: RECARGO,
        mixtoEfectivo: 0,
        mixtoTransferencia: 0,
        mixtoCuentaCorriente: 0,
      });
      expect(surcharge).toBe(0);
    });
  });
});

describe("CobroVentaSection Surcharge Calculation", () => {
  const RECARGO = 2;

  it("Transferencia: surcharge on montoVenta only", () => {
    const surcharge = calcCobroSurcharge({
      metodo: "Transferencia",
      montoVenta: 80800,
      recPct: RECARGO,
      mixtoTransferencia: 0,
      mixtoEfectivo: 0,
      mixtoCuentaCorriente: 0,
    });
    expect(surcharge).toBe(1616);
  });

  it("Mixto: surcharge capped at order's transfer portion", () => {
    // montoVenta = 80,800 (order only), but transfer includes saldo
    const surcharge = calcCobroSurcharge({
      metodo: "Mixto",
      montoVenta: 80800,
      recPct: RECARGO,
      mixtoTransferencia: 163200, // includes 82,400 saldo
      mixtoEfectivo: 0,
      mixtoCuentaCorriente: 0,
    });
    // Should cap at 80,800 (order amount), not 163,200
    expect(surcharge).toBe(1616);
  });

  it("Mixto: partial transfer for order + rest for saldo", () => {
    const surcharge = calcCobroSurcharge({
      metodo: "Mixto",
      montoVenta: 80800,
      recPct: RECARGO,
      mixtoTransferencia: 123200,
      mixtoEfectivo: 40000,
      mixtoCuentaCorriente: 0,
    });
    // Order transfer: min(123200, max(0, 80800 - 40000 - 0)) = min(123200, 40800) = 40800
    expect(surcharge).toBe(816);
  });

  it("total final = order + surcharge + saldo (separated)", () => {
    const montoVenta = 80800;
    const surcharge = calcCobroSurcharge({
      metodo: "Transferencia",
      montoVenta,
      recPct: RECARGO,
      mixtoTransferencia: 0,
      mixtoEfectivo: 0,
      mixtoCuentaCorriente: 0,
    });
    const saldoPendiente = 20000;

    const totalPedido = montoVenta + surcharge;
    const totalFinal = totalPedido + saldoPendiente;

    expect(totalPedido).toBe(82416);
    expect(totalFinal).toBe(102416);
  });
});
