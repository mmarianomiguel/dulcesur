"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
  productName?: string;
  getInitialsColor?: (name: string) => React.CSSProperties;
  getProductInitials?: (name: string) => string;
}

/** Compress image client-side before uploading */
function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    // Skip non-image or already small files
    if (!file.type.startsWith("image/") || file.size < 200_000) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function ImageUpload({ value, onChange, className, productName, getInitialsColor, getProductInitials }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setProgress(10);
      try {
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          throw new Error("La imagen es muy grande (máx. 10MB)");
        }

        // Compress
        setProgress(20);
        const compressed = await compressImage(file);
        setProgress(40);

        const formData = new FormData();
        formData.append("file", compressed);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        setProgress(80);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error || "Upload failed");
        }

        const data = await res.json();
        setProgress(100);
        onChange(data.secure_url);
      } catch (err: unknown) {
        const message = err instanceof Error
          ? err.name === "AbortError" ? "Tiempo de espera agotado" : err.message
          : "Error al subir imagen";
        setError(message);
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 500);
      }
    },
    [onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [uploadFile]
  );

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Preview"
            className="w-24 h-24 rounded-lg object-cover border"
          />
          <div className="flex flex-col gap-1 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-center text-xs h-7"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-1" />
              )}
              Cambiar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs h-7 text-muted-foreground"
              onClick={() => onChange("")}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Quitar
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center w-full cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : ""
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-2" />
              <span className="text-sm text-muted-foreground">Subiendo...</span>
              {progress > 0 && (
                <div className="w-3/4 h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          ) : getInitialsColor && getProductInitials && productName ? (
            <div
              className="w-[90px] h-[90px] rounded-xl flex flex-col items-center justify-center text-xl font-semibold"
              style={getInitialsColor(productName || "?")}
            >
              {getProductInitials(productName || "?")}
              <span className="text-[9px] font-normal mt-1 opacity-60">Sin imagen</span>
            </div>
          ) : (
            <div className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center border-muted-foreground/25 hover:border-muted-foreground/50">
              <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">
                Arrastra una imagen o haz clic para seleccionar
              </span>
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
