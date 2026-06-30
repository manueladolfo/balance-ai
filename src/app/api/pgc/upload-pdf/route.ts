import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genAI = geminiApiKey && geminiApiKey !== 'your_google_gemini_api_key'
  ? new GoogleGenerativeAI(geminiApiKey)
  : null;

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 500 });
    }

    if (!genAI) {
      return NextResponse.json({ error: 'La API Key de Gemini no está configurada.' }, { status: 412 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const subaccountDigitsStr = formData.get('subaccountDigits');
    const subaccountDigits = subaccountDigitsStr ? Number(subaccountDigitsStr) : 8;
    const companyId = formData.get('companyId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo.' }, { status: 400 });
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Falta proporcionar el ID de la empresa.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64File = buffer.toString('base64');

    // Call Gemini API to extract accounts
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            accounts: {
              type: SchemaType.ARRAY,
              description: 'Lista de cuentas contables extraídas del documento',
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  code: { type: SchemaType.STRING, description: 'Código contable (solo dígitos numéricos, ej. 100, 43000001, 572.1)' },
                  description: { type: SchemaType.STRING, description: 'Descripción o nombre de la cuenta' }
                },
                required: ['code', 'description']
              }
            }
          },
          required: ['accounts']
        }
      }
    });

    const prompt = `Eres un experto contable español. Analiza el documento PDF adjunto que representa un Plan General de Contabilidad (PGC), catálogo de cuentas o balance de sumas y saldos.
Extrae todas las cuentas contables (su código numérico y su nombre/descripción).
Devuelve la lista en un formato JSON estructurado que cumpla con el esquema proporcionado.`;

    const parts = [
      {
        inlineData: {
          data: base64File,
          mimeType: 'application/pdf'
        }
      },
      { text: prompt }
    ];

    const response = await model.generateContent(parts);
    const text = response.response.text();
    let resultJson: { accounts: Array<{ code: string; description: string }> };

    try {
      resultJson = JSON.parse(text);
    } catch (parseError) {
      console.error('Error parsing Gemini output:', text);
      return NextResponse.json({ error: 'El modelo no devolvió un JSON válido.' }, { status: 500 });
    }

    if (!resultJson.accounts || !Array.isArray(resultJson.accounts) || resultJson.accounts.length === 0) {
      return NextResponse.json({ error: 'No se pudieron extraer cuentas contables del PDF.' }, { status: 422 });
    }

    // Map accounts to include is_operational flag based on subaccountDigits and assign companyId
    const dbAccounts = resultJson.accounts
      .map(acc => {
        const cleanCode = acc.code.trim().replace(/\./g, '');
        const isOperational = cleanCode.length >= subaccountDigits;
        return {
          code: acc.code.trim(),
          description: acc.description.trim(),
          is_operational: isOperational,
          company_id: companyId
        };
      })
      // Filter out invalid items
      .filter(acc => acc.code !== '' && acc.description !== '');

    if (dbAccounts.length === 0) {
      return NextResponse.json({ error: 'No se encontraron cuentas contables válidas en el documento.' }, { status: 422 });
    }

    // Upsert accounts in Supabase using the composite key constraint
    const { error: dbError } = await supabaseAdmin
      .from('pgc_accounts')
      .upsert(dbAccounts, { onConflict: 'company_id,code' });

    if (dbError) {
      console.error('Database PGC upsert error:', dbError);
      return NextResponse.json({ error: `Error al guardar en la base de datos: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: dbAccounts.length,
      message: `Se han importado ${dbAccounts.length} cuentas al Plan Contable de la empresa desde el PDF.`
    });

  } catch (error: any) {
    console.error('Upload PDF PGC route error:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
