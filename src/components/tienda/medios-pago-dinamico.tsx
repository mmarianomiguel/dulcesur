"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Banknote, ArrowRightLeft, CreditCard, Loader2 } from "lucide-react";

interface Config {
  pago_mixto_habilitado: boolean;
  recargo_transferencia: number;
}

export default function MediosPagoDinamico() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tienda_config")
        .select("pago_mixto_habilitado, recargo_transferencia")
        .limit(1)
        .single();
      if (data) setConfig(data as Config);
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
        Aceptamos los siguientes medios de pago para que puedas comprar de la forma que te resulte
        más cómoda:
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Efectivo */}
        <div className="rounded-xl border border-gray-200 p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <Banknote className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Efectivo</h3>
          </div>
          <p className="text-sm text-gray-600">
            Podés abonar en efectivo al momento de recibir tu pedido. Nuestro repartidor te
            entregará el comprobante correspondiente.
          </p>
        </div>

        {/* Transferencia */}
        <div className="rounded-xl border border-gray-200 p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Transferencia bancaria</h3>
          </div>
          <p className="text-sm text-gray-600">
            Realizá tu pago por transferencia o depósito bancario. Una vez confirmada la
            transferencia, procesamos tu pedido de inmediato.
          </p>
          {config && config.recargo_transferencia > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-800">
                Las transferencias tienen un recargo del{" "}
                <strong>{config.recargo_transferencia}%</strong> sobre el total.
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Los datos bancarios se proporcionan durante el proceso de compra.
          </p>
        </div>

        {/* Pago mixto */}
        {config?.pago_mixto_habilitado && (
          <div className="rounded-xl border border-gray-200 p-5 sm:col-span-2">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <CreditCard className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Pago mixto</h3>
            </div>
            <p className="text-sm text-gray-600">
              Podés combinar efectivo y transferencia para abonar tu pedido, seleccionando la
              opción &quot;Mixto&quot; al momento del checkout.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">
          <strong className="text-gray-700">Importante:</strong> Todos los precios publicados
          incluyen IVA. Los precios pueden variar sin previo aviso.
        </p>
      </div>
    </div>
  );
}
