"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface WhiteLabelConfig {
  system_name: string;
  system_subtitle: string;
  logo_url: string;
  logo_initial: string;
  primary_hue: number;
  sidebar_lightness: number;
}

const DEFAULT_CONFIG: WhiteLabelConfig = {
  system_name: "Dulcesur",
  system_subtitle: "Gestión Comercial",
  logo_url: "",
  logo_initial: "C",
  primary_hue: 264,
  sidebar_lightness: 0.16,
};

const STORAGE_KEY = "white_label_config";

let cachedConfig: WhiteLabelConfig | null = null;
const listeners = new Set<(c: WhiteLabelConfig) => void>();

function notify(c: WhiteLabelConfig) {
  cachedConfig = c;
  listeners.forEach((fn) => fn(c));
}

export function applyWhiteLabelCSS(config: WhiteLabelConfig) {
  const h = config.primary_hue;
  const sl = config.sidebar_lightness;
  const root = document.documentElement;

  root.style.setProperty("--primary", `oklch(0.45 0.18 ${h})`);
  root.style.setProperty("--ring", `oklch(0.45 0.18 ${h})`);
  root.style.setProperty("--accent", `oklch(0.94 0.02 ${h})`);
  root.style.setProperty("--accent-foreground", `oklch(0.35 0.15 ${h})`);
  root.style.setProperty("--chart-1", `oklch(0.55 0.2 ${h})`);

  root.style.setProperty("--sidebar", `oklch(${sl} 0.03 ${h})`);
  root.style.setProperty("--sidebar-primary", `oklch(0.55 0.2 ${h})`);
  root.style.setProperty("--sidebar-accent", `oklch(${Math.min(sl + 0.06, 0.35)} 0.04 ${h})`);
  root.style.setProperty("--sidebar-border", `oklch(${Math.min(sl + 0.09, 0.4)} 0.04 ${h})`);
  root.style.setProperty("--sidebar-ring", `oklch(0.45 0.18 ${h})`);
}

async function loadFromDB(): Promise<WhiteLabelConfig | null> {
  try {
    const { data } = await supabase
      .from("empresa")
      .select("white_label")
      .limit(1)
      .single();
    if (data && (data as any).white_label) {
      return { ...DEFAULT_CONFIG, ...(data as any).white_label };
    }
  } catch {}
  return null;
}

async function saveToDB(config: WhiteLabelConfig) {
  try {
    const { data: emp } = await supabase.from("empresa").select("id").limit(1).single();
    if (emp) {
      await supabase.from("empresa").update({ white_label: config } as any).eq("id", emp.id);
    }
  } catch {}
}

function loadFromStorage(): WhiteLabelConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_CONFIG;
}

export function useWhiteLabel() {
  const [config, setConfig] = useState<WhiteLabelConfig>(cachedConfig || DEFAULT_CONFIG);

  useEffect(() => {
    const handler = (c: WhiteLabelConfig) => setConfig(c);
    listeners.add(handler);

    if (!cachedConfig) {
      // Try localStorage first (instant), then DB (async override)
      const local = loadFromStorage();
      notify(local);
      applyWhiteLabelCSS(local);

      loadFromDB().then((dbConfig) => {
        if (dbConfig) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbConfig));
          notify(dbConfig);
          applyWhiteLabelCSS(dbConfig);
        }
      });
    } else {
      applyWhiteLabelCSS(cachedConfig);
    }

    const storageHandler = () => {
      cachedConfig = null;
      const fresh = loadFromStorage();
      notify(fresh);
      applyWhiteLabelCSS(fresh);
    };
    window.addEventListener("storage", storageHandler);
    return () => {
      listeners.delete(handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const update = (partial: Partial<WhiteLabelConfig>) => {
    const next = { ...config, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify(next);
    applyWhiteLabelCSS(next);
    saveToDB(next); // async, best-effort
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    cachedConfig = null;
    notify(DEFAULT_CONFIG);
    applyWhiteLabelCSS(DEFAULT_CONFIG);
    saveToDB(DEFAULT_CONFIG);
  };

  return { config, update, reset, DEFAULT_CONFIG };
}
