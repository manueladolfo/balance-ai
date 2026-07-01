import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { geminiApiKey } = await req.json();
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Falta el parámetro geminiApiKey.' }, { status: 400 });
    }

    // 1. Guardar en memoria de inmediato para esta ejecución
    process.env.GEMINI_API_KEY = geminiApiKey;

    // 2. Intentar persistir en el archivo .env.local de la raíz del proyecto
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Si la variable ya existe, la reemplazamos. Si no, la añadimos.
      const regex = /^GEMINI_API_KEY=.*$/m;
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `GEMINI_API_KEY=${geminiApiKey}`);
      } else {
        // Aseguramos que termine con salto de línea antes de añadir
        if (envContent && !envContent.endsWith('\n')) {
          envContent += '\n';
        }
        envContent += `GEMINI_API_KEY=${geminiApiKey}\n`;
      }
    } else {
      // Creamos el archivo desde cero
      envContent = `GEMINI_API_KEY=${geminiApiKey}\n`;
    }

    try {
      fs.writeFileSync(envPath, envContent, 'utf8');
    } catch (fsError: any) {
      console.warn('Could not persist to .env.local (expected in read-only filesystems like Vercel):', fsError.message);
    }

    return NextResponse.json({ success: true, message: 'Clave API de Gemini guardada y persistida con éxito.' });
  } catch (error: any) {
    console.error('Error saving Gemini API Key:', error);
    return NextResponse.json({ error: error.message || 'Error al guardar la clave API.' }, { status: 500 });
  }
}
