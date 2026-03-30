"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Save, Loader2, Instagram, Facebook, Phone, MapPin, Mail, Check,
  Pencil, Trash2, Plus, FileText,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface FooterConfig {
  descripcion: string;
  logo_url: string;
  instagram_url: string;
  facebook_url: string;
  whatsapp_url: string;
  direccion: string;
  telefono: string;
  email: string;
  mostrar_newsletter: boolean;
  badges: string[];
}

interface PaginaInfo {
  id: string;
  slug: string;
  titulo: string;
  contenido: string;
  activa: boolean;
  orden: number;
}

const DEFAULT_CONFIG: FooterConfig = {
  descripcion: "",
  logo_url: "",
  instagram_url: "",
  facebook_url: "",
  whatsapp_url: "",
  direccion: "",
  telefono: "",
  email: "",
  mostrar_newsletter: true,
  badges: ["Envío a domicilio", "Compra segura", "Múltiples medios de pago", "Atención personalizada"],
};

export default function FooterConfigPage() {
  const [config, setConfig] = useState<FooterConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [paginas, setPaginas] = useState<PaginaInfo[]>([]);
  const [editPage, setEditPage] = useState<PaginaInfo | null>(null);
  const [editForm, setEditForm] = useState({ titulo: "", slug: "", contenido: "", activa: true });
  const [savingPage, setSavingPage] = useState(false);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: tc }, { data: pgs }] = await Promise.all([
      supabase.from("tienda_config").select("footer_config, descripcion, logo_url").limit(1).single(),
      supabase.from("paginas_info").select("*").order("orden"),
    ]);
    if (tc) {
      const fc = (tc as any).footer_config || {};
      setConfig({ ...DEFAULT_CONFIG, ...fc, descripcion: fc.descripcion || tc.descripcion || "", logo_url: fc.logo_url || tc.logo_url || "" });
    }
    setPaginas((pgs as PaginaInfo[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    const { data: tc } = await supabase.from("tienda_config").select("id").limit(1).single();
    if (tc) await supabase.from("tienda_config").update({ footer_config: config } as any).eq("id", tc.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateBadge = (idx: number, value: string) => {
    const b = [...config.badges]; b[idx] = value; setConfig({ ...config, badges: b });
  };

  const openEditPage = (p: PaginaInfo) => {
    setEditPage(p);
    setEditForm({ titulo: p.titulo, slug: p.slug, contenido: p.contenido, activa: p.activa });
  };

  const openNewPage = () => {
    setEditPage({ id: "", slug: "", titulo: "", contenido: "", activa: true, orden: paginas.length });
    setEditForm({ titulo: "", slug: "", contenido: "", activa: true });
  };

  const savePage = async () => {
    setSavingPage(true);
    const slug = editForm.slug || editForm.titulo.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (editPage?.id) {
      await supabase.from("paginas_info").update({ titulo: editForm.titulo, slug, contenido: editForm.contenido, activa: editForm.activa, updated_at: new Date().toISOString() }).eq("id", editPage.id);
    } else {
      await supabase.from("paginas_info").insert({ titulo: editForm.titulo, slug, contenido: editForm.contenido, activa: editForm.activa, orden: paginas.length });
    }
    setEditPage(null);
    fetchData();
    setSavingPage(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-4xl">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Footer y Páginas</h1>
          <p className="text-sm text-muted-foreground">
            Pie de página y contenido informativo de la tienda
          </p>
        </div>
      </div>

      {/* Footer content */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contenido del Footer</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Descripción de la tienda</Label>
            <Textarea value={config.descripcion} onChange={(e) => setConfig({ ...config, descripcion: e.target.value })} placeholder="Tu tienda online..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>URL del logo (footer)</Label>
            <Input value={config.logo_url} onChange={(e) => setConfig({ ...config, logo_url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={config.mostrar_newsletter} onCheckedChange={(v) => setConfig({ ...config, mostrar_newsletter: v })} />
            <Label>Mostrar newsletter</Label>
          </div>
        </CardContent>
      </Card>

      {/* Social & Contact */}
      <Card>
        <CardHeader><CardTitle className="text-base">Redes Sociales y Contacto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Instagram className="w-3.5 h-3.5" />Instagram</Label>
              <Input value={config.instagram_url} onChange={(e) => setConfig({ ...config, instagram_url: e.target.value })} placeholder="https://instagram.com/..." />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Facebook className="w-3.5 h-3.5" />Facebook</Label>
              <Input value={config.facebook_url} onChange={(e) => setConfig({ ...config, facebook_url: e.target.value })} placeholder="https://facebook.com/..." />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />WhatsApp</Label>
              <Input value={config.whatsapp_url} onChange={(e) => setConfig({ ...config, whatsapp_url: e.target.value })} placeholder="https://wa.me/5411..." />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Dirección</Label>
              <Input value={config.direccion} onChange={(e) => setConfig({ ...config, direccion: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Teléfono</Label>
              <Input value={config.telefono} onChange={(e) => setConfig({ ...config, telefono: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Email</Label>
              <Input value={config.email} onChange={(e) => setConfig({ ...config, email: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader><CardTitle className="text-base">Badges de confianza</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {config.badges.map((badge, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input value={badge} onChange={(e) => updateBadge(idx, e.target.value)} />
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={() => setConfig({ ...config, badges: config.badges.filter((_, i) => i !== idx) })}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setConfig({ ...config, badges: [...config.badges, ""] })}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Agregar
          </Button>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Guardar Footer
      </Button>
      {saved && <span className="text-sm text-emerald-600 inline-flex items-center gap-1 ml-3"><Check className="w-4 h-4" />Guardado</span>}

      <Separator />

      {/* Info Pages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle className="text-base">Páginas de Información</CardTitle><CardDescription>Cómo comprar, envíos, FAQ, etc.</CardDescription></div>
            <Button size="sm" onClick={openNewPage}><Plus className="w-4 h-4 mr-1.5" />Nueva</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg divide-y">
            {paginas.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">/info/{p.slug}</p>
                </div>
                <Badge variant={p.activa ? "secondary" : "outline"} className="text-[10px]">{p.activa ? "Activa" : "Oculta"}</Badge>
                <Switch checked={p.activa} onCheckedChange={(v) => { supabase.from("paginas_info").update({ activa: v }).eq("id", p.id).then(() => fetchData()); }} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPage(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletePageId(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
            {paginas.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Sin páginas</div>}
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editPage} onOpenChange={(o) => !o && setEditPage(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editPage?.id ? "Editar página" : "Nueva página"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={editForm.titulo} onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={editForm.slug} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  placeholder={editForm.titulo.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contenido (HTML)</Label>
              <Textarea value={editForm.contenido} onChange={(e) => setEditForm({ ...editForm, contenido: e.target.value })}
                rows={12} className="font-mono text-sm" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editForm.activa} onCheckedChange={(v) => setEditForm({ ...editForm, activa: v })} />
              <Label>Activa</Label>
            </div>
            <Button onClick={savePage} disabled={!editForm.titulo.trim() || savingPage} className="w-full">
              {savingPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete page confirm */}
      <ConfirmDialog
        open={!!deletePageId}
        onOpenChange={(o) => !o && setDeletePageId(null)}
        onConfirm={async () => {
          if (!deletePageId) return;
          await supabase.from("paginas_info").delete().eq("id", deletePageId);
          setDeletePageId(null);
          fetchData();
        }}
        title="Eliminar página"
        description="¿Estás seguro de que querés eliminar esta página de información? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
