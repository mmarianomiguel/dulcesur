"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { useWhiteLabel } from "@/hooks/use-white-label";

function LogoImage({ src, alt, size, className }: { src: string; alt: string; size: number; className?: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-pink-500 text-white font-bold ${className || ""}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {alt.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-xl object-contain ${className || ""}`}
      onError={() => setErrored(true)}
    />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { config: wl } = useWhiteLabel();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const logoSrc = wl.logo_url || "/logo-dulcesur.jpg";
  const appName = wl.system_name || "DulceSur";
  const appSubtitle = wl.system_subtitle || "Gestion Comercial";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
      const loginPromise = supabase.auth.signInWithPassword({ email, password });
      const { error } = await Promise.race([loginPromise, timeoutPromise]) as any;

      if (error) {
        if (error.message === "Invalid login credentials") {
          setError("Email o contraseña incorrectos.");
        } else {
          setError(error.message);
        }
        return;
      }

      logAudit({ userName: email, action: "LOGIN", module: "auth", metadata: { type: "admin" } });
      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      if (err?.message === "timeout") {
        setError("No se pudo conectar al servidor. Verificá tu conexión e intentá de nuevo.");
      } else {
        setError("Ocurrió un error inesperado. Intentá nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)" }}>
        {/* Candy/sweet decorative elements */}
        <div className="absolute -top-10 -left-10 w-64 h-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(233,69,96,0.15) 0%, transparent 70%)" }} />
        <div className="absolute top-1/4 right-10 w-48 h-48 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,183,77,0.12) 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/4 left-1/3 w-56 h-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(129,212,250,0.1) 0%, transparent 70%)" }} />
        <div className="absolute -bottom-20 -right-10 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(186,104,200,0.12) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div>
            <div className="flex items-center gap-3">
              <LogoImage src={logoSrc} alt={appName} size={48} className="shadow-lg" />
              <div>
                <span className="text-2xl font-bold tracking-tight">{appName}</span>
                <p className="text-white/50 text-xs tracking-wider uppercase">{appSubtitle}</p>
              </div>
            </div>
          </div>

          <div className="space-y-8 max-w-lg">
            <div>
              <p className="text-sm font-medium text-amber-400/80 tracking-wider uppercase mb-3">Mayorista de golosinas y kiosco</p>
              <h2 className="text-4xl font-bold leading-tight">
                Todo tu negocio
                <br />
                <span className="bg-gradient-to-r from-amber-300 to-pink-400 bg-clip-text text-transparent">en un solo lugar</span>
              </h2>
            </div>
            <p className="text-white/50 text-lg leading-relaxed">
              Punto de venta, stock, clientes, entregas, reportes y tienda online.
              Diseñado para distribuidores y mayoristas.
            </p>
            <div className="flex gap-6 pt-2">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/10">
                <div className="text-2xl font-bold text-amber-300">POS</div>
                <div className="text-white/40 text-xs mt-1">Punto de venta</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/10">
                <div className="text-2xl font-bold text-pink-300">Stock</div>
                <div className="text-white/40 text-xs mt-1">Control total</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/10">
                <div className="text-2xl font-bold text-sky-300">Web</div>
                <div className="text-white/40 text-xs mt-1">Tienda online</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-white/20 text-sm">
              &copy; {new Date().getFullYear()} {appName}. Todos los derechos reservados.
            </p>
            <p className="text-white/20 text-xs">Francisco Canaro 4012 · Longchamps</p>
          </div>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50/50 px-6 py-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <LogoImage src={logoSrc} alt={appName} size={40} />
            <div>
              <span className="text-xl font-semibold text-gray-900 tracking-tight">{appName}</span>
              <p className="text-gray-400 text-xs">{appSubtitle}</p>
            </div>
          </div>

          <div className="space-y-2 mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Bienvenido</h1>
            <p className="text-gray-500">Ingresá tus credenciales para acceder al panel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-500 text-lg">!</span>
                </div>
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-gray-400"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white pl-11 pr-12 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-gray-400"
                  placeholder="Ingresá tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-50 disabled:hover:shadow-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8 lg:hidden">
            &copy; {new Date().getFullYear()} {wl.system_name || "DulceSur"}
          </p>
        </div>
      </div>
    </div>
  );
}
