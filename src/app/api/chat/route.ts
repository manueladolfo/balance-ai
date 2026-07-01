import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getUserIdFromRequest } from '@/lib/auth';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genAI = geminiApiKey && geminiApiKey !== 'your_google_gemini_api_key'
  ? new GoogleGenerativeAI(geminiApiKey)
  : null;

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { message, selectedDocumentIds, file, provider } = await req.json();

    if (!message && !file) {
      return NextResponse.json({ error: 'Falta el mensaje o el archivo de consulta.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const isZai = provider === 'zai';
    const zaiApiKey = process.env.Z_AI_API_KEY || '';

    if (isZai) {
      if (!zaiApiKey || zaiApiKey === 'your_z_ai_api_key') {
        return NextResponse.json({ error: 'La API Key de Z.ai no está configurada.' }, { status: 412 });
      }
    } else {
      if (!genAI) {
        return NextResponse.json({ error: 'La API Key de Gemini no está configurada.' }, { status: 412 });
      }
    }

    let contextData = '';

    if (selectedDocumentIds && Array.isArray(selectedDocumentIds) && selectedDocumentIds.length > 0) {
      // Verify documents belong to companies owned by the authenticated user
      const { data: docs, error: checkError } = await supabaseAdmin
        .from('documents')
        .select('company_id')
        .in('id', selectedDocumentIds);

      if (checkError) {
        console.error('Error checking documents ownership:', checkError);
        return NextResponse.json({ error: 'Error de verificación de permisos.' }, { status: 500 });
      }

      if (docs && docs.length > 0) {
        const companyIds = Array.from(new Set(docs.map(d => d.company_id).filter(Boolean)));

        if (companyIds.length > 0) {
          const { data: userCompanies, error: compCheckError } = await supabaseAdmin
            .from('companies')
            .select('id')
            .in('id', companyIds)
            .eq('user_id', userId);

          if (compCheckError || !userCompanies || userCompanies.length !== companyIds.length) {
            return NextResponse.json({ error: 'No autorizado para consultar estos documentos.' }, { status: 403 });
          }
        }
      }

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

    let reply = '';
    const systemPrompt = `Eres un asistente de inteligencia artificial contable integrado en la aplicación "Balance AI". Tu objetivo es responder consultas acerca del libro mayor y asientos contables del usuario de manera profesional, clara y precisa en español.`;

    if (isZai) {
      // Call Z.ai API
      const zaiMessages: any[] = [
        { role: 'system', content: systemPrompt }
      ];

      let userText = '';
      if (contextData) {
        userText += `El usuario ha seleccionado los siguientes asientos contables del historial como contexto para su pregunta:\n${contextData}\n\nIMPORTANTE: Céntrate principalmente en analizar estos datos para responder la pregunta del usuario.\n\n`;
      }
      userText += `Pregunta del usuario:\n"${message || 'Analiza el documento adjunto.'}"`;

      const contentPart: any[] = [{ type: 'text', text: userText }];

      if (file && file.base64 && file.type) {
        contentPart.push({
          type: 'image_url',
          image_url: {
            url: `data:${file.type};base64,${file.base64}`
          }
        });
      }

      zaiMessages.push({ role: 'user', content: contentPart });

      const modelName = file ? 'glm-4v-flash' : 'glm-5.2';

      const zaiRes = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: zaiMessages,
          temperature: 0.7
        })
      });

      if (!zaiRes.ok) {
        const errorText = await zaiRes.text();
        throw new Error(`Error de la API de Z.ai (${zaiRes.status}): ${errorText}`);
      }

      const zaiData = await zaiRes.json();
      reply = zaiData.choices?.[0]?.message?.content || '';
    } else {
      // Call Gemini API
      const model = genAI!.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `${systemPrompt}\n${file ? 'Se adjunta un archivo en esta consulta para que lo analices e interpretes en base a la pregunta del usuario.' : ''}\n\n${contextData ? `El usuario ha seleccionado los siguientes asientos contables del historial como contexto para su pregunta:\n${contextData}\n\nIMPORTANTE: Céntrate principalmente en analizar estos datos para responder la pregunta del usuario.` : 'El usuario no ha seleccionado ningún asiento contable específico como contexto.'}\n\nPregunta del usuario:\n"${message || 'Analiza el documento adjunto.'}"`;

      const chatContents: any[] = [prompt];
      
      if (file && file.base64 && file.type) {
        chatContents.push({
          inlineData: {
            data: file.base64,
            mimeType: file.type
          }
        });
      }

      const response = await model.generateContent(chatContents);
      reply = response.response.text();
    }

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('Chat API route error:', error);
    return NextResponse.json({ error: error.message || 'Error en el chat de IA.' }, { status: 500 });
  }
}
