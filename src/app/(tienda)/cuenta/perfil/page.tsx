"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Lock, Check, AlertCircle, MapPin, DollarSign } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";


const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);

const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
  "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe",
  "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

export default function PerfilPage() {
  const [clienteAuthId, setClienteAuthId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Profile fields
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // Saldo
  const [saldo, setSaldo] = useState(0);
  const [saldoLoaded, setSaldoLoaded] = useState(false);

  // Stats
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [miembroDesde, setMiembroDesde] = useState("");

  // Delivery zone
  const [zonaNombre, setZonaNombre] = useState("");
  const [diasEntrega, setDiasEntrega] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("cliente_auth");
    if (!stored) return;
    const { id } = JSON.parse(stored);
    setClienteAuthId(id);

    const fetchProfile = async () => {
      const { data, error: fetchErr } = await supabase
        .from("clientes_auth")
        .select("nombre, email, telefono, cliente_id")
        .eq("id", id)
        .single();
      if (fetchErr || !data) {
        // Client no longer exists — clear stale session
        localStorage.removeItem("cliente_auth");
        window.location.href = "/cuenta";
        return;
      }
      if (data) {
        setNombre(data.nombre);
        setEmail(data.email);
        setTelefono(data.telefono || "");
        if (data.cliente_id) {
          setClienteId(data.cliente_id);
          // Fetch client details
          const { data: cliente } = await supabase
            .from("clientes")
            .select("tipo_documento, numero_documento, domicilio, provincia, localidad, codigo_postal, saldo, zona_entrega, dias_entrega")
            .eq("id", data.cliente_id)
            .single();
          if (cliente) {
            setTipoDocumento(cliente.tipo_documento || "");
            setNumeroDocumento(cliente.numero_documento || "");
            setDomicilio(cliente.domicilio || "");
            setProvincia(cliente.provincia || "");
            setLocalidad(cliente.localidad || "");
            setCodigoPostal(cliente.codigo_postal || "");
            setSaldo(cliente.saldo || 0);
            setSaldoLoaded(true);
            setDiasEntrega(cliente.dias_entrega || []);
            // Fetch zone name if set
            if (cliente.zona_entrega) {
              const { data: zona } = await supabase.from("zonas_entrega").select("nombre").eq("id", cliente.zona_entrega).single();
              if (zona) setZonaNombre(zona.nombre);
            }
          }
        }
      }
    };
    fetchProfile();

    // Fetch stats
    supabase.from("clientes_auth").select("created_at").eq("id", id).single().then(({ data: authData }) => {
      if (authData?.created_at) {
        const d = new Date(authData.created_at);
        setMiembroDesde(d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }));
      }
    });
    supabase.from("pedidos_tienda").select("id", { count: "exact", head: true }).eq("cliente_auth_id", id).then(({ count }) => {
      if (count != null) setTotalPedidos(count);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteAuthId) return;
    setSaving(true);
    setMsg("");

    // Update clientes_auth
    const { error } = await supabase
      .from("clientes_auth")
      .update({ nombre, email, telefono })
      .eq("id", clienteAuthId);

    // Update or create clientes record
    if (clienteId) {
      await supabase
        .from("clientes")
        .update({
          nombre,
          telefono: telefono || null,
          email: email || null,
          tipo_documento: tipoDocumento || null,
          numero_documento: numeroDocumento || null,
          domicilio: domicilio || null,
          provincia: provincia || null,
          localidad: localidad || null,
          codigo_postal: codigoPostal || null,
        })
        .eq("id", clienteId);
    } else if (clienteAuthId) {
      // Create new client record and link it
      const { data: newCliente } = await supabase
        .from("clientes")
        .insert({
          nombre,
          telefono: telefono || null,
          email: email || null,
          tipo_documento: tipoDocumento || null,
          numero_documento: numeroDocumento || null,
          domicilio: domicilio || null,
          provincia: provincia || null,
          localidad: localidad || null,
          codigo_postal: codigoPostal || null,
          situacion_iva: "Consumidor final",
          origen: "tienda",
        })
        .select("id")
        .single();
      if (newCliente) {
        setClienteId(newCliente.id);
        await supabase
          .from("clientes_auth")
          .update({ cliente_id: newCliente.id })
          .eq("id", clienteAuthId);
      }
    }

    if (error) {
      setMsg("Error al guardar los cambios.");
      showToast("Error al guardar los cambios", "error");
    } else {
      const stored = localStorage.getItem("cliente_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem("cliente_auth", JSON.stringify({ ...parsed, nombre, email }));
      }
      setMsg("Perfil actualizado correctamente.");
      showToast("Perfil actualizado correctamente");
    }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteAuthId) return;
    setPwMsg("");

    if (newPassword !== confirmPassword) {
      setPwMsg("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setPwMsg("La contraseña debe incluir al menos un número.");
      return;
    }

    setPwSaving(true);

    try {
      const res = await fetch("/api/auth/tienda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-password",
          clienteAuthId,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg(data.error || "Error al cambiar la contraseña.");
        showToast("Error al cambiar la contraseña", "error");
      } else {
        setPwMsg("Contraseña actualizada correctamente.");
        showToast("Contraseña actualizada");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPwMsg("Error al cambiar la contraseña.");
      showToast("Error al cambiar la contraseña", "error");
    }
    setPwSaving(false);
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all placeholder:text-gray-400";
  const selectClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all bg-white text-gray-900";

  const initials = nombre
    ? nombre.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "";

  const isError = (m: string) =>
    m.includes("Error") || m.includes("incorrecta") || m.includes("coinciden") || m.includes("menos");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/cuenta"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-pink-600 transition-colors mb-6 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a mi cuenta
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
          <p className="text-gray-400 text-sm mt-1">Administrá tu información personal</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Avatar section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-600 to-pink-400 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-gray-900 text-lg">{nombre || "..."}</h2>
            <p className="text-gray-400 text-sm">{email}</p>
            {(miembroDesde || totalPedidos > 0) && (
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                {miembroDesde && <span>Cliente desde {miembroDesde}</span>}
                {miembroDesde && totalPedidos > 0 && <span>·</span>}
                {totalPedidos > 0 && <span>{totalPedidos} {totalPedidos === 1 ? "pedido" : "pedidos"}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Saldo pendiente */}
        {saldoLoaded && (
          <div className={`rounded-2xl border overflow-hidden ${saldo > 0 ? "border-orange-200 bg-orange-50" : saldo < 0 ? "border-emerald-200 bg-emerald-50" : "border-gray-100 bg-white"}`}>
            <div className="flex items-center gap-3 p-6">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${saldo > 0 ? "bg-orange-100" : saldo < 0 ? "bg-emerald-100" : "bg-gray-100"}`}>
                <DollarSign className={`w-5 h-5 ${saldo > 0 ? "text-orange-600" : saldo < 0 ? "text-emerald-600" : "text-gray-500"}`} />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 text-lg">Estado de cuenta</h2>
                <p className="text-gray-500 text-sm">
                  {saldo > 0 ? "Tenés un saldo pendiente de pago" : saldo < 0 ? "Tenés saldo a favor" : "No tenés deuda pendiente"}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${saldo > 0 ? "text-orange-600" : saldo < 0 ? "text-emerald-600" : "text-gray-400"}`}>
                  {saldo > 0 ? formatCurrency(saldo) : saldo < 0 ? formatCurrency(Math.abs(saldo)) : "$0"}
                </p>
                <p className={`text-xs font-medium ${saldo > 0 ? "text-orange-500" : saldo < 0 ? "text-emerald-500" : "text-gray-400"}`}>
                  {saldo > 0 ? "Deuda pendiente" : saldo < 0 ? "Saldo a favor" : "Al día"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Delivery zone */}
        {diasEntrega.length > 0 && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 overflow-hidden">
            <div className="flex items-center gap-3 p-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 text-lg">Zona de entrega</h2>
                {zonaNombre && <p className="text-blue-700 text-sm font-medium">{zonaNombre}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d, i) => {
                    const fullDay = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][i];
                    const isActive = diasEntrega.includes(fullDay);
                    return (
                      <span key={d} className={`text-xs px-2.5 py-1 rounded-full font-medium ${isActive ? "bg-blue-600 text-white" : "bg-white text-gray-400 border border-gray-200"}`}>
                        {d}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile info */}
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-gray-100">
            <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-pink-600" />
            </div>
            <h2 className="font-bold text-gray-900 text-lg">Datos personales</h2>
          </div>

          <div className="p-6 space-y-5">
            {msg && (
              <div className={`flex items-center gap-2 p-3.5 rounded-xl text-sm font-medium ${isError(msg) ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                {isError(msg) ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
                {msg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre completo</label>
                <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de documento</label>
                <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} className={selectClass}>
                  <option value="">Seleccionar</option>
                  <option value="DNI">DNI</option>
                  <option value="CUIT">CUIT</option>
                  <option value="CUIL">CUIL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Número de documento</label>
                <input type="text" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} placeholder="12345678" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
                <input type="tel" placeholder="11 1234-5678" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Dirección */}
          <div className="border-t border-gray-100">
            <div className="flex items-center gap-3 p-6 pb-0">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="font-bold text-gray-900 text-lg">Domicilio</h2>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
                  <input type="text" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="Calle y número" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Provincia</label>
                  <select value={provincia} onChange={(e) => setProvincia(e.target.value)} className={selectClass}>
                    <option value="">Seleccionar</option>
                    {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Localidad</label>
                  <input type="text" value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Localidad" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Código postal</label>
                  <input type="text" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} placeholder="1234" className={inputClass} />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="bg-pink-600 text-white px-8 py-3 rounded-full font-semibold text-sm hover:bg-pink-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </form>

        {/* Change password */}
        <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-gray-100">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="font-bold text-gray-900 text-lg">Cambiar contraseña</h2>
          </div>

          <div className="p-6 space-y-5">
            {pwMsg && (
              <div className={`flex items-center gap-2 p-3.5 rounded-xl text-sm font-medium ${isError(pwMsg) ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                {isError(pwMsg) ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
                {pwMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña actual</label>
                <input type="password" required placeholder="••••••••" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
                <input type="password" required placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña nueva</label>
                <input type="password" required placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
              </div>
            </div>

            <button
              type="submit"
              disabled={pwSaving}
              className="bg-pink-600 text-white px-8 py-3 rounded-xl font-semibold text-sm hover:bg-pink-700 transition-colors disabled:opacity-50"
            >
              {pwSaving ? "Cambiando..." : "Cambiar contraseña"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
