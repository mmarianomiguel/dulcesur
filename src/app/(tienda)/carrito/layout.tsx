import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisá los productos en tu carrito de compras.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
