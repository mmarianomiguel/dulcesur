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
  // Default: asumir usuario anónimo (permitidas=[]) y loaded=true para evitar CLS
  // por cambio de layout cuando sections se filtran/ocultan tras montar.
  // useEffect luego actualiza si hay sesión con categorías permitidas adicionales.
  const [permitidas, setPermitidas] = useState<string[] | null>([]);
  const [loaded, setLoaded] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("cliente_auth");
        if (!raw) {
          return;
        }
        const auth = JSON.parse(raw);
        if (!auth?.id) {
          return;
        }
        // Get cliente_id from clientes_auth
        const { data: authData } = await supabase
          .from("clientes_auth")
          .select("cliente_id")
          .eq("id", auth.id)
          .single();

        if (!authData?.cliente_id) return;

        const { data: cliente } = await supabase
          .from("clientes")
          .select("categorias_permitidas")
          .eq("id", authData.cliente_id)
          .single();

        if (cliente?.categorias_permitidas?.length) {
          setPermitidas(cliente.categorias_permitidas);
        }
      } catch {}
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
