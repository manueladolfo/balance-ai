import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const { data: companies, error } = await supabaseAdmin
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw new Error('Error al consultar empresas de Supabase: ' + error.message);
    }

    return NextResponse.json({ companies: companies || [] });
  } catch (error: any) {
    console.error('Fetch companies API error:', error);
    return NextResponse.json({ error: error.message || 'Error al recuperar empresas.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const { name, cif } = await req.json();

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre de la empresa es obligatorio.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('companies')
      .insert({ name: name.trim(), cif: cif ? cif.trim() : null })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation in Postgres
        return NextResponse.json({ error: 'Ya existe una empresa con ese nombre.' }, { status: 409 });
      }
      throw new Error('Error al guardar la empresa en Supabase: ' + error.message);
    }

    return NextResponse.json({ success: true, company: data });
  } catch (error: any) {
    console.error('Create company API error:', error);
    return NextResponse.json({ error: error.message || 'Error al crear la empresa.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Falta proporcionar el ID de la empresa.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error('Error al eliminar la empresa en Supabase: ' + error.message);
    }

    return NextResponse.json({ success: true, message: 'Empresa eliminada correctamente.' });
  } catch (error: any) {
    console.error('Delete company API error:', error);
    return NextResponse.json({ error: error.message || 'Error al eliminar la empresa.' }, { status: 500 });
  }
}
