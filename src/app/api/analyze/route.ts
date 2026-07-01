import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getUserIdFromRequest } from '@/lib/auth';

// Initialize Gemini client if API key is provided
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genAI = geminiApiKey && geminiApiKey !== 'your_google_gemini_api_key' 
  ? new GoogleGenerativeAI(geminiApiKey) 
  : null;

export async function POST(req: NextRequest) {
  let docIdForErrorUpdate = '';
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { documentId, fileBase64 } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Falta el ID del documento.' }, { status: 400 });
    }

    docIdForErrorUpdate = documentId;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    if (!genAI) {
      return NextResponse.json({ error: 'La API Key de Gemini no está configurada.' }, { status: 412 });
    }

    let docName = '';
    let storagePath = '';
    let docType = 'Factura';

    // 1. Get document details from Supabase
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'No se encontró el documento en la base de datos.' }, { status: 404 });
    }

    // Verify company ownership
    if (doc.company_id) {
      const { data: company, error: companyError } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('id', doc.company_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (companyError || !company) {
        return NextResponse.json({ error: 'No autorizado para analizar documentos de esta empresa.' }, { status: 403 });
      }
    }

    docName = doc.name;
    storagePath = doc.storage_path;
    docType = doc.type;

    // Update status to processing
    await supabaseAdmin
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // 2. Perform AI analysis with Gemini
    let resultJson: any = null;

    // Retrieve PGC accounts associated with the document's company to teach the AI
    let pgcContext = '';
    if (doc.company_id) {
      const { data: accounts } = await supabaseAdmin
        .from('pgc_accounts')
        .select('code, description')
        .eq('company_id', doc.company_id);
      if (accounts && accounts.length > 0) {
        pgcContext = accounts.map(a => `${a.code}: ${a.description}`).join('\n');
      }
    }

    // Download file bytes or use base64
    let fileBuffer: Buffer;
    let mimeType = 'application/pdf';
    if (docName.toLowerCase().endsWith('.jpg') || docName.toLowerCase().endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (docName.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png';
    }

    if (fileBase64) {
      fileBuffer = Buffer.from(fileBase64, 'base64');
    } else {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('accounting-docs')
        .download(storagePath);

      if (downloadError || !fileData) {
        throw new Error('Error al descargar el archivo de Supabase Storage para analizar.');
      }
      const arrayBuffer = await fileData.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    }

    // Call Gemini API
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            reference: { type: SchemaType.STRING },
            concept: { type: SchemaType.STRING },
            entry_date: { type: SchemaType.STRING, description: 'Format YYYY-MM-DD' },
            ia_description: { type: SchemaType.STRING, description: 'Short summary of the file content' },
            lines: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  line_type: { type: SchemaType.STRING, description: 'Tipo de apunte, debe ser "debe" o "haber"' },
                  subaccount_code: { type: SchemaType.STRING, description: 'Accounting subaccount code (e.g. 628.0001, 472.0021, 410.0055)' },
                  subaccount_desc: { type: SchemaType.STRING, description: 'Accounting subaccount description' },
                  amount: { type: SchemaType.NUMBER }
                },
                required: ['line_type', 'subaccount_code', 'subaccount_desc', 'amount']
              }
            },
            missing_subaccounts: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  code: { type: SchemaType.STRING, description: 'Code of the subaccount that should be created' },
                  description: { type: SchemaType.STRING, description: 'Description of the subaccount that should be created' }
                },
                required: ['code', 'description']
              }
            }
          },
          required: ['reference', 'concept', 'entry_date', 'ia_description', 'lines']
        }
      }
    });

    const base64File = fileBuffer.toString('base64');
    const prompt = `Eres un experto contable español. Analiza el documento adjunto (${docType}) y realiza el asiento contable completo.
Usa las siguientes subcuentas del Plan General de Contabilidad (PGC) del usuario si son adecuadas, o propone cuentas del PGC estándar español de PYMES (como 628 para suministros, 629 para gastos de viaje/diversos, 472 para IVA soportado, 400 para proveedores, 410 para acreedores, 570/572 para caja/bancos, etc.).

Cuentas y subcuentas del usuario:
${pgcContext || 'No hay cuentas definidas, utiliza el estándar del PGC español.'}

INSTRUCCIONES IMPORTANTES:
1. El asiento debe estar perfectamente cuadrado (Suma del Debe = Suma del Haber).
2. Si una subcuenta sugerida no coincide con las del usuario y debe crearse, indícala en la sección "missing_subaccounts".
3. Genera una breve descripción explicativa para "ia_description".
4. Devuelve un formato JSON estructurado válido según el esquema.`;

    const parts = [
      {
        inlineData: {
          data: base64File,
          mimeType: mimeType
        }
      },
      { text: prompt }
    ];

    const response = await model.generateContent(parts);
    const text = response.response.text();
    resultJson = JSON.parse(text);

    // 3. Save entry in Database
    // Save entry header
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('accounting_entries')
      .insert({
        document_id: documentId,
        entry_date: resultJson.entry_date,
        reference: resultJson.reference,
        concept: resultJson.concept,
        is_balanced: true
      })
      .select()
      .single();

    if (entryError) {
      throw new Error('Error al insertar el encabezado del asiento: ' + entryError.message);
    }

    // Save entry lines
    const dbLines = resultJson.lines.map((l: any) => ({
      entry_id: entry.id,
      line_type: l.line_type,
      subaccount_code: l.subaccount_code,
      subaccount_desc: l.subaccount_desc,
      amount: l.amount
    }));

    const { error: linesError } = await supabaseAdmin
      .from('entry_lines')
      .insert(dbLines);

    if (linesError) {
      throw new Error('Error al insertar las líneas del asiento: ' + linesError.message);
    }

    // Update document status
    await supabaseAdmin
      .from('documents')
      .update({ 
        status: 'completed',
        ia_description: resultJson.ia_description
      })
      .eq('id', documentId);

    return NextResponse.json({
      success: true,
      data: resultJson
    });

  } catch (error: any) {
    console.error('Analyze route error:', error);
    
    // Update status to error
    if (supabaseAdmin && docIdForErrorUpdate) {
      try {
        await supabaseAdmin
          .from('documents')
          .update({ status: 'error' })
          .eq('id', docIdForErrorUpdate);
      } catch (dbErr) {
        console.error('Failed to update document status to error:', dbErr);
      }
    }

    return NextResponse.json({ error: error.message || 'Error interno durante el análisis.' }, { status: 500 });
  }
}
