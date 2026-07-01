import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { geminiApiKey, zaiApiKey } = await req.json();

    if (!geminiApiKey && !zaiApiKey) {
      return NextResponse.json({ error: 'Falta proporcionar al menos una clave API (geminiApiKey o zaiApiKey).' }, { status: 400 });
    }

    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Guardar Gemini API Key si se proporciona
    if (geminiApiKey) {
      process.env.GEMINI_API_KEY = geminiApiKey;
      const regex = /^GEMINI_API_KEY=.*$/m;
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `GEMINI_API_KEY=${geminiApiKey}`);
      } else {
        if (envContent && !envContent.endsWith('\n')) envContent += '\n';
        envContent += `GEMINI_API_KEY=${geminiApiKey}\n`;
      }
    }

    // Guardar Z.ai API Key si se proporciona
    if (zaiApiKey) {
      process.env.Z_AI_API_KEY = zaiApiKey;
      const regex = /^Z_AI_API_KEY=.*$/m;
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `Z_AI_API_KEY=${zaiApiKey}`);
      } else {
        if (envContent && !envContent.endsWith('\n')) envContent += '\n';
        envContent += `Z_AI_API_KEY=${zaiApiKey}\n`;
      }
    }

    try {
      fs.writeFileSync(envPath, envContent, 'utf8');
    } catch (fsError: any) {
      console.warn('Could not persist to .env.local (expected in read-only filesystems like Vercel):', fsError.message);
    }

    return NextResponse.json({ 
      success: true, 
      message: geminiApiKey && zaiApiKey 
        ? 'Claves API de Gemini y Z.ai guardadas correctamente.' 
        : geminiApiKey 
          ? 'Clave API de Gemini guardada correctamente.' 
          : 'Clave API de Z.ai guardada correctamente.' 
    });
  } catch (error: any) {
    console.error('Error saving API Keys:', error);
    return NextResponse.json({ error: error.message || 'Error al guardar la clave API.' }, { status: 500 });
  }
}
