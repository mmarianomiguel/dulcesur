"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface CurrentUser {
  authId: string;
  nombre: string;
  email: string | null;
  esAdmin: boolean;
  rolId: string | null;
}

let cachedUser: CurrentUser | null = null;
let fetchPromise: Promise<CurrentUser | null> | null = null;

async function fetchUser(): Promise<CurrentUser | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("nombre, email, es_admin, rol_id")
      .eq("auth_id", user.id)
      .single();

    if (!usuario) return null;

    return {
      authId: user.id,
      nombre: usuario.nombre || user.email || "Admin",
      email: usuario.email || user.email || null,
      esAdmin: usuario.es_admin ?? false,
      rolId: usuario.rol_id ?? null,
    };
  } catch {
    return null;
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);

  useEffect(() => {
    if (cachedUser) {
      setUser(cachedUser);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = fetchUser().then((u) => {
        cachedUser = u;
        fetchPromise = null;
        return u;
      });
    }
    fetchPromise.then((u) => setUser(u));
  }, []);

  return user;
}

export function getCurrentUserName(): string {
  return cachedUser?.nombre || "Admin Sistema";
}
