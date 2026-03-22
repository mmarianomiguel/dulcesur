"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Paintbrush,
  RotateCcw,
  Check,
  Image,
  Type,
  Palette,
  Eye,
  SunMedium,
} from "lucide-react";
import { useWhiteLabel, type WhiteLabelConfig } from "@/hooks/use-white-label";

const PRESET_COLORS: { name: string; hue: number; sidebarL: number }[] = [
  { name: "Azul (Default)", hue: 264, sidebarL: 0.16 },
  { name: "Verde", hue: 155, sidebarL: 0.14 },
  { name: "Rojo", hue: 25, sidebarL: 0.15 },
  { name: "Naranja", hue: 45, sidebarL: 0.16 },
  { name: "Rosa", hue: 330, sidebarL: 0.15 },
  { name: "Cyan", hue: 195, sidebarL: 0.14 },
  { name: "Violeta", hue: 290, sidebarL: 0.16 },
  { name: "Gris", hue: 260, sidebarL: 0.18 },
];

function ColorCircle({ hue, selected, onClick }: { hue: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-10 h-10 rounded-full border-2 transition-all ${selected ? "border-foreground scale-110 shadow-lg" : "border-transparent hover:scale-105"}`}
      style={{ background: `oklch(0.5 0.18 ${hue})` }}
    >
      {selected && <Check className="w-4 h-4 text-white mx-auto" />}
    </button>
  );
}

export default function WhiteLabelPage() {
  const { config, update, reset, DEFAULT_CONFIG } = useWhiteLabel();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    reset();
    setSaved(false);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Personalización</h1>
        <p className="text-muted-foreground text-sm">
          Configura el nombre, logo y colores del panel de administración
        </p>
      </div>

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="w-4 h-4" />
            Identidad
          </CardTitle>
          <CardDescription>Nombre y logo del sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre del sistema</Label>
              <Input
                value={config.system_name}
                onChange={(e) => update({ system_name: e.target.value })}
                placeholder="Nombre del sistema"
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitulo</Label>
              <Input
                value={config.system_subtitle}
                onChange={(e) => update({ system_subtitle: e.target.value })}
                placeholder="Subtítulo del sistema"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inicial del logo</Label>
              <Input
                value={config.logo_initial}
                onChange={(e) => update({ logo_initial: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="C"
                maxLength={2}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <Label>URL del logo (opcional)</Label>
              <Input
                value={config.logo_url}
                onChange={(e) => update({ logo_url: e.target.value })}
                placeholder="https://..."
              />
              <p className="text-[11px] text-muted-foreground">Si se ingresa, reemplaza la inicial en el sidebar</p>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 rounded-xl border bg-muted/30">
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1"><Eye className="w-3 h-3" /> Vista previa del sidebar</p>
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: `oklch(${config.sidebar_lightness} 0.03 ${config.primary_hue})` }}>
              {config.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.logo_url} alt="Logo" className="w-9 h-9 rounded-lg object-contain bg-white/10" />
              ) : (
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-white font-bold text-lg"
                  style={{ background: `oklch(0.55 0.2 ${config.primary_hue})` }}
                >
                  {config.logo_initial || "C"}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">
                  {config.system_name || "Dulcesur"}
                </span>
                <span className="text-[11px] text-white/50">
                  {config.system_subtitle || "Gestión Comercial"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="w-4 h-4" />
            Colores
          </CardTitle>
          <CardDescription>Color principal y apariencia del sidebar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Presets */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Presets</Label>
            <div className="flex flex-wrap gap-3">
              {PRESET_COLORS.map((preset) => (
                <div key={preset.name} className="flex flex-col items-center gap-1">
                  <ColorCircle
                    hue={preset.hue}
                    selected={Math.abs(config.primary_hue - preset.hue) < 5}
                    onClick={() => update({ primary_hue: preset.hue, sidebar_lightness: preset.sidebarL })}
                  />
                  <span className="text-[10px] text-muted-foreground">{preset.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Custom */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Paintbrush className="w-3 h-3" />
                Color primario (Hue: {config.primary_hue})
              </Label>
              <input
                type="range"
                min={0}
                max={360}
                value={config.primary_hue}
                onChange={(e) => update({ primary_hue: Number(e.target.value) })}
                className="w-full h-3 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right,
                    oklch(0.5 0.18 0), oklch(0.5 0.18 60), oklch(0.5 0.18 120),
                    oklch(0.5 0.18 180), oklch(0.5 0.18 240), oklch(0.5 0.18 300), oklch(0.5 0.18 360))`,
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <SunMedium className="w-3 h-3" />
                Oscuridad del sidebar ({(config.sidebar_lightness * 100).toFixed(0)}%)
              </Label>
              <input
                type="range"
                min={5}
                max={30}
                value={config.sidebar_lightness * 100}
                onChange={(e) => update({ sidebar_lightness: Number(e.target.value) / 100 })}
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-gray-900 to-gray-400"
              />
            </div>
          </div>

          {/* Color preview squares */}
          <div className="grid grid-cols-4 gap-3 mt-2">
            <div className="space-y-1">
              <div className="h-12 rounded-lg" style={{ background: `oklch(0.45 0.18 ${config.primary_hue})` }} />
              <p className="text-[10px] text-muted-foreground text-center">Primary</p>
            </div>
            <div className="space-y-1">
              <div className="h-12 rounded-lg" style={{ background: `oklch(${config.sidebar_lightness} 0.03 ${config.primary_hue})` }} />
              <p className="text-[10px] text-muted-foreground text-center">Sidebar</p>
            </div>
            <div className="space-y-1">
              <div className="h-12 rounded-lg" style={{ background: `oklch(0.55 0.2 ${config.primary_hue})` }} />
              <p className="text-[10px] text-muted-foreground text-center">Accent</p>
            </div>
            <div className="space-y-1">
              <div className="h-12 rounded-lg border" style={{ background: `oklch(0.94 0.02 ${config.primary_hue})` }} />
              <p className="text-[10px] text-muted-foreground text-center">Subtle</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Restablecer valores
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 flex items-center gap-1">
            <Check className="w-4 h-4" />
            Los cambios se aplican en tiempo real
          </span>
        )}
      </div>
    </div>
  );
}
