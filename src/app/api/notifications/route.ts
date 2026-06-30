import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

// GET: Obtener las notificaciones de la empresa seleccionada
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Falta especificar el ID de la empresa.' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para acceder a esta empresa.' }, { status: 403 });
    }

    // Fetch notifications
    const { data: notifications, error: notifError } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (notifError) {
      throw new Error('Error al consultar notificaciones: ' + notifError.message);
    }

    return NextResponse.json({ notifications: notifications || [] });

  } catch (err: any) {
    console.error('Error GET notifications:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

// POST: Crear una notificación para la empresa seleccionada
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
    const { companyId, title, description, type } = body;

    if (!companyId || !title || !description || !type) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos.' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para acceder a esta empresa.' }, { status: 403 });
    }

    // Insert notification
    const { data: notification, error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert({
        company_id: companyId,
        title,
        description,
        type,
        read: false
      })
      .select('*')
      .single();

    if (insertError) {
      throw new Error('Error al crear la notificación: ' + insertError.message);
    }

    return NextResponse.json({ notification });

  } catch (err: any) {
    console.error('Error POST notification:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

// PUT: Marcar todas como leídas (o marcar una individual)
export async function PUT(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const id = searchParams.get('id'); // Opcional, para marcar una individual

    if (!companyId) {
      return NextResponse.json({ error: 'Falta especificar el ID de la empresa.' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para acceder a esta empresa.' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('company_id', companyId);

    if (id) {
      query = query.eq('id', id);
    }

    const { error: updateError } = await query;

    if (updateError) {
      throw new Error('Error al actualizar notificaciones: ' + updateError.message);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('Error PUT notifications:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

// DELETE: Limpiar notificaciones de la empresa seleccionada
export async function DELETE(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Falta especificar el ID de la empresa.' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para acceder a esta empresa.' }, { status: 403 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('company_id', companyId);

    if (deleteError) {
      throw new Error('Error al eliminar notificaciones: ' + deleteError.message);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('Error DELETE notifications:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
