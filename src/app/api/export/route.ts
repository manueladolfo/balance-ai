import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';
import { mockDb } from '@/lib/mockDb';
import JSZip from 'jszip';

export async function POST(req: NextRequest) {
  try {
    const { documentIds, version = '2008', format = 'txt' } = await req.json();

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json({ error: 'Falta proporcionar los IDs de documentos a exportar.' }, { status: 400 });
    }

    let entries: any[] = [];

    // 1. Fetch entries and lines
    if (isSupabaseConfigured() && supabaseAdmin) {
      const { data: dbEntries, error: entriesError } = await supabaseAdmin
        .from('accounting_entries')
        .select(`
          id,
          document_id,
          entry_date,
          entry_number,
          reference,
          concept,
          entry_lines (
            id,
            line_type,
            subaccount_code,
            subaccount_desc,
            amount
          )
        `)
        .in('document_id', documentIds);

      if (entriesError) {
        console.error('Supabase fetch entries error:', entriesError);
        return NextResponse.json({ error: 'Error al recuperar los asientos de la base de datos.' }, { status: 500 });
      }

      entries = dbEntries || [];
    } else {
      // Local Mock DB
      const mockEntries = mockDb.getEntries();
      entries = mockEntries.filter(e => documentIds.includes(e.document_id));
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No se encontraron asientos contables para los documentos seleccionados.' }, { status: 404 });
    }

    // 2. Generate DIARIO and SUBCUENT content
    let diarioContent = '';
    const subcuentasMap = new Map<string, string>(); // To keep unique subaccounts

    entries.forEach((entry, entryIndex) => {
      const entryNumber = entry.entry_number || (entryIndex + 1);
      const entryDate = entry.entry_date;
      const ref = entry.reference || '';
      const concept = entry.concept || '';

      const lines = entry.entry_lines || entry.lines || [];
      
      lines.forEach((line: any) => {
        // Collect subaccount details
        subcuentasMap.set(line.subaccount_code, line.subaccount_desc);

        // Date YYYY-MM-DD to DDMMYYYY
        const dateParts = entryDate.split('-');
        const formattedDate = dateParts.length === 3 
          ? `${dateParts[2]}${dateParts[1]}${dateParts[0]}` 
          : '00000000';

        const asientoStrRaw = String(entryNumber);
        const cuentaStrRaw = line.subaccount_code.replace(/\./g, '');
        
        let contrapartida = '';
        const oppositeType = line.line_type === 'debe' ? 'haber' : 'debe';
        const contraLine = lines.find((l: any) => l.line_type === oppositeType);
        if (contraLine) {
          contrapartida = contraLine.subaccount_code.replace(/\./g, '');
        }
        const contraStrRaw = contrapartida;

        const conceptRaw = concept.substring(0, 25);
        const dhStr = line.line_type === 'debe' ? 'D' : 'H';
        const importeStrRaw = Number(line.amount).toFixed(2);
        const docStrRaw = ref.substring(0, 8);

        if (format === 'txt') {
          // Fixed width ASCII format
          const asientoStr = asientoStrRaw.substring(0, 6).padStart(6, '0');
          const cuentaStr = cuentaStrRaw.substring(0, 12).padEnd(12, ' ');
          const contraStr = contraStrRaw.substring(0, 12).padEnd(12, ' ');
          const conceptoStr = conceptRaw.padEnd(25, ' ');
          const importeStr = importeStrRaw.padStart(14, ' ');
          const docStr = docStrRaw.padEnd(8, ' ');

          if (version === '2008') {
            // ContaPlus 2008: ASIENTO(6) + FECHA(8) + CUENTA(12) + CONTRA(12) + CONCEPTO(25) + DH(1) + IMPORTE(14) + DOC(8) + DEPT(3) + PROJ(3) + MONEDA(1)
            const lineStr = `${asientoStr}${formattedDate}${cuentaStr}${contraStr}${conceptoStr}${dhStr}${importeStr}${docStr}      0\r\n`;
            diarioContent += lineStr;
          } else {
            // ContaPlus 2011: ASCII ampliado con campos extra
            const cantMonedaExt = "".padStart(14, ' ');
            const codMonedaExt = "   ";
            const contraIVA = "".padEnd(12, ' ');
            const tipoIVA = " 0.00".padStart(5, ' ');
            const recargo = " 0.00".padStart(5, ' ');
            const baseImponible = "          0.00".padStart(14, ' ');
            
            const lineStr = `${asientoStr}${formattedDate}${cuentaStr}${contraStr}${conceptoStr}${dhStr}${importeStr}${docStr}      0${cantMonedaExt}${codMonedaExt}${contraIVA}${tipoIVA}${recargo}${baseImponible}\r\n`;
            diarioContent += lineStr;
          }
        } else {
          // CSV / Separated by semicolon
          if (version === '2008') {
            // Asiento;Fecha;Subcuenta;Contrapartida;Concepto;DH;Importe;Documento;Depto;Proy;Moneda
            const lineStr = `${asientoStrRaw};${formattedDate};${cuentaStrRaw};${contraStrRaw};${conceptRaw};${dhStr};${importeStrRaw};${docStrRaw};;;0\r\n`;
            diarioContent += lineStr;
          } else {
            // ContaPlus 2011 CSV (adding placeholders for 2011 extra columns)
            const lineStr = `${asientoStrRaw};${formattedDate};${cuentaStrRaw};${contraStrRaw};${conceptRaw};${dhStr};${importeStrRaw};${docStrRaw};;;0;;;;0.00;0.00;0.00\r\n`;
            diarioContent += lineStr;
          }
        }
      });
    });

    // Generate SUBCUENT
    let subcuentContent = '';
    subcuentasMap.forEach((desc, code) => {
      const codeStrRaw = code.replace(/\./g, '');
      const descStrRaw = desc.substring(0, 40);

      if (format === 'txt') {
        const codeStr = codeStrRaw.substring(0, 12).padEnd(12, ' ');
        const descStr = descStrRaw.padEnd(40, ' ');
        // Fixed width: CUENTA(12) + DESCRIPCION(40) + EXTRA(18) = 70 chars
        subcuentContent += `${codeStr}${descStr}0.000.000.000.000.00\r\n`;
      } else {
        // CSV format
        subcuentContent += `${codeStrRaw};${descStrRaw};0.000.000.000.000.00\r\n`;
      }
    });

    // 3. Create ZIP
    const zip = new JSZip();
    const diarioFilename = format === 'txt' ? 'DIARIO.TXT' : 'DIARIO.CSV';
    const subcuentFilename = format === 'txt' ? 'SUBCUENT.TXT' : 'SUBCUENT.CSV';

    zip.file(diarioFilename, diarioContent);
    zip.file(subcuentFilename, subcuentContent);

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    // 4. Return as downloadable file
    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="ContaPlus_${version}_Export.zip"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error: any) {
    console.error('Export route error:', error);
    return NextResponse.json({ error: error.message || 'Error interno al exportar.' }, { status: 500 });
  }
}
