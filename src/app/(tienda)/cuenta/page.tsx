"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Package, LogOut, AlertCircle, ChevronRight } from "lucide-react";
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
  const [mounted, setMounted] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState("");
  const [orderCount, setOrderCount] = useState(0);
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
        supabase.from("clientes_auth").select("id, nombre, email").eq("id", parsed.id).single(),
        supabase.from("pedidos_tienda").select("id", { count: "exact", head: true }).eq("cliente_auth_id", parsed.id),
      ]).then(([{ data: logoData }, { data: clienteDB, error: clienteErr }, { count }]) => {
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
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Welcome header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              Hola, {cliente.nombre.split(" ")[0]}
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">{cliente.email}</p>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <div className="space-y-3">
        <Link
          href="/cuenta/perfil"
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 hover:border-primary/20 hover:shadow-md transition-all duration-200 p-5 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">Mi Perfil</h2>
              <p className="text-gray-400 text-sm">Datos personales, dirección y contraseña</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
        </Link>

        <Link
          href="/cuenta/pedidos"
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 hover:border-primary/20 hover:shadow-md transition-all duration-200 p-5 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-primary/5 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">Mis Pedidos</h2>
              <p className="text-gray-400 text-sm">
                {orderCount > 0 ? `${orderCount} ${orderCount === 1 ? "pedido" : "pedidos"} realizados` : "Historial de compras"}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between bg-white rounded-2xl border border-gray-100 hover:border-red-200 hover:shadow-md transition-all duration-200 p-5 group text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center">
              <LogOut className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 group-hover:text-red-500 transition-colors">Cerrar sesión</h2>
              <p className="text-gray-400 text-sm">Salir de tu cuenta</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-red-400 transition-colors" />
        </button>
      </div>
    </div>
  );
}
