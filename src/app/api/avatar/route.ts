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
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo.' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar los 5 MB.' }, { status: 400 });
    }

    // The client sends the image already converted to WebP via Canvas API
    const bytes = await file.arrayBuffer();
    const inputBuffer = Buffer.from(bytes);

    const fileName = `${userId}/avatar.webp`;
    const bucketName = 'avatars';

    // Upload to Supabase Storage (upsert to replace existing avatar)
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, inputBuffer, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      return NextResponse.json({ error: 'Error al subir la imagen.' }, { status: 500 });
    }

    // Get public URL with cache-busting timestamp
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(uploadData.path);

    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    // Update profiles table with new avatar_url
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile avatar_url:', updateError);
      return NextResponse.json({ error: 'Error al actualizar el perfil.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      avatarUrl,
      message: 'Foto de perfil actualizada con éxito.'
    });

  } catch (error: unknown) {
    console.error('Avatar upload route error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const fileName = `${userId}/avatar.webp`;

    // Remove from Supabase Storage
    await supabaseAdmin.storage.from('avatars').remove([fileName]);

    // Clear avatar_url in profiles
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', userId);

    if (updateError) {
      console.error('Error clearing profile avatar_url:', updateError);
      return NextResponse.json({ error: 'Error al actualizar el perfil.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Foto de perfil eliminada.' });

  } catch (error: unknown) {
    console.error('Avatar delete route error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
