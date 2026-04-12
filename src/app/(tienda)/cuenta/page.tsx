"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Package, AlertCircle, ChevronRight, Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";


const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
  "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe",
  "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

interface ClienteAuth {
  id: number;
  nombre: string;
  email: string;
}

function getStoredCliente(): ClienteAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("cliente_auth");
    if (stored) { const p = JSON.parse(stored); if (p?.id) return p; }
  } catch {}
  return null;
}

export default function CuentaPage() {
  const [cliente, setCliente] = useState<ClienteAuth | null>(getStoredCliente);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState("");
  const [orderCount, setOrderCount] = useState(0);
  const [clienteSaldo, setClienteSaldo] = useState<number | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>("https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png");
  const [logoError, setLogoError] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [regNombre, setRegNombre] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regTelefono, setRegTelefono] = useState("");
  const [regDni, setRegDni] = useState("");
  const [regDomicilio, setRegDomicilio] = useState("");
  const [regLocalidad, setRegLocalidad] = useState("");
  const [regProvincia, setRegProvincia] = useState("");
  const [regCodigoPostal, setRegCodigoPostal] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  useEffect(() => {
    setMounted(true);

    const stored = localStorage.getItem("cliente_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Verify client, load logo, and count orders all in parallel
      Promise.all([
        supabase.from("tienda_config").select("logo_url").limit(1).single(),
        supabase.from("clientes_auth").select("id, nombre, email, cliente_id").eq("id", parsed.id).single(),
        supabase.from("pedidos_tienda").select("id", { count: "exact", head: true }).eq("cliente_auth_id", parsed.id),
        supabase.from("pedidos_tienda").select("created_at").eq("cliente_auth_id", parsed.id).order("created_at", { ascending: false }).limit(1),
      ]).then(async ([{ data: logoData }, { data: clienteDB, error: clienteErr }, { count }, { data: ultimoData }]) => {
        if (logoData?.logo_url) setLogoUrl(logoData.logo_url);
        if (clienteErr || !clienteDB) {
          localStorage.removeItem("cliente_auth");
          setCliente(null);
          setCheckingAuth(false);
          return;
        }
        const fresh = { id: clienteDB.id, nombre: clienteDB.nombre, email: clienteDB.email };
        setCliente(fresh);
        setCheckingAuth(false);
        localStorage.setItem("cliente_auth", JSON.stringify(fresh));
        if (count !== null) setOrderCount(count);
        if (ultimoData && ultimoData.length > 0) {
          const fecha = new Date(ultimoData[0].created_at);
          setUltimoPedido(fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short" }));
        }
        if ((clienteDB as any).cliente_id) {
          const { data: clienteData } = await supabase
            .from("clientes")
            .select("saldo")
            .eq("id", (clienteDB as any).cliente_id)
            .single();
          if (clienteData) setClienteSaldo((clienteData as any).saldo ?? 0);
        }
      });
    } else {
      // Load logo only
      supabase.from("tienda_config").select("logo_url").limit(1).single().then(({ data }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url);
      });
      setCheckingAuth(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/tienda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión.");
        setLoading(false);
        return;
      }
      localStorage.setItem("cliente_auth", JSON.stringify(data.cliente));
      window.location.reload();
    } catch {
      setError("Error al iniciar sesión.");
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (regPassword !== regConfirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/tienda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          nombre: regNombre,
          email: regEmail,
          password: regPassword,
          telefono: regTelefono,
          dni: regDni,
          domicilio: regDomicilio,
          localidad: regLocalidad,
          provincia: regProvincia,
          codigoPostal: regCodigoPostal,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear la cuenta.");
        setLoading(false);
        return;
      }
      localStorage.setItem("cliente_auth", JSON.stringify(data.cliente));
      window.location.reload();
    } catch {
      setError("Error al registrarse.");
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("cliente_auth");
    setCliente(null);
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-400";
  const selectClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-white text-gray-900";

  // Show spinner during SSR hydration / auth check to avoid flash of login form
  if (!mounted || (!cliente && checkingAuth)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Logo */}
            <div className="flex justify-center pt-8 pb-4">
              {!logoError ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-16 object-contain"
                  onError={() => {
                    if (logoUrl !== "https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png") {
                      setLogoUrl("https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png");
                    } else {
                      setLogoError(true);
                    }
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-2xl">
                  D
                </div>
              )}
            </div>

            <div className="px-8 pb-8">
              {/* Tab toggle */}
              <div className="bg-gray-100 rounded-xl p-1 flex mb-6">
                <button
                  onClick={() => { setTab("login"); setError(""); }}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                    tab === "login"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  onClick={() => { setTab("register"); setError(""); }}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                    tab === "register"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Crear cuenta
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-5 flex items-center gap-2 p-3 bg-red-50 rounded-xl text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {tab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="tu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-white py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Ingresando...
                      </span>
                    ) : (
                      "Iniciar sesión"
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nombre completo
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Juan Pérez"
                      value={regNombre}
                      onChange={(e) => setRegNombre(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="tu@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="11 1234-5678"
                      value={regTelefono}
                      onChange={(e) => setRegTelefono(e.target.value.replace(/[^0-9\s\-+]/g, ""))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      DNI
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="12345678"
                      value={regDni}
                      onChange={(e) => setRegDni(e.target.value.replace(/\D/g, ""))}
                      className={inputClass}
                    />
                  </div>

                  {/* Address section */}
                  <div className="border-t border-gray-100 pt-4 mt-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dirección de envío</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Dirección (calle y número)
                        </label>
                        <input
                          type="text"
                          placeholder="Av. San Martín 1234"
                          value={regDomicilio}
                          onChange={(e) => setRegDomicilio(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Localidad
                          </label>
                          <input
                            type="text"
                            placeholder="Ciudad"
                            value={regLocalidad}
                            onChange={(e) => setRegLocalidad(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Código postal
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="1000"
                            value={regCodigoPostal}
                            onChange={(e) => setRegCodigoPostal(e.target.value.replace(/\D/g, ""))}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Provincia
                        </label>
                        <select
                          value={regProvincia}
                          onChange={(e) => setRegProvincia(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">Seleccionar provincia</option>
                          {PROVINCIAS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Confirmar contraseña
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-white py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creando cuenta...
                      </span>
                    ) : (
                      "Crear cuenta"
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const initials = cliente.nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const primerNombre = cliente.nombre.trim().split(" ")[0];

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-4">

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-base font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900">Hola, {primerNombre}</h1>
          <p className="text-xs text-gray-400 truncate">{cliente.email}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium mb-1">Pedidos</p>
          <p className="text-2xl font-bold text-gray-900">{orderCount}</p>
          {ultimoPedido && <p className="text-[10px] text-gray-400 mt-0.5">Último: {ultimoPedido}</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium mb-1">Cuenta</p>
          {clienteSaldo === null ? (
            <p className="text-sm text-gray-300 mt-1">—</p>
          ) : clienteSaldo > 0 ? (
            <p className="text-base font-bold text-orange-500 mt-1">
              {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(clienteSaldo)}
            </p>
          ) : (
            <p className="text-base font-semibold text-green-600 mt-1">✓ Al día</p>
          )}
          {clienteSaldo !== null && clienteSaldo > 0 && (
            <p className="text-[10px] text-orange-400 mt-0.5">Saldo pendiente</p>
          )}
        </div>
      </div>

      {/* Aviso saldo — solo si tiene deuda */}
      {clienteSaldo !== null && clienteSaldo > 0 && (
        <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
          <p className="text-xs text-orange-700 flex-1">Tenés un saldo pendiente con la tienda</p>
          <p className="text-xs font-bold text-orange-600">
            {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(clienteSaldo)}
          </p>
        </div>
      )}

      {/* Nav links */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        <Link
          href="/cuenta/perfil"
          className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">Mi Perfil</p>
            <p className="text-xs text-gray-400">Datos y dirección de envío</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" />
        </Link>

        <Link
          href="/cuenta/pedidos"
          className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">Mis Pedidos</p>
            <p className="text-xs text-gray-400">
              {orderCount > 0 ? `${orderCount} ${orderCount === 1 ? "pedido" : "pedidos"} realizados` : "Historial de compras"}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" />
        </Link>

        <Link
          href="/cuenta/notificaciones"
          className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">Notificaciones</p>
            <p className="text-xs text-gray-400">Preferencias y alertas</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" />
        </Link>
      </div>

      {/* Cerrar sesión */}
      <div className="text-center pt-2">
        {!showLogoutConfirm ? (
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="text-sm text-gray-400 hover:text-red-500 active:text-red-600 transition-colors duration-200"
          >
            Cerrar sesión
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3 animate-in fade-in duration-200">
            <span className="text-sm text-gray-500">¿Seguro que querés salir?</span>
            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:scale-95 px-4 py-1.5 rounded-full transition-all duration-150"
            >
              Sí, salir
            </button>
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
