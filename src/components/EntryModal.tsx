import React from 'react';
import jsPDF from 'jspdf';

export interface EntryLine {
  id?: string;
  line_type: 'debe' | 'haber';
  subaccount_code: string;
  subaccount_desc: string;
  amount: number;
}

export interface AccountingEntry {
  id: string;
  document_id: string;
  entry_date: string;
  entry_number: number;
  reference: string;
  concept: string;
  is_balanced: boolean;
  lines: EntryLine[];
}

interface EntryModalProps {
  entry: AccountingEntry | null;
  onClose: () => void;
  onAddSubaccount?: (code: string, desc: string) => void;
  onApprove?: (documentId: string) => void;
  existingSubaccounts: string[]; // List of existing subaccount codes to check for warnings
}

export const EntryModal: React.FC<EntryModalProps> = ({
  entry,
  onClose,
  onAddSubaccount,
  onApprove,
  existingSubaccounts
}) => {
  if (!entry) return null;

  const debeLines = entry.lines.filter(l => l.line_type === 'debe');
  const haberLines = entry.lines.filter(l => l.line_type === 'haber');

  const totalDebe = debeLines.reduce((sum, l) => sum + l.amount, 0);
  const totalHaber = haberLines.reduce((sum, l) => sum + l.amount, 0);

  // Equalize rows for visual alignment — pad shorter side with empty rows
  const maxRows = Math.max(debeLines.length, haberLines.length, 3);

  // Check for any subaccount in the entry that doesn't exist in PGC
  const missingAccounts = entry.lines.filter(l => !existingSubaccounts.includes(l.subaccount_code));

  // Generate PDF of the complete entry
  const generatePDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(4, 22, 39);
    doc.text('COMPROBANTE DE ASIENTO CONTABLE', 20, 25);

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Generado automáticamente por Balance AI`, 20, 32);

    // Divider
    doc.setDrawColor(196, 198, 205);
    doc.setLineWidth(0.5);
    doc.line(20, 36, 190, 36);

    // Meta details
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(4, 22, 39);
    doc.text('Referencia:', 20, 45);
    doc.text('Número Asiento:', 20, 52);
    doc.text('Fecha Contable:', 20, 59);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(11, 28, 48);
    doc.text(entry.reference || 'N/D', 50, 45);
    doc.text(String(entry.entry_number), 55, 52);
    doc.text(entry.entry_date, 55, 59);

    doc.setFont('Helvetica', 'bold');
    doc.text('Concepto General:', 110, 45);
    doc.setFont('Helvetica', 'normal');
    doc.text(entry.concept || 'N/D', 110, 52);

    // Table headers for DEBE
    let y = 70;
    doc.setFont('Helvetica', 'bold');
    doc.setFillColor(248, 249, 255);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(4, 22, 39);
    doc.text('DEBE (Activos / Gastos)', 22, y + 6);
    
    y += 12;
    doc.setFontSize(9);
    doc.text('Subcuenta', 20, y);
    doc.text('Descripción', 55, y);
    doc.text('Importe (€)', 170, y, { align: 'right' });
    doc.line(20, y + 2, 190, y + 2);

    // DEBE rows
    y += 7;
    doc.setFont('Helvetica', 'normal');
    debeLines.forEach(l => {
      doc.text(l.subaccount_code, 20, y);
      doc.text(l.subaccount_desc, 55, y);
      doc.text(l.amount.toFixed(2), 190, y, { align: 'right' });
      y += 6;
    });

    // Total Debe
    doc.setFont('Helvetica', 'bold');
    doc.line(20, y - 2, 190, y - 2);
    doc.text('TOTAL DEBE', 55, y + 3);
    doc.text(totalDebe.toFixed(2), 190, y + 3, { align: 'right' });

    // Table headers for HABER
    y += 15;
    doc.setFontSize(10);
    doc.setFillColor(248, 249, 255);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(0, 109, 55);
    doc.text('HABER (Pasivos / Patrimonio)', 22, y + 6);
    
    y += 12;
    doc.setFontSize(9);
    doc.setTextColor(4, 22, 39);
    doc.text('Subcuenta', 20, y);
    doc.text('Descripción', 55, y);
    doc.text('Importe (€)', 170, y, { align: 'right' });
    doc.line(20, y + 2, 190, y + 2);

    // HABER rows
    y += 7;
    doc.setFont('Helvetica', 'normal');
    haberLines.forEach(l => {
      doc.text(l.subaccount_code, 20, y);
      doc.text(l.subaccount_desc, 55, y);
      doc.text(l.amount.toFixed(2), 190, y, { align: 'right' });
      y += 6;
    });

    // Total Haber
    doc.setFont('Helvetica', 'bold');
    doc.line(20, y - 2, 190, y - 2);
    doc.text('TOTAL HABER', 55, y + 3);
    doc.text(totalHaber.toFixed(2), 190, y + 3, { align: 'right' });

    // Footer signature
    y += 20;
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'italic');
    doc.setTextColor(120, 120, 120);
    doc.text('Asiento cuadrado y verificado electrónicamente.', 20, y);

    // Save the PDF
    doc.save(`Asiento_${entry.reference || entry.entry_number}.pdf`);
  };

  const renderDebeRow = (line: EntryLine | null, index: number) => {
    if (!line) {
      return (
        <tr key={`debe-empty-${index}`} className="h-[52px]">
          <td className="border-b border-r border-outline-variant/8 px-4 py-3"></td>
          <td className="border-b border-r border-outline-variant/8 px-4 py-3"></td>
          <td className="border-b border-outline-variant/8 px-4 py-3"></td>
        </tr>
      );
    }
    const isMissing = !existingSubaccounts.includes(line.subaccount_code);
    const cleanCode = line.subaccount_code.replace(/\./g, '');
    return (
      <tr key={`debe-${index}`} className={`h-[52px] transition-colors ${index % 2 === 1 ? 'bg-primary/[0.015]' : ''} hover:bg-primary/[0.04]`}>
        <td className={`border-b border-r border-outline-variant/8 px-4 py-3 font-mono text-[11px] font-bold text-center align-top ${isMissing ? 'text-error' : 'text-primary'}`}>
          {cleanCode}
          {isMissing && <span className="text-[7px] block text-error font-sans font-semibold uppercase tracking-wider mt-0.5 leading-none">(No creada)</span>}
        </td>
        <td className="border-b border-r border-outline-variant/8 px-4 py-3 text-[11px] text-on-surface leading-snug align-top">{line.subaccount_desc}</td>
        <td className="border-b border-outline-variant/8 px-4 py-3 text-right font-mono text-[11px] text-primary font-bold tabular-nums align-top">
          {line.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    );
  };

  const renderHaberRow = (line: EntryLine | null, index: number) => {
    if (!line) {
      return (
        <tr key={`haber-empty-${index}`} className="h-[52px]">
          <td className="border-b border-r border-outline-variant/8 px-4 py-3"></td>
          <td className="border-b border-r border-outline-variant/8 px-4 py-3"></td>
          <td className="border-b border-outline-variant/8 px-4 py-3"></td>
        </tr>
      );
    }
    const isMissing = !existingSubaccounts.includes(line.subaccount_code);
    const cleanCode = line.subaccount_code.replace(/\./g, '');
    return (
      <tr key={`haber-${index}`} className={`h-[52px] transition-colors ${index % 2 === 1 ? 'bg-secondary/[0.015]' : ''} hover:bg-secondary/[0.04]`}>
        <td className={`border-b border-r border-outline-variant/8 px-4 py-3 font-mono text-[11px] font-bold text-center align-top ${isMissing ? 'text-error' : 'text-secondary'}`}>
          {cleanCode}
          {isMissing && <span className="text-[7px] block text-error font-sans font-semibold uppercase tracking-wider mt-0.5 leading-none">(No creada)</span>}
        </td>
        <td className="border-b border-r border-outline-variant/8 px-4 py-3 text-[11px] text-on-surface leading-snug align-top">{line.subaccount_desc}</td>
        <td className="border-b border-outline-variant/8 px-4 py-3 text-right font-mono text-[11px] text-secondary font-bold tabular-nums align-top">
          {line.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-background/60" id="entry-modal">
      <div className="bg-surface w-full max-w-5xl h-auto max-h-[92vh] rounded-md border border-outline-variant/10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 shadow-2xl mx-auto my-auto">
        
        {/* Modal Header */}
        <div className="bg-surface-container-low px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 select-none border-b border-outline-variant/10">
          <div className="flex items-center gap-4">
            <div className="flex flex-col text-left">
              <span className="text-on-surface-variant text-[9px] font-bold uppercase tracking-widest">Detalles del Asiento</span>
              <h3 className="text-primary font-bold text-sm tracking-tight">Ref. Documento: {entry.reference || 'N/A'}</h3>
            </div>
            <div className="h-8 w-px bg-outline-variant/15 mx-1 hidden sm:block"></div>
            <div className="flex flex-col text-left hidden sm:flex">
              <span className="text-on-surface-variant text-[9px] font-bold uppercase tracking-widest">Fecha de Contabilización</span>
              <p className="text-primary font-mono text-xs">{entry.entry_date}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            <button 
              onClick={generatePDF}
              className="bg-primary/5 hover:bg-primary/10 text-primary px-4 py-2 rounded-sm flex items-center gap-2 transition-colors text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">picture_as_pdf</span>
              <span>Imprimir Comprobante</span>
            </button>
            <button className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container-high transition-colors" onClick={onClose}>
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Warning Box for missing subaccounts */}
        {missingAccounts.length > 0 && (
          <div className="bg-[#ffdad6]/40 border-b border-error/10 px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <span className="material-symbols-outlined text-error material-symbols-fill shrink-0 text-lg">warning</span>
            <div className="text-[#93000a] text-xs font-semibold flex-1 text-left leading-relaxed">
              <span className="font-bold">Aviso de Sincronización:</span> La subcuenta{' '}
              {missingAccounts.map((ma, idx) => (
                <strong key={idx} className="font-mono bg-white/60 px-1.5 py-0.5 rounded-sm mx-1 border border-error/10">
                  {ma.subaccount_code.replace(/\./g, '')} ({ma.subaccount_desc})
                </strong>
              ))}
              no existe en su sistema ERP. Por favor, créela antes del volcado final.
            </div>
            {onAddSubaccount && (
              <button 
                onClick={() => {
                  missingAccounts.forEach(ma => onAddSubaccount(ma.subaccount_code, ma.subaccount_desc));
                }}
                className="text-error underline text-xs font-bold hover:opacity-80 shrink-0 self-end sm:self-auto uppercase tracking-wider"
              >
                Crear Automáticamente
              </button>
            )}
          </div>
        )}

        {/* Content: Two-Column DEBE / HABER Layout */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-0">
            
            {/* DEBE Column */}
            <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-outline-variant/10">
              {/* Column Header Bar */}
              <div className="bg-primary px-5 py-2.5 flex justify-between items-center select-none shrink-0">
                <span className="font-bold text-white tracking-wider text-[10px] uppercase">DEBE (Cargo)</span>
                <span className="text-[9px] text-white/70 font-bold uppercase tracking-wider">Activos / Gastos</span>
              </div>
              
              {/* Table */}
              <div className="bg-surface">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[9px] text-primary font-bold uppercase tracking-wider select-none bg-primary/[0.04] border-b border-outline-variant/10">
                      <th className="px-4 py-2.5 w-[90px] text-center border-r border-outline-variant/8">Subcuenta</th>
                      <th className="px-4 py-2.5 border-r border-outline-variant/8">Descripción</th>
                      <th className="px-4 py-2.5 text-right w-[100px]">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxRows }).map((_, i) => 
                      renderDebeRow(debeLines[i] || null, i)
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total Row */}
              <div className="bg-primary/[0.04] border-t-2 border-primary/20 px-5 py-3 flex justify-between items-center select-none shrink-0 mt-auto">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total Debe:</span>
                <span className="text-lg font-bold font-mono text-primary tabular-nums">
                  ${totalDebe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* HABER Column */}
            <div className="flex flex-col">
              {/* Column Header Bar */}
              <div className="bg-secondary px-5 py-2.5 flex justify-between items-center select-none shrink-0">
                <span className="font-bold text-white tracking-wider text-[10px] uppercase">HABER (Abono)</span>
                <span className="text-[9px] text-white/70 font-bold uppercase tracking-wider">Pasivos / Patrimonio</span>
              </div>
              
              {/* Table */}
              <div className="bg-surface">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[9px] text-secondary font-bold uppercase tracking-wider select-none bg-secondary/[0.04] border-b border-outline-variant/10">
                      <th className="px-4 py-2.5 w-[90px] text-center border-r border-outline-variant/8">Subcuenta</th>
                      <th className="px-4 py-2.5 border-r border-outline-variant/8">Descripción</th>
                      <th className="px-4 py-2.5 text-right w-[100px]">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxRows }).map((_, i) => 
                      renderHaberRow(haberLines[i] || null, i)
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total Row */}
              <div className="bg-secondary/[0.04] border-t-2 border-secondary/20 px-5 py-3 flex justify-between items-center select-none shrink-0 mt-auto">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total Haber:</span>
                <span className={`text-lg font-bold font-mono tabular-nums ${Math.abs(totalDebe - totalHaber) < 0.01 ? 'text-secondary' : 'text-error'}`}>
                  ${totalHaber.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-surface-container-low px-6 py-3.5 flex flex-col sm:flex-row gap-3 justify-between items-center shrink-0 border-t border-outline-variant/10 select-none">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            {Math.abs(totalDebe - totalHaber) < 0.01 ? (
              <div className="flex items-center gap-1.5 bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1.5 rounded-sm">
                <span className="material-symbols-outlined text-[14px] material-symbols-fill text-secondary">check_circle</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">Asiento Cuadrado</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-error/10 text-error border border-error/20 px-3 py-1.5 rounded-sm">
                <span className="material-symbols-outlined text-[14px] material-symbols-fill text-error">error</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">Asiento Descuadrado</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold opacity-85">
              <span className="material-symbols-outlined text-xs">history</span>
              <span>Conciliado automáticamente por Equinox AI</span>
            </div>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => {
                alert('La edición manual de asientos se implementará en la próxima fase.');
              }}
              className="flex-1 sm:flex-none px-4 py-2 border border-outline-variant/20 text-on-surface font-semibold text-xs rounded-sm hover:bg-surface-container-low transition-colors"
            >
              Editar Manualmente
            </button>
            <button 
              onClick={async () => {
                if (onApprove && entry) {
                  await onApprove(entry.document_id);
                } else {
                  alert('¡Asiento contable aprobado y listo para exportación masiva a Contaplus!');
                }
                onClose();
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-primary text-white font-semibold text-xs rounded-sm hover:opacity-90 active:scale-95 transition-all"
            >
              Aprobar & Contabilizar
            </button>
            <button 
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 border border-outline-variant/20 text-on-surface/60 font-semibold text-xs rounded-sm hover:bg-surface-container-low transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
export default EntryModal;
