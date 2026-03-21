import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Productos",
  description: "Explorá nuestro catálogo completo de golosinas, snacks y productos de almacén a precios mayoristas.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
