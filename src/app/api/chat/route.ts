import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';
import { mockDb } from '@/lib/mockDb';
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

    let contextData = '';

    if (selectedDocumentIds && Array.isArray(selectedDocumentIds) && selectedDocumentIds.length > 0) {
      let entries: any[] = [];

      // Fetch entries and lines for context
      if (isSupabaseConfigured() && supabaseAdmin) {
        const { data: dbEntries } = await supabaseAdmin
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
        entries = dbEntries || [];
      } else {
        const mockEntries = mockDb.getEntries();
        entries = mockEntries.filter(e => selectedDocumentIds.includes(e.document_id));
      }

      if (entries.length > 0) {
        contextData = entries.map((e, i) => {
          const lines = e.entry_lines || e.lines || [];
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

    if (genAI) {
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
    } else {
      // Offline / Local Mock Simulation
      await new Promise(resolve => setTimeout(resolve, 1000));
      let reply = '';

      if (!contextData) {
        reply = 'Por favor, selecciona algún documento del historial superior marcando la casilla de verificación. Una vez seleccionado, podré analizar detalladamente sus cuentas, impuestos e importes.';
      } else {
        // Calculate sum of debit/credit or tax details for the selected mock items
        let totalAmount = 0;
        let vatAmount = 0;
        const dbEntries = selectedDocumentIds.map((id: string) => {
          if (isSupabaseConfigured()) return null; // shouldn't happen here
          return mockDb.getEntryByDocumentId(id);
        }).filter(Boolean);

        dbEntries.forEach((e: any) => {
          const lines = e.lines || [];
          lines.forEach((l: any) => {
            if (l.line_type === 'debe' && l.subaccount_code.startsWith('472')) {
              vatAmount += l.amount;
            }
            if (l.line_type === 'debe' && !l.subaccount_code.startsWith('472')) {
              totalAmount += l.amount;
            }
          });
        });

        if (message.toLowerCase().includes('iva') || message.toLowerCase().includes('impuesto')) {
          reply = `Analizando los documentos seleccionados, he verificado que el IVA acumulado asciende a **€${vatAmount.toFixed(2)}** (correspondiente a la subcuenta 472.0021 de IVA Soportado al 21%). ¿Deseas que prepare una plantilla de exportación fiscal?`;
        } else if (message.toLowerCase().includes('total') || message.toLowerCase().includes('cuanto') || message.toLowerCase().includes('suma')) {
          reply = `La suma total de los importes base (sin IVA) de los asientos seleccionados es de **€${totalAmount.toFixed(2)}**. Los asientos se encuentran perfectamente conciliados y cuadrados.`;
        } else {
          reply = `[Simulación Local - Sin API Key de Gemini] He recibido tu consulta: "${message}". He analizado los ${dbEntries.length} asiento(s) seleccionados. Las subcuentas utilizadas son de la serie 628/629 (Gastos/Suministros) y están debidamente contrapartidas con acreedores (serie 410) o caja (serie 570).`;
        }
      }

      return NextResponse.json({ reply });
    }

  } catch (error: any) {
    console.error('Chat API route error:', error);
    return NextResponse.json({ error: error.message || 'Error en el chat de IA.' }, { status: 500 });
  }
}
