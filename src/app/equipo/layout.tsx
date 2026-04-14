import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equipo — Dulce Sur",
  description: "Sistema de equipo",
};

export default function EquipoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
