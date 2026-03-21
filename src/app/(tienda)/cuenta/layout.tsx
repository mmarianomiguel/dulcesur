import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi Cuenta",
  description: "Gestioná tu perfil, direcciones y pedidos.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
