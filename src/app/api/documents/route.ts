import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    // Fetch documents (filter by company_id if provided)
    let docQuery = supabaseAdmin.from('documents').select('*');
    if (companyId) {
      docQuery = docQuery.eq('company_id', companyId);
    }
    const { data: documents, error: docError } = await docQuery.order('created_at', { ascending: false });

    if (docError) {
      throw new Error('Error al consultar documentos de Supabase: ' + docError.message);
    }

    // Fetch entries with lines (filtered by document IDs belonging to the company)
    let entryQuery = supabaseAdmin
      .from('accounting_entries')
      .select(`
        id,
        document_id,
        entry_date,
        entry_number,
        reference,
        concept,
        is_balanced,
        entry_lines (
          id,
          line_type,
          subaccount_code,
          subaccount_desc,
          amount
        )
      `);

    if (companyId) {
      if (documents && documents.length > 0) {
        const docIds = documents.map(d => d.id);
        entryQuery = entryQuery.in('document_id', docIds);
      } else {
        // If there are no documents for this company, there can be no entries
        const hasGeminiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_google_gemini_api_key';
        return NextResponse.json({
          documents: [],
          entries: [],
          supabase: true,
          hasGeminiKey
        });
      }
    }

    const { data: entries, error: entryError } = await entryQuery;

    if (entryError) {
      throw new Error('Error al consultar asientos de Supabase: ' + entryError.message);
    }

    // Format to match layout for unified client rendering
    const formattedEntries = entries?.map((e: any) => ({
      id: e.id,
      document_id: e.document_id,
      entry_date: e.entry_date,
      entry_number: e.entry_number,
      reference: e.reference,
      concept: e.concept,
      is_balanced: e.is_balanced,
      lines: e.entry_lines || []
    })) || [];

    const hasGeminiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_google_gemini_api_key';
    return NextResponse.json({
      documents: documents || [],
      entries: formattedEntries,
      supabase: true,
      hasGeminiKey
    });
  } catch (error: any) {
    console.error('Fetch documents API error:', error);
    return NextResponse.json({ error: error.message || 'Error al recuperar documentos.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { documentId, status } = await req.json();
    if (!documentId || !status) {
      return NextResponse.json({ error: 'Faltan parámetros: documentId y status.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const { data, error } = await supabaseAdmin
      .from('documents')
      .update({ status })
      .eq('id', documentId)
      .select();

    if (error) {
      throw new Error('Error al actualizar documento en Supabase: ' + error.message);
    }
    return NextResponse.json({ success: true, document: data ? data[0] : null });
  } catch (error: any) {
    console.error('Update document API error:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar el documento.' }, { status: 500 });
  }
}
