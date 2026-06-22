import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';
import { mockDb } from '@/lib/mockDb';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = (formData.get('type') as 'Factura' | 'Recibo' | 'Ticket' | 'Extracto' | 'Otro') || 'Factura';

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo.' }, { status: 400 });
    }

    const name = file.name;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let docId = '';
    let storagePath = '';

    if (isSupabaseConfigured() && supabaseAdmin) {
      // 1. Upload to Supabase Storage
      const fileName = `${Date.now()}_${name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const bucketName = 'accounting-docs';

      // Insert file in storage
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(fileName, buffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return NextResponse.json({ error: 'Error al subir el archivo a Supabase Storage.' }, { status: 500 });
      }

      storagePath = uploadData.path;

      // 2. Insert record in Supabase Database
      const { data: dbData, error: dbError } = await supabaseAdmin
        .from('documents')
        .insert({
          name,
          storage_path: storagePath,
          status: 'pending',
          type
        })
        .select()
        .single();

      if (dbError) {
        console.error('Supabase db insert error:', dbError);
        return NextResponse.json({ error: 'Error al guardar el documento en la base de datos.' }, { status: 500 });
      }

      docId = dbData.id;
    } else {
      // 3. Fallback to Local Mock DB and saving to /public/uploads
      const uploadDir = path.join(process.cwd(), 'public/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = `${Date.now()}_${name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);

      storagePath = `/uploads/${fileName}`;
      const newDoc = mockDb.addDocument(name, storagePath, type);
      docId = newDoc.id;
    }

    return NextResponse.json({
      success: true,
      documentId: docId,
      name,
      storagePath,
      message: 'Archivo subido correctamente.'
    });

  } catch (error: any) {
    console.error('Upload route error:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
