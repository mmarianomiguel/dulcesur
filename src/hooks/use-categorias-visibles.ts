"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface CategoriaConRestriccion {
  id: string;
  nombre: string;
  restringida?: boolean;
  [key: string]: any;
}

/**
 * Hook that returns the list of allowed category IDs for the current tienda client.
 * Categories with `restringida = true` are hidden unless the client has them in `categorias_permitidas`.
 */
export function useCategoriasPermitidas() {
  const [permitidas, setPermitidas] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("cliente_auth");
        if (!raw) {
          setPermitidas([]);
          setLoaded(true);
          return;
        }
        const auth = JSON.parse(raw);
        if (!auth?.id) {
          setPermitidas([]);
          setLoaded(true);
          return;
        }
        // Get cliente_id from clientes_auth
        const { data: authData } = await supabase
          .from("clientes_auth")
          .select("cliente_id")
          .eq("id", auth.id)
          .single();

        if (!authData?.cliente_id) {
          setPermitidas([]);
          setLoaded(true);
          return;
        }

        const { data: cliente } = await supabase
          .from("clientes")
          .select("categorias_permitidas")
          .eq("id", authData.cliente_id)
          .single();

        setPermitidas(cliente?.categorias_permitidas || []);
      } catch {
        setPermitidas([]);
      }
      setLoaded(true);
    })();
  }, []);

  /** Filter an array of categories, hiding restricted ones the client can't access */
  const filtrarCategorias = <T extends CategoriaConRestriccion>(cats: T[]): T[] => {
    if (!loaded) return cats;
    return cats.filter((cat) => {
      if (!cat.restringida) return true;
      return permitidas?.includes(cat.id) ?? false;
    });
  };

  return { permitidas, loaded, filtrarCategorias };
}
