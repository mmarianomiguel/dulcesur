"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Package, LogOut, AlertCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

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

export default function CuentaPage() {
  const [cliente, setCliente] = useState<ClienteAuth | null>(null);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderCount, setOrderCount] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string>("");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [regNombre, setRegNombre] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regTelefono, setRegTelefono] = useState("");
  const [regDomicilio, setRegDomicilio] = useState("");
  const [regLocalidad, setRegLocalidad] = useState("");
  const [regProvincia, setRegProvincia] = useState("");
  const [regCodigoPostal, setRegCodigoPostal] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  useEffect(() => {
    // Load logo from tienda_config
    supabase.from("tienda_config").select("logo_url").limit(1).single().then(({ data }) => {
      if (data?.logo_url) setLogoUrl(data.logo_url);
    });

    const stored = localStorage.getItem("cliente_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Verify client still exists in DB
      supabase
        .from("clientes_auth")
        .select("id, nombre, email")
        .eq("id", parsed.id)
        .single()
        .then(({ data: clienteDB, error: clienteErr }) => {
          if (clienteErr || !clienteDB) {
            // Client no longer exists — clear stale session
            localStorage.removeItem("cliente_auth");
            setCliente(null);
            return;
          }
          // Update local data with DB values
          const fresh = { id: clienteDB.id, nombre: clienteDB.nombre, email: clienteDB.email };
          setCliente(fresh);
          localStorage.setItem("cliente_auth", JSON.stringify(fresh));
          // Fetch order count
          supabase
            .from("pedidos_tienda")
            .select("id", { count: "exact", head: true })
            .eq("cliente_auth_id", parsed.id)
            .then(({ count }) => {
              if (count !== null) setOrderCount(count);
            });
        });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const hashedInput = await hashPassword(loginPassword);

      const { data, error: dbError } = await supabase
        .from("clientes_auth")
        .select("id, nombre, email, password_hash")
        .eq("email", loginEmail)
        .single();

      if (dbError || !data) {
        setError("Email o contraseña incorrectos.");
        setLoading(false);
        return;
      }

      // Compare with hash AND plaintext (backwards compatibility for old accounts)
      if (data.password_hash !== hashedInput && data.password_hash !== loginPassword) {
        setError("Email o contraseña incorrectos.");
        setLoading(false);
        return;
      }

      // If password was stored in plaintext, upgrade it to hashed
      if (data.password_hash === loginPassword) {
        await supabase
          .from("clientes_auth")
          .update({ password_hash: hashedInput })
          .eq("id", data.id);
      }

      const { password_hash: _, ...clienteData } = data;
      localStorage.setItem("cliente_auth", JSON.stringify(clienteData));
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
      const { data: existing } = await supabase
        .from("clientes_auth")
        .select("id")
        .eq("email", regEmail)
        .single();

      if (existing) {
        setError("Ya existe una cuenta con ese email.");
        setLoading(false);
        return;
      }

      // Create client record first
      const { data: clienteData } = await supabase
        .from("clientes")
        .insert({
          nombre: regNombre,
          email: regEmail,
          telefono: regTelefono || null,
          domicilio: regDomicilio || null,
          localidad: regLocalidad || null,
          provincia: regProvincia || null,
          codigo_postal: regCodigoPostal || null,
          situacion_iva: "Consumidor final",
          origen: "tienda",
        })
        .select("id")
        .single();

      const hashedPassword = await hashPassword(regPassword);

      const { data, error: dbError } = await supabase
        .from("clientes_auth")
        .insert({
          nombre: regNombre,
          email: regEmail,
          telefono: regTelefono,
          password_hash: hashedPassword,
          cliente_id: clienteData?.id || null,
        })
        .select("id, nombre, email")
        .single();

      if (dbError || !data) {
        setError("Error al crear la cuenta.");
        setLoading(false);
        return;
      }

      localStorage.setItem("cliente_auth", JSON.stringify(data));
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
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all placeholder:text-gray-400";
  const selectClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all bg-white text-gray-900";

  if (!cliente) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Logo */}
            <div className="flex justify-center pt-8 pb-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-16 object-contain"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-pink-600 flex items-center justify-center text-white font-bold text-2xl">
                  C
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
                    className="w-full bg-pink-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      placeholder="11 1234-5678"
                      value={regTelefono}
                      onChange={(e) => setRegTelefono(e.target.value)}
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
                            placeholder="1000"
                            value={regCodigoPostal}
                            onChange={(e) => setRegCodigoPostal(e.target.value)}
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
                    className="w-full bg-pink-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-600 to-pink-400 flex items-center justify-center text-white text-xl font-bold shrink-0">
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
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 hover:border-pink-200 hover:shadow-md transition-all duration-200 p-5 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">Mi Perfil</h2>
              <p className="text-gray-400 text-sm">Datos personales, dirección y contraseña</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-pink-400 transition-colors" />
        </Link>

        <Link
          href="/cuenta/pedidos"
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 hover:border-pink-200 hover:shadow-md transition-all duration-200 p-5 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-pink-50 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">Mis Pedidos</h2>
              <p className="text-gray-400 text-sm">
                {orderCount > 0 ? `${orderCount} ${orderCount === 1 ? "pedido" : "pedidos"} realizados` : "Historial de compras"}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-pink-400 transition-colors" />
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
