"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Phone, Mail, MapPin, Instagram, Clock, Loader2 } from "lucide-react";

interface FooterConfig {
  instagram_url: string;
  whatsapp_url: string;
  direccion: string;
  telefono: string;
  email: string;
}

interface HorarioConfig {
  horario_atencion_inicio: string;
  horario_atencion_fin: string;
  dias_atencion: string[];
}

export default function ContactoDinamico() {
  const [config, setConfig] = useState<FooterConfig | null>(null);
  const [horario, setHorario] = useState<HorarioConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tienda_config")
        .select("footer_config, horario_atencion_inicio, horario_atencion_fin, dias_atencion")
        .limit(1)
        .single();
      if (data) {
        const fc = (data as any).footer_config || {};
        setConfig(fc as FooterConfig);
        setHorario({
          horario_atencion_inicio: (data as any).horario_atencion_inicio || "08:00",
          horario_atencion_fin: (data as any).horario_atencion_fin || "14:00",
          dias_atencion: (data as any).dias_atencion || ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
        });
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-gray-600">
        Estamos para ayudarte. Contactanos por cualquiera de estos medios:
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* WhatsApp */}
        {config?.whatsapp_url && (
          <a
            href={config.whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-gray-200 p-5 transition hover:border-green-300 hover:bg-green-50"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 group-hover:bg-green-100">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">WhatsApp</h3>
            </div>
            {config.telefono && (
              <p className="text-sm font-medium text-gray-900">{config.telefono}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">Escribinos por WhatsApp</p>
          </a>
        )}

        {/* Email */}
        {config?.email && (
          <a
            href={"mailto:" + config.email}
            className="group rounded-xl border border-gray-200 p-5 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Email</h3>
            </div>
            <p className="text-sm font-medium text-gray-900">{config.email}</p>
            <p className="mt-1 text-sm text-gray-500">Envianos un correo</p>
          </a>
        )}

        {/* Instagram */}
        {config?.instagram_url && (
          <a
            href={config.instagram_url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-gray-200 p-5 transition hover:border-primary/30 hover:bg-primary/5"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 group-hover:bg-primary/10">
                <Instagram className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Instagram</h3>
            </div>
            <p className="text-sm font-medium text-gray-900">
              {config.instagram_url ? "@" + config.instagram_url.replace(/.*instagram\.com\//, "").replace(/\/$/, "") : "Instagram"}
            </p>
            <p className="mt-1 text-sm text-gray-500">Seguinos en Instagram</p>
          </a>
        )}

        {/* Dirección */}
        {config?.direccion && (
          <a
            href="https://maps.app.goo.gl/CBw2qy9spzqT88RDA"
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-gray-200 p-5 transition hover:border-red-300 hover:bg-red-50"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100">
                <MapPin className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Dirección</h3>
            </div>
            <p className="text-sm font-medium text-gray-900">{config.direccion}</p>
            <p className="mt-1 text-sm text-gray-500">Ver en Google Maps</p>
          </a>
        )}
      </div>

      {/* Horarios */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
            <Clock className="h-5 w-5 text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Horarios</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-700">Horario de atención</p>
            <p className="text-sm text-gray-600">
              {horario?.dias_atencion ? `${horario.dias_atencion[0]} a ${horario.dias_atencion[horario.dias_atencion.length - 1]}` : "Lunes a Sábados"}{" "}
              de {horario?.horario_atencion_inicio?.slice(0, 5) || "08:00"} a {horario?.horario_atencion_fin?.slice(0, 5) || "14:00"} hs
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Local abierto</p>
            <p className="text-sm text-gray-600">
              {horario?.dias_atencion ? `${horario.dias_atencion[0]} a ${horario.dias_atencion[horario.dias_atencion.length - 1]}` : "Lunes a Sábados"}{" "}
              de {horario?.horario_atencion_inicio?.slice(0, 5) || "08:00"} a {horario?.horario_atencion_fin?.slice(0, 5) || "14:00"} hs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
