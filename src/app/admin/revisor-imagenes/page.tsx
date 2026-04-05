'use client';

import { useState, useEffect } from 'react';
import { showAdminToast } from "@/components/admin-toast";

type Producto = {
  id: string;
  nombre: string;
  imagen_url: string | null;
};

export default function RevisorImagenes() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [customUrl, setCustomUrl] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/imagenes')
      .then((res) => res.json())
      .then((data) => {
        setProductos(data);
        setLoading(false);
      });
  }, []);

  const handleSearch = async (id: string, nombre: string) => {
    setSearching((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/buscar-imagen?q=${encodeURIComponent(nombre)}`);
      const data = await res.json();
      if (data.urls) {
        setSuggestions((prev) => ({ ...prev, [id]: data.urls }));
      }
    } catch (e) {
      console.error(e);
    }
    setSearching((prev) => ({ ...prev, [id]: false }));
  };

  const handleSave = async (id: string, imageUrl: string) => {
    try {
      const res = await fetch('/api/imagenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, imageUrl }),
      });
      if (res.ok) {
        // Remover el producto de la lista
        setProductos((prev) => prev.filter((p) => p.id !== id));
      } else {
        showAdminToast('Error al guardar la imagen', 'error');
      }
    } catch (e) {
      console.error(e);
      showAdminToast('Error de conexión', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-4 tracking-tight">
            Revisor de Imágenes
          </h1>
          <p className="text-slate-400 text-lg">
            {loading 
              ? 'Cargando inventario...' 
              : `Quedan ${productos.length} productos sin imagen en tu almacén.`}
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-400"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {productos.slice(0, 100).map((p) => (
              <div 
                key={p.id} 
                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-5 shadow-xl transition-all hover:shadow-emerald-500/10 hover:border-slate-600 flex flex-col"
              >
                <h3 className="text-lg font-semibold text-white mb-4 line-clamp-2 h-14">
                  {p.nombre}
                </h3>
                
                {!suggestions[p.id] && !searching[p.id] ? (
                  <button
                    onClick={() => handleSearch(p.id, p.nombre)}
                    className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95"
                  >
                    Buscar en Google
                  </button>
                ) : searching[p.id] ? (
                  <div className="flex justify-center items-center h-40 bg-slate-800/80 rounded-xl">
                    <div className="animate-pulse flex flex-col items-center">
                      <div className="h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mb-2"></div>
                      <span className="text-indigo-400 text-sm">Buscando...</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-slate-400">Resultados sugeridos:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {suggestions[p.id]?.slice(0,3).map((url, i) => (
                        <div 
                          key={i} 
                          className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-emerald-400 cursor-pointer group"
                          onClick={() => handleSave(p.id, url)}
                        >
                          <img 
                            src={url} 
                            alt={`Sugerencia ${i+1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error'; }}
                          />
                          <div className="absolute inset-0 bg-emerald-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-center text-xs text-slate-500">
                      Haz clic en una imagen para guardarla
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex text-sm">
                    <input 
                      type="text" 
                      placeholder="... o pega una URL directa" 
                      className="flex-1 bg-slate-900/50 border border-slate-700 rounded-l-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                      value={customUrl[p.id] || ''}
                      onChange={(e) => setCustomUrl({...customUrl, [p.id]: e.target.value})}
                    />
                    <button 
                      onClick={() => customUrl[p.id] && handleSave(p.id, customUrl[p.id])}
                      className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-r-lg font-medium transition-colors"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
