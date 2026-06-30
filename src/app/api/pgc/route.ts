import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    let query = supabaseAdmin.from('pgc_accounts').select('*');
    if (companyId) {
      query = query.eq('company_id', companyId);
    } else {
      // If no companyId is passed, default to accounts with null company_id (or return empty)
      query = query.is('company_id', null);
    }

    const { data: accounts, error } = await query.order('code', { ascending: true });

    if (error) {
      throw new Error('Error al consultar PGC de Supabase: ' + error.message);
    }

    return NextResponse.json({ accounts: accounts || [] });
  } catch (error: any) {
    console.error('Fetch PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al recuperar PGC.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { accounts, companyId } = await req.json(); // Array of { code, description, is_operational }

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ error: 'Falta proporcionar la lista de cuentas.' }, { status: 400 });
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Falta proporcionar el ID de la empresa.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    // Add company_id to every account
    const mappedAccounts = accounts.map(a => ({
      code: a.code,
      description: a.description,
      is_operational: a.is_operational,
      company_id: companyId
    }));

    // Upsert accounts
    const { error } = await supabaseAdmin
      .from('pgc_accounts')
      .upsert(mappedAccounts, { onConflict: 'company_id,code' }); // Clave compuesta para evitar conflictos inter-empresa

    if (error) {
      throw new Error('Error al guardar PGC en Supabase: ' + error.message);
    }

    return NextResponse.json({ success: true, message: 'Plan Contable actualizado correctamente.' });
  } catch (error: any) {
    console.error('Update PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar PGC.' }, { status: 500 });
  }
}
