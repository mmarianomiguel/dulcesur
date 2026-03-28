"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

interface Zona {
  id: string;
  nombre: string;
  dias: string[];
  localidades?: string;
}

interface TiendaConfig {
  monto_minimo_pedido: number;
  umbral_envio_gratis: number;
  hora_corte: string;
  horario_atencion_inicio: string;
  horario_atencion_fin: string;
  dias_atencion: string[];
  minimo_unidades_mayorista: number;
}

export default function EnviosDinamico() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [zonasRes, configRes] = await Promise.all([
        supabase.from("zonas_entrega").select("*").order("nombre"),
        supabase
          .from("tienda_config")
          .select("monto_minimo_pedido, umbral_envio_gratis, hora_corte, horario_atencion_inicio, horario_atencion_fin, dias_atencion, minimo_unidades_mayorista")
          .limit(1)
          .single(),
      ]);
      if (zonasRes.data) setZonas(zonasRes.data as Zona[]);
      if (configRes.data) setConfig(configRes.data as TiendaConfig);
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

  const horaCorteFmt = config?.hora_corte
    ? config.hora_corte.slice(0, 5).replace(":", ":") + " hs"
    : "12:30 hs";

  return (
    <div className="space-y-8">
      {/* Montos */}
      {config && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-sm font-medium text-gray-500">Compra en local / Retiro</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatCurrency(config.monto_minimo_pedido)}
            </p>
            <p className="mt-1 text-sm text-gray-500">Compra mínima para retiro en el local</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-5">
            <p className="text-sm font-medium text-green-700">Envío a domicilio</p>
            <p className="mt-1 text-2xl font-bold text-green-800">
              {formatCurrency(config.umbral_envio_gratis)}
            </p>
            <p className="mt-1 text-sm text-green-600">Compra mínima para envío gratis a domicilio</p>
          </div>
        </div>
      )}

      {/* Mínimo mayorista */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="text-lg font-semibold text-amber-900">Compra mínima por producto</h3>
        <p className="mt-2 text-sm text-amber-800">
          Los productos que se venden por unidad tienen un mínimo de{" "}
          <strong>{config?.minimo_unidades_mayorista || 3} unidades</strong> para acceder a precios mayoristas.
        </p>
      </div>

      {/* Entrega en el día */}
      <div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Entrega en el día</h3>
        <p className="text-gray-600">
          Si realizás tu pedido{" "}
          <strong className="text-gray-900">antes de las {horaCorteFmt}</strong>, lo recibís en
          el mismo día (según la zona y el día de entrega correspondiente). Los pedidos realizados
          después de ese horario se programan para el próximo día de entrega disponible.
        </p>
      </div>

      {/* Zonas de entrega */}
      {zonas.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Zonas y días de entrega</h3>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 font-semibold text-gray-700">Zona</th>
                  {zonas.some((z) => z.localidades) && (
                    <th className="px-4 py-3 font-semibold text-gray-700">Localidades</th>
                  )}
                  <th className="px-4 py-3 font-semibold text-gray-700">Días de entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {zonas.map((z) => (
                  <tr key={z.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{z.nombre}</td>
                    {zonas.some((zo) => zo.localidades) && (
                      <td className="px-4 py-3 text-gray-600">{z.localidades || "—"}</td>
                    )}
                    <td className="px-4 py-3 text-gray-600">{z.dias.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Horario */}
      <div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Horario de entrega</h3>
        <p className="text-gray-600">
          Las entregas se realizan de{" "}
          <strong className="text-gray-900">
            {config?.dias_atencion
              ? `${config.dias_atencion[0].toLowerCase()} a ${config.dias_atencion[config.dias_atencion.length - 1].toLowerCase()}`
              : "lunes a sábados"}
          </strong>{" "}
          en el horario de{" "}
          <strong className="text-gray-900">
            {config?.horario_atencion_inicio?.slice(0, 5) || "08:00"} a {config?.horario_atencion_fin?.slice(0, 5) || "14:00"} hs
          </strong>.
        </p>
      </div>

      {/* Seguimiento */}
      <div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Seguimiento del pedido</h3>
        <p className="text-gray-600">
          Podés consultar el estado de tu pedido en cualquier momento desde la sección{" "}
          <a href="/cuenta/pedidos" className="font-medium text-primary hover:text-primary/90">
            &quot;Mis pedidos&quot;
          </a>{" "}
          en tu cuenta.
        </p>
      </div>
    </div>
  );
}
