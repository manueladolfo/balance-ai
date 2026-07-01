import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

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
      return NextResponse.json({ error: 'Falta proporcionar el ID de la empresa.' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para acceder al Plan Contable de esta empresa.' }, { status: 403 });
    }

    const { data: accounts, error } = await supabaseAdmin
      .from('pgc_accounts')
      .select('*')
      .eq('company_id', companyId)
      .order('code', { ascending: true });

    if (error) {
      throw new Error('Error al consultar PGC de Supabase: ' + error.message);
    }

    const metadataRow = accounts?.find(a => a.code === 'METADATA_FILE');
    const normalAccounts = accounts?.filter(a => a.code !== 'METADATA_FILE') || [];

    let metadataFile = null;
    if (metadataRow) {
      try {
        metadataFile = JSON.parse(metadataRow.description);
      } catch {
        metadataFile = { name: 'Plan Contable', extension: 'db' };
      }
    } else if (normalAccounts.length > 0) {
      metadataFile = { name: 'Plan Contable Anterior', extension: 'db' };
    }

    return NextResponse.json({ 
      accounts: normalAccounts || [],
      metadataFile
    });
  } catch (error: any) {
    console.error('Fetch PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al recuperar PGC.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { accounts, companyId, fileName: reqFileName } = await req.json(); // Array of { code, description, is_operational }

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ error: 'Falta proporcionar la lista de cuentas.' }, { status: 400 });
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Falta proporcionar el ID de la empresa.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para guardar el Plan Contable de esta empresa.' }, { status: 403 });
    }

    // Verify PGC doesn't already exist
    const { count: existingCount, error: countError } = await supabaseAdmin
      .from('pgc_accounts')
      .select('code', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if (!countError && existingCount && existingCount > 0) {
      return NextResponse.json({ 
        error: 'Ya existe un Plan General Contable importado para esta empresa. Por favor, elimine el anterior antes de importar uno nuevo.' 
      }, { status: 400 });
    }

    // Add company_id to every account
    const mappedAccounts = accounts.map(a => ({
      code: a.code,
      description: a.description,
      is_operational: a.is_operational,
      company_id: companyId
    }));

    const fileName = reqFileName || 'plan_general.csv';
    const fileExtension = fileName.split('.').pop() || 'csv';
    const metadataStr = JSON.stringify({
      name: fileName,
      extension: fileExtension,
      imported_at: new Date().toISOString()
    });

    // Push metadata row
    mappedAccounts.push({
      code: 'METADATA_FILE',
      description: metadataStr,
      is_operational: false,
      company_id: companyId
    });

    // Upsert accounts
    const { error } = await supabaseAdmin
      .from('pgc_accounts')
      .upsert(mappedAccounts, { onConflict: 'company_id,code' });

    if (error) {
      throw new Error('Error al guardar PGC en Supabase: ' + error.message);
    }

    return NextResponse.json({ success: true, message: 'Plan Contable actualizado correctamente.' });
  } catch (error: any) {
    console.error('Update PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar PGC.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado. Debe iniciar sesión.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Falta proporcionar el ID de la empresa.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 412 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'No autorizado para acceder al Plan Contable de esta empresa.' }, { status: 403 });
    }

    // Delete all accounts for this company
    const { error: deleteError } = await supabaseAdmin
      .from('pgc_accounts')
      .delete()
      .eq('company_id', companyId);

    if (deleteError) {
      throw new Error('Error al eliminar PGC de Supabase: ' + deleteError.message);
    }

    return NextResponse.json({ success: true, message: 'Plan Contable eliminado correctamente.' });
  } catch (error: any) {
    console.error('Delete PGC API error:', error);
    return NextResponse.json({ error: error.message || 'Error al eliminar PGC.' }, { status: 500 });
  }
}
