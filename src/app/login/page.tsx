"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { useWhiteLabel } from "@/hooks/use-white-label";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const { config: wl } = useWhiteLabel();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/3 -right-20 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 left-1/4 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full bg-white/10" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "32px 32px"
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div>
            <div className="flex items-center gap-3">
              <Image src="/icon.png" alt="DulceSur" width={40} height={40} className="rounded-xl" />
              <div>
                <span className="text-xl font-semibold tracking-tight">DulceSur</span>
                <p className="text-white/60 text-xs">Software de Gestión</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 max-w-md">
            <h2 className="text-4xl font-bold leading-tight">
              Gestión comercial
              <br />
              <span className="text-white/80">simple y eficiente</span>
            </h2>
            <p className="text-white/60 text-lg leading-relaxed">
              Controlá tus ventas, stock, clientes y más desde un solo lugar.
              Todo lo que tu negocio necesita para crecer.
            </p>
            <div className="flex gap-8 pt-4">
              <div>
                <div className="text-2xl font-bold">100%</div>
                <div className="text-white/50 text-sm">En la nube</div>
              </div>
              <div>
                <div className="text-2xl font-bold">24/7</div>
                <div className="text-white/50 text-sm">Disponible</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Fácil</div>
                <div className="text-white/50 text-sm">De usar</div>
              </div>
            </div>
          </div>

          <p className="text-white/30 text-sm">
            &copy; {new Date().getFullYear()} {wl.system_name || "DulceSur"}. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50/50 px-6 py-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <Image src="/icon.png" alt="DulceSur" width={40} height={40} className="rounded-xl" />
            <div>
              <span className="text-xl font-semibold text-gray-900 tracking-tight">DulceSur</span>
              <p className="text-gray-400 text-xs">Software de Gestión</p>
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
