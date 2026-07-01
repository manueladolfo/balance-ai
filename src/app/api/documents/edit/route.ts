import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const body = await req.json();
    const { documentId, type, reference, entryDate, lines } = body;

    if (!documentId || !type || !entryDate || !Array.isArray(lines)) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios en la petición.' }, { status: 400 });
    }

    // 1. Verificar existencia y pertenencia del documento a través de la compañía
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, company_id')
      .eq('id', documentId)
      .maybeSingle();

    if (docError || !document) {
      return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 });
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', document.company_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para modificar documentos de esta empresa.' }, { status: 403 });
    }

    // 2. Actualizar el tipo de documento en la tabla documents
    const { error: updateDocError } = await supabaseAdmin
      .from('documents')
      .update({ type })
      .eq('id', documentId);

    if (updateDocError) {
      throw new Error('Error al actualizar el tipo de documento: ' + updateDocError.message);
    }

    // 3. Obtener el asiento contable existente
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('accounting_entries')
      .select('id')
      .eq('document_id', documentId)
      .maybeSingle();

    if (entryError) {
      throw new Error('Error al buscar el asiento contable: ' + entryError.message);
    }

    let finalEntryId = entry?.id;

    if (!finalEntryId) {
      // Si por alguna razón no existe el encabezado del asiento, lo creamos
      const { data: newEntry, error: createEntryError } = await supabaseAdmin
        .from('accounting_entries')
        .insert({
          document_id: documentId,
          entry_date: entryDate,
          reference: reference || 'S/R',
          concept: 'Asiento contable corregido',
          is_balanced: true
        })
        .select()
        .single();

      if (createEntryError) {
        throw new Error('Error al crear el encabezado del asiento contable: ' + createEntryError.message);
      }
      finalEntryId = newEntry.id;
    } else {
      // Si ya existe, actualizamos la referencia y fecha
      const { error: updateEntryError } = await supabaseAdmin
        .from('accounting_entries')
        .update({
          entry_date: entryDate,
          reference: reference || 'S/R',
          is_balanced: true
        })
        .eq('id', finalEntryId);

      if (updateEntryError) {
        throw new Error('Error al actualizar el encabezado del asiento contable: ' + updateEntryError.message);
      }
    }

    // 4. Eliminar las apuntaciones (líneas) previas asociadas a este asiento
    const { error: deleteLinesError } = await supabaseAdmin
      .from('entry_lines')
      .delete()
      .eq('entry_id', finalEntryId);

    if (deleteLinesError) {
      throw new Error('Error al limpiar las líneas de asiento previas: ' + deleteLinesError.message);
    }

    // 5. Insertar las nuevas apuntaciones de Debe y Haber
    const linesToInsert = lines.map((l: any) => ({
      entry_id: finalEntryId,
      line_type: l.line_type,
      subaccount_code: l.subaccount_code,
      subaccount_desc: l.subaccount_desc,
      amount: l.amount
    }));

    const { error: insertLinesError } = await supabaseAdmin
      .from('entry_lines')
      .insert(linesToInsert);

    if (insertLinesError) {
      throw new Error('Error al insertar las nuevas apuntaciones: ' + insertLinesError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Asiento contable y tipo de documento actualizados correctamente.'
    });

  } catch (err: any) {
    console.error('Error in /api/documents/edit:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
