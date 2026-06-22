import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';
import { mockDb } from '@/lib/mockDb';

export async function GET(req: NextRequest) {
  try {
    if (isSupabaseConfigured() && supabaseAdmin) {
      const { data: accounts, error } = await supabaseAdmin
        .from('pgc_accounts')
        .select('*')
        .order('code', { ascending: true });

      if (error) {
        throw new Error('Error al consultar PGC de Supabase: ' + error.message);
      }

      return NextResponse.json({ accounts: accounts || [] });
    } else {
      const accounts = mockDb.getPgcAccounts();
      return NextResponse.json({ accounts });
    }
  } catch (error: any) {
    console.error('Fetch PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al recuperar PGC.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { accounts } = await req.json(); // Array of { code, description, is_operational }

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ error: 'Falta proporcionar la lista de cuentas.' }, { status: 400 });
    }

    if (isSupabaseConfigured() && supabaseAdmin) {
      // Upsert accounts
      const { error } = await supabaseAdmin
        .from('pgc_accounts')
        .upsert(accounts, { onConflict: 'code' });

      if (error) {
        throw new Error('Error al guardar PGC en Supabase: ' + error.message);
      }
    } else {
      mockDb.setPgcAccounts(accounts);
    }

    return NextResponse.json({ success: true, message: 'Plan Contable actualizado correctamente.' });
  } catch (error: any) {
    console.error('Update PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar PGC.' }, { status: 500 });
  }
}
