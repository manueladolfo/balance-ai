import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'No autorizado. Falta el token de acceso.' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    // 1. Inicializar cliente público temporal para validar la identidad del usuario a través de su token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Validar token y obtener los datos de usuario
    const { data: { user }, error: authError } = await tempClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Error de autenticación al intentar borrar usuario:', authError);
      return NextResponse.json({ error: 'Token de acceso no válido o expirado.' }, { status: 401 });
    }

    // 2. Eliminar el usuario de Supabase Auth usando el cliente administrativo
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error de Supabase Admin al borrar usuario:', deleteError);
      throw new Error('No se pudo eliminar la cuenta de usuario de la base de datos: ' + deleteError.message);
    }

    return NextResponse.json({ success: true, message: 'Usuario eliminado permanentemente.' });

  } catch (error: any) {
    console.error('Delete user API error:', error);
    return NextResponse.json({ error: error.message || 'Error interno al eliminar la cuenta.' }, { status: 500 });
  }
}
