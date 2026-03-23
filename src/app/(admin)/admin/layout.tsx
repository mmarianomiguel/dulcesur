"use client";

import { Sidebar } from "@/components/sidebar";
import AdminToastContainer from "@/components/admin-toast";
import { GlobalSearch } from "@/components/global-search";
import { useState } from "react";
import { Menu } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center h-12 px-3 bg-background border-b lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-1 rounded-lg hover:bg-accent transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-2 text-sm font-semibold">Panel de Administración</span>
      </div>

      {/* Sidebar */}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* Main content - add top padding on mobile for the header */}
      <main className="flex-1 overflow-y-auto pt-12 lg:pt-0">{children}</main>
      <AdminToastContainer />
      <GlobalSearch />
    </div>
  );
}
