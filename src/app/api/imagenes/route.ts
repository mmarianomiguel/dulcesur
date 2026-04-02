import { NextResponse } from 'next/server';
import fs from 'fs/promises';

const ALMACEN_PATH = 'c:\\Users\\N3yck\\Desktop\\Proyectos Claude\\almacen.json';

export async function GET() {
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

export async function POST(request: Request) {
  try {
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
