"use client";

import { useEffect, useState } from "react";

interface RecentProduct {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
}

const STORAGE_KEY = "recently_viewed";
const MAX_ITEMS = 8;

export function addRecentlyViewed(product: RecentProduct) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let items: RecentProduct[] = stored ? JSON.parse(stored) : [];
    items = items.filter((p) => p.id !== product.id);
    items.unshift(product);
    items = items.slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function useRecentlyViewed(excludeId?: string) {
  const [items, setItems] = useState<RecentProduct[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let parsed: RecentProduct[] = stored ? JSON.parse(stored) : [];
      if (excludeId) parsed = parsed.filter((p) => p.id !== excludeId);
      setItems(parsed);
    } catch {}
  }, [excludeId]);

  return items;
}
