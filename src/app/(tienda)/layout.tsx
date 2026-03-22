import type { Metadata } from "next";
import TiendaNavbar from "@/components/tienda/navbar";
import TiendaFooter from "@/components/tienda/footer";
import { CartProvider } from "@/components/tienda/cart-drawer";
import AdminBanner from "@/components/tienda/admin-banner";
import ToastContainer from "@/components/tienda/toast";
import WhatsAppFloat from "@/components/tienda/whatsapp-float";

export const metadata: Metadata = {
  title: {
    default: "Dulcesur - Tienda Online Mayorista",
    template: "%s | Dulcesur",
  },
  description: "Comprá golosinas, snacks y productos de almacén al mejor precio mayorista. Envíos a todo el país.",
};

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <AdminBanner />
        <TiendaNavbar />
        <main className="flex-1">{children}</main>
        <TiendaFooter />
        <ToastContainer />
        <WhatsAppFloat />
      </div>
    </CartProvider>
  );
}
