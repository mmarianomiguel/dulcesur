"use client";

import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useCarritoSync() {
  // Guardar carrito en BD
  const syncToRemote = useCallback(async () => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) return;
      const { id } = JSON.parse(stored);
      const carrito = JSON.parse(localStorage.getItem("carrito") || "[]");
      if (!Array.isArray(carrito) || carrito.length === 0) return;

      await supabase
        .from("carritos_guardados")
        .upsert(
          { cliente_auth_id: id, items: carrito, updated_at: new Date().toISOString() },
          { onConflict: "cliente_auth_id" }
        );
    } catch {}
  }, []);

  // Restaurar carrito desde BD si localStorage está vacío
  const restoreFromRemote = useCallback(async () => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) return;
      const { id } = JSON.parse(stored);

      const localCarrito = JSON.parse(localStorage.getItem("carrito") || "[]");
      if (Array.isArray(localCarrito) && localCarrito.length > 0) return;

      const { data } = await supabase
        .from("carritos_guardados")
        .select("items")
        .eq("cliente_auth_id", id)
        .single();

      if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
        localStorage.setItem("carrito", JSON.stringify(data.items));
        window.dispatchEvent(new Event("cart-updated"));
      }
    } catch {}
  }, []);

  // Limpiar carrito guardado después de una compra
  const clearRemote = useCallback(async () => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) return;
      const { id } = JSON.parse(stored);
      await supabase.from("carritos_guardados").delete().eq("cliente_auth_id", id);
    } catch {}
  }, []);

  // Sincronizar cuando el carrito cambia
  useEffect(() => {
    const handler = () => syncToRemote();
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, [syncToRemote]);

  // Restaurar al montar
  useEffect(() => {
    restoreFromRemote();
  }, [restoreFromRemote]);

  return { syncToRemote, restoreFromRemote, clearRemote };
}
