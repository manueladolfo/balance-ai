import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genAI = geminiApiKey && geminiApiKey !== 'your_google_gemini_api_key'
  ? new GoogleGenerativeAI(geminiApiKey)
  : null;

export async function POST(req: NextRequest) {
  try {
    const { message, selectedDocumentIds } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Falta el mensaje de consulta.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    if (!genAI) {
      return NextResponse.json({ error: 'La API Key de Gemini no está configurada.' }, { status: 412 });
    }

    let contextData = '';

    if (selectedDocumentIds && Array.isArray(selectedDocumentIds) && selectedDocumentIds.length > 0) {
      // Fetch entries and lines for context from Supabase
      const { data: dbEntries, error: dbError } = await supabaseAdmin
        .from('accounting_entries')
        .select(`
          reference,
          concept,
          entry_date,
          is_balanced,
          entry_lines (
            line_type,
            subaccount_code,
            subaccount_desc,
            amount
          )
        `)
        .in('document_id', selectedDocumentIds);

      if (dbError) {
        console.error('Error fetching chat context:', dbError);
      }

      const entries = dbEntries || [];

      if (entries.length > 0) {
        contextData = entries.map((e, i) => {
          const lines = e.entry_lines || [];
          const linesStr = lines.map((l: any) => 
            `- [${l.line_type.toUpperCase()}] Subcuenta: ${l.subaccount_code} (${l.subaccount_desc}) - Importe: €${l.amount.toFixed(2)}`
          ).join('\n');

          return `ASIENTO #${i + 1}:
- Referencia: ${e.reference}
- Concepto General: ${e.concept}
- Fecha: ${e.entry_date}
- Cuadrado: ${e.is_balanced ? 'Sí' : 'No'}
Líneas de Diario:
${linesStr}`;
        }).join('\n\n');
      }
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Eres un asistente de inteligencia artificial contable integrado en la aplicación "Balance AI". Tu objetivo es responder consultas acerca del libro mayor y asientos contables del usuario de manera profesional, clara y precisa en español.

${contextData ? `El usuario ha seleccionado los siguientes asientos contables del historial como contexto para su pregunta:
${contextData}

IMPORTANTE: Céntrate ÚNICAMENTE en analizar estos datos para responder la pregunta del usuario. Si el usuario te hace preguntas no relacionadas, indícale de manera educada que estás enfocado en los asientos seleccionados.` : 'El usuario no ha seleccionado ningún asiento contable específico. Pídele educadamente que seleccione algún documento del historial de arriba para poder realizar análisis detallados sobre sus líneas.'}

Pregunta del usuario:
"${message}"`;

    const response = await model.generateContent(prompt);
    const reply = response.response.text();
    
    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('Chat API route error:', error);
    return NextResponse.json({ error: error.message || 'Error en el chat de IA.' }, { status: 500 });
  }
}
