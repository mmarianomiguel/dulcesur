import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@supabase/ssr";
import fs from 'fs/promises';
import path from 'path';

const ALMACEN_PATH = path.join(process.cwd(), 'almacen.json');

async function checkAdmin(request: NextRequest): Promise<boolean> {
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return request.cookies.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return !!user;
}

export async function GET(request: NextRequest) {
  try {
    const data = await fs.readFile(ALMACEN_PATH, 'utf-8');
    const productos = JSON.parse(data);
    
    // Retornamos todos, pero podemos enfocar el frontend en los que no tienen imagen
    // Por eficiencia, mandamos solo los que no tienen imagen
    const sinImagen = productos.filter((p: any) => !p.imagen_url || p.imagen_url === "");
    return NextResponse.json(sinImagen);
  } catch(e) {
    return NextResponse.json({error: 'Error al leer almacen.json'}, {status: 500});
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { id, imageUrl } = await request.json();
    const data = await fs.readFile(ALMACEN_PATH, 'utf-8');
    const productos = JSON.parse(data);
    
    let updated = false;
    for (const p of productos) {
      if (p.id === id) {
        p.imagen_url = imageUrl;
        updated = true;
        break;
      }
    }
    
    if (updated) {
      await fs.writeFile(ALMACEN_PATH, JSON.stringify(productos, null, 2), 'utf-8');
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
  } catch(e) {
    return NextResponse.json({error: 'Error al escribir almacen.json'}, {status: 500});
  }
}
