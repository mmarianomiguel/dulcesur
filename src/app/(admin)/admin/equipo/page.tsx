"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Pencil, EyeOff, Eye, Loader2, Users } from "lucide-react";
import type { Equipo } from "@/types/equipo";

export default function EquipoAdminPage() {
  const [miembros, setMiembros] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", pin: "", rol: "armador" as Equipo["rol"] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMiembros = useCallback(async () => {
    const { data } = await supabase
      .from("equipo")
      .select("*")
      .order("created_at", { ascending: false });
    setMiembros(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMiembros(); }, [fetchMiembros]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ nombre: "", pin: "", rol: "armador" });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (m: Equipo) => {
    setEditingId(m.id);
    setForm({ nombre: m.nombre, pin: m.pin, rol: m.rol });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError("Nombre requerido"); return; }
    if (!form.pin || form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      setError("PIN debe ser 4 dígitos");
      return;
    }

    // Check PIN uniqueness
    const existing = miembros.find((m) => m.pin === form.pin && m.id !== editingId);
    if (existing) { setError("Este PIN ya está en uso"); return; }

    setSaving(true);
    setError(null);

    if (editingId) {
      await supabase.from("equipo").update({
        nombre: form.nombre.trim(),
        pin: form.pin,
        rol: form.rol,
      }).eq("id", editingId);
    } else {
      await supabase.from("equipo").insert({
        nombre: form.nombre.trim(),
        pin: form.pin,
        rol: form.rol,
      });
    }

    setSaving(false);
    setModalOpen(false);
    await fetchMiembros();
  };

  const toggleActivo = async (m: Equipo) => {
    await supabase.from("equipo").update({ activo: !m.activo }).eq("id", m.id);
    await fetchMiembros();
  };

  const rolLabel = (rol: string) => {
    switch (rol) {
      case "armador": return "Armador";
      case "repartidor": return "Repartidor";
      case "admin": return "Admin";
      default: return rol;
    }
  };

  const rolColor = (rol: string) => {
    switch (rol) {
      case "armador": return "bg-amber-100 text-amber-700";
      case "repartidor": return "bg-blue-100 text-blue-700";
      case "admin": return "bg-violet-100 text-violet-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" /> Equipo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestión de armadores y repartidores
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">PIN</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => (
                <tr key={m.id} className={`border-b last:border-b-0 ${!m.activo ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${rolColor(m.rol)}`}>
                      {rolLabel(m.rol)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500">****</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.activo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {m.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-gray-700">
                      <Pencil className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => toggleActivo(m)} className="text-gray-400 hover:text-gray-700">
                      {m.activo ? <EyeOff className="w-4 h-4 inline" /> : <Eye className="w-4 h-4 inline" />}
                    </button>
                  </td>
                </tr>
              ))}
              {miembros.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No hay miembros del equipo. Agregá uno para comenzar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">
              {editingId ? "Editar miembro" : "Agregar miembro"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Nombre del empleado"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">PIN (4 dígitos)</label>
                <input
                  value={form.pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm({ ...form, pin: v });
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="1234"
                  maxLength={4}
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value as Equipo["rol"] })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="armador">Armador</option>
                  <option value="repartidor">Repartidor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white font-medium text-sm flex items-center justify-center gap-1.5"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Guardar" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
