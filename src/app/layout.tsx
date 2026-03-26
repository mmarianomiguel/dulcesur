import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DulceSur - Mayorista de Golosinas y Kiosco",
    template: "%s | DulceSur",
  },
  description: "Venta mayorista de golosinas, snacks, galletitas y artículos de kiosco en zona sur. Envíos a domicilio. Pedí online o visitanos en Eduardo Gutierrez 5157.",
  keywords: ["mayorista", "golosinas", "kiosco", "snacks", "galletitas", "zona sur", "dulcesur"],
  openGraph: {
    title: "DulceSur - Mayorista de Golosinas y Kiosco",
    description: "Comprá al mejor precio mayorista. Golosinas, snacks, galletitas y más. Envíos a domicilio.",
    url: "https://dulcesur.com",
    siteName: "DulceSur",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
