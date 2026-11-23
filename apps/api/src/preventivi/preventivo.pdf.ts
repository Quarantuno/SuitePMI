import { formatBps, formatData, formatEuro, totaliPreventivo, type Preventivo } from '@suite/shared';
import PDFDocument from 'pdfkit';

export function generaPreventivoPdf(
  preventivo: Preventivo,
  azienda: { ragioneSociale: string; partitaIva: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: preventivo.titolo } });
    const chunks: Buffer[] = [];
    doc.on('data', (parte: Buffer) => chunks.push(parte));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(12).text(azienda.ragioneSociale);
    doc.font('Helvetica').fontSize(10).text('P. IVA ' + azienda.partitaIva);
    doc.moveDown();
    if (preventivo.stato === 'bozza') doc.text('Bozza');
    doc.font('Helvetica-Bold').fontSize(22).text(preventivo.titolo);
    doc.moveDown(0.5).font('Helvetica').fontSize(10);
    doc.text('Cliente · ' + preventivo.cliente.denominazione);
    doc.text('Data · ' + formatData(preventivo.data));
    if (preventivo.validoFino) doc.text('Valido fino al ' + formatData(preventivo.validoFino));
    doc.moveDown(1.4);

    for (const voce of preventivo.voci) {
      if (doc.y + 75 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).text(voce.descrizione);
      doc.font('Helvetica').fontSize(10).text(
        voce.quantita + ' × ' + formatEuro(voce.prezzoCents) +
        '    |    IVA ' + formatBps(voce.ivaBps) +
        '    |    Imponibile ' + formatEuro(voce.quantita * voce.prezzoCents),
      );
      doc.moveDown(0.8);
    }

    if (doc.y + 80 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const totali = totaliPreventivo(preventivo.voci);
    doc.moveDown().text('Imponibile · ' + formatEuro(totali.imponibileCents), { align: 'right' });
    doc.text('IVA · ' + formatEuro(totali.ivaCents), { align: 'right' });
    doc.font('Helvetica-Bold').fontSize(14).text('Totale · ' + formatEuro(totali.totaleCents), { align: 'right' });

    if (preventivo.note) {
      doc.moveDown().font('Helvetica').fontSize(10).text(preventivo.note);
    }
    doc.end();
  });
}
