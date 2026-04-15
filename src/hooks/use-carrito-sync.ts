"use client";

import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useCarritoSync() {
  // Guardar carrito en BD — si está vacío, borrarlo de Supabase
  const syncToRemote = useCallback(async () => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) return;
      const { id } = JSON.parse(stored);
      const carrito = JSON.parse(localStorage.getItem("carrito") || "[]");

      if (!Array.isArray(carrito) || carrito.length === 0) {
        // Carrito vacío: borrar de Supabase y marcar como vaciado
        await supabase
          .from("carritos_guardados")
          .delete()
          .eq("cliente_auth_id", id);
        localStorage.setItem("carrito_vaciado", "1");
        localStorage.setItem("carrito_modificado_at", new Date().toISOString());
        return;
      }

      // Carrito con items: guardar y limpiar flag de vaciado
      localStorage.removeItem("carrito_vaciado");
      await supabase
        .from("carritos_guardados")
        .upsert(
          { cliente_auth_id: id, items: carrito, updated_at: new Date().toISOString() },
          { onConflict: "cliente_auth_id" }
        );
      localStorage.setItem("carrito_modificado_at", new Date().toISOString());
    } catch {}
  }, []);

  // Restaurar carrito desde BD si localStorage está vacío
  // NO restaurar si el cliente vació el carrito intencionalmente
  // NO restaurar si el local es más reciente que el remoto
  const restoreFromRemote = useCallback(async () => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) return;
      const { id } = JSON.parse(stored);

      const localCarrito = JSON.parse(localStorage.getItem("carrito") || "[]");
      if (Array.isArray(localCarrito) && localCarrito.length > 0) return;

      // Si el cliente vació el carrito intencionalmente, no restaurar
      const vaciado = localStorage.getItem("carrito_vaciado");
      if (vaciado === "1") return;

      const { data } = await supabase
        .from("carritos_guardados")
        .select("items, updated_at")
        .eq("cliente_auth_id", id)
        .single();

      if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
        // Si el local fue modificado más recientemente que el remoto, no restaurar
        const localModificadoAt = localStorage.getItem("carrito_modificado_at");
        const remoteUpdatedAt = data.updated_at;
        if (localModificadoAt && remoteUpdatedAt) {
          if (new Date(localModificadoAt) >= new Date(remoteUpdatedAt)) return;
        }

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
      localStorage.removeItem("carrito_vaciado");
      localStorage.removeItem("carrito_modificado_at");
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
