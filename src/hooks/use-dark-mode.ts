"use client";

import { useState, useEffect } from "react";

export function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("dark_mode");
    const isDark = stored === "true";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("dark_mode", String(next));
    document.documentElement.classList.toggle("dark", next);
  };

  return { dark, toggle };
}
