"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Plus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";

interface Direccion {
  id: number;
  alias: string;
  calle: string;
  numero: string;
  piso?: string;
  ciudad: string;
  provincia: string;
  codigo_postal: string;
  predeterminada: boolean;
}

const emptyForm = {
  alias: "",
  calle: "",
  numero: "",
  piso: "",
  ciudad: "",
  provincia: "",
  codigo_postal: "",
  predeterminada: false,
};

export default function DireccionesPage() {
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("cliente_auth");
    if (!stored) { window.location.href = "/cuenta"; return; }
    const { id } = JSON.parse(stored);
    setClienteId(id);
    fetchDirecciones(id);
  }, []);

  const fetchDirecciones = async (id: number) => {
    const { data } = await supabase
      .from("cliente_direcciones")
      .select("*")
      .eq("cliente_auth_id", id)
      .order("predeterminada", { ascending: false });

    if (data && data.length > 0) {
      setDirecciones(data);
    } else {
      // Try to create default address from client profile
      const { data: auth } = await supabase
        .from("clientes_auth")
        .select("cliente_id")
        .eq("id", id)
        .single();
      if (auth?.cliente_id) {
        const { data: cliente } = await supabase
          .from("clientes")
          .select("domicilio, localidad, provincia, codigo_postal")
          .eq("id", auth.cliente_id)
          .single();
        if (cliente?.domicilio) {
          const { data: newDir } = await supabase
            .from("cliente_direcciones")
            .insert({
              cliente_auth_id: id,
              alias: "Mi domicilio",
              calle: cliente.domicilio,
              numero: "",
              ciudad: cliente.localidad || "",
              provincia: cliente.provincia || "",
              codigo_postal: cliente.codigo_postal || "",
              predeterminada: true,
            })
            .select("*")
            .single();
          if (newDir) setDirecciones([newDir]);
        }
      }
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) return;
    setSaving(true);

    const payload = { ...form, cliente_auth_id: clienteId };

    if (editingId) {
      await supabase.from("cliente_direcciones").update(payload).eq("id", editingId);
      showToast("Dirección actualizada");
    } else {
      await supabase.from("cliente_direcciones").insert(payload);
      showToast("Dirección guardada");
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSaving(false);
    fetchDirecciones(clienteId);
  };

  const handleEdit = (dir: Direccion) => {
    setForm({
      alias: dir.alias,
      calle: dir.calle,
      numero: dir.numero,
      piso: dir.piso || "",
      ciudad: dir.ciudad,
      provincia: dir.provincia,
      codigo_postal: dir.codigo_postal,
      predeterminada: dir.predeterminada,
    });
    setEditingId(dir.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!clienteId) return;
    if (!confirm("¿Eliminar esta dirección?")) return;
    await supabase.from("cliente_direcciones").delete().eq("id", id);
    showToast("Dirección eliminada", "info");
    fetchDirecciones(clienteId);
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all placeholder:text-gray-400";

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
          <h1 className="text-2xl font-bold text-gray-900">Mis Direcciones</h1>
          <p className="text-gray-400 text-sm mt-1">Gestioná tus direcciones de envío</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setForm(emptyForm);
              setEditingId(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 bg-pink-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-pink-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar dirección
          </button>
        )}
      </div>

      {/* Modal overlay for form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Editar dirección" : "Nueva dirección"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Alias</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Casa, Oficina"
                  value={form.alias}
                  onChange={(e) => setForm({ ...form, alias: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Calle</label>
                  <input
                    type="text"
                    required
                    value={form.calle}
                    onChange={(e) => setForm({ ...form, calle: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Número</label>
                  <input
                    type="text"
                    required
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Piso / Depto</label>
                <input
                  type="text"
                  placeholder="Opcional"
                  value={form.piso}
                  onChange={(e) => setForm({ ...form, piso: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ciudad</label>
                  <input
                    type="text"
                    required
                    value={form.ciudad}
                    onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Provincia</label>
                  <input
                    type="text"
                    required
                    value={form.provincia}
                    onChange={(e) => setForm({ ...form, provincia: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Código postal</label>
                <input
                  type="text"
                  required
                  value={form.codigo_postal}
                  onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={form.predeterminada}
                  onChange={(e) => setForm({ ...form, predeterminada: e.target.checked })}
                  className="accent-pink-600 w-4 h-4 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Usar como dirección predeterminada</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-pink-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-pink-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar dirección"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="px-6 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="w-24 h-4 bg-gray-200 rounded mb-3" />
              <div className="w-48 h-3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : direcciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No tenés direcciones guardadas</p>
          <p className="text-gray-400 text-sm mt-1">Agregá una dirección para agilizar tus compras</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {direcciones.map((dir) => (
            <div
              key={dir.id}
              className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-md ${
                dir.predeterminada ? "border-pink-200 bg-pink-50/30" : "border-gray-100"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-pink-50 rounded-lg flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-pink-600" />
                  </div>
                  <span className="font-bold text-gray-900">{dir.alias}</span>
                  {dir.predeterminada && (
                    <span className="text-xs bg-pink-100 text-pink-700 px-2.5 py-0.5 rounded-full font-semibold">
                      Predeterminada
                    </span>
                  )}
                </div>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                {dir.calle} {dir.numero}
                {dir.piso ? `, ${dir.piso}` : ""}
                <br />
                {dir.ciudad}, {dir.provincia} ({dir.codigo_postal})
              </p>
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleEdit(dir)}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-pink-600 transition-colors font-medium"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => handleDelete(dir.id)}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
