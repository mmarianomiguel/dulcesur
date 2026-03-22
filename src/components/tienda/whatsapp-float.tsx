"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageCircle } from "lucide-react";

export default function WhatsAppFloat() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    supabase
      .from("tienda_config")
      .select("footer_config")
      .limit(1)
      .single()
      .then(({ data }) => {
        const fc = (data as any)?.footer_config;
        if (fc?.whatsapp_url) setUrl(fc.whatsapp_url);
      });
  }, []);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 transition-transform hover:scale-110 active:scale-95"
      aria-label="WhatsApp"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
