import type { Metadata } from "next";
import TiendaNavbar from "@/components/tienda/navbar";
import TiendaFooter from "@/components/tienda/footer";
import { CartProvider } from "@/components/tienda/cart-drawer";
import AdminBanner from "@/components/tienda/admin-banner";
import ToastContainer from "@/components/tienda/toast";
import WhatsAppFloat from "@/components/tienda/whatsapp-float";
import ScrollToTop from "@/components/tienda/scroll-to-top";


export const metadata: Metadata = {
  title: {
    default: "DulceSur - Tienda Online",
    template: "%s | DulceSur",
  },
  description:
    "Tienda online de DulceSur. Golosinas, galletitas, snacks y más al mejor precio.",
  manifest: "/manifest-tienda.json",
};

// Preconnect hints para recursos críticos — mejora LCP
export const viewport = {
  themeColor: "#ffffff",
};

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <AdminBanner />
        <TiendaNavbar />
        <main className="flex-1 min-h-[60vh]">{children}</main>
        <TiendaFooter />
        <ToastContainer />
        <WhatsAppFloat />
        <ScrollToTop />
      </div>
    </CartProvider>
  );
}
