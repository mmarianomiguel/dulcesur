import { NextResponse } from 'next/server';
import google from 'googlethis';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ error: "No se proporcionó término de búsqueda" }, { status: 400 });
    }

    const options = {
      page: 0,
      safe: false,
      additional_params: {
        hl: 'es'
      }
    };
    
    // Realiza la búsqueda de imágenes usando googlethis
    // Buscamos agregando la palabra clave 'producto' para mejores resultados
    const images = await google.image(`${query} producto supermercado argentina`, options);
    
    // Retorna solo los primeros 5 resultados viables
    const results = images.slice(0, 5).map((img: any) => img.url);
    
    return NextResponse.json({ urls: results });
  } catch (error) {
    console.error("Error buscando imágenes en Google:", error);
    return NextResponse.json({ error: "Fallo al buscar imágenes" }, { status: 500 });
  }
}
