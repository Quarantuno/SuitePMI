import { campiProspettoPaghe, formatEuro, type ProspettoPaghe } from '@suite/shared';
import PDFDocument from 'pdfkit';

export function generaProspettoPaghePdf(p: ProspettoPaghe, azienda: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Prospetto interno paghe' } });
    const parti: Buffer[] = [];
    doc.on('data', (parte: Buffer) => parti.push(parte));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(parti)));
    doc.font('Helvetica-Bold').fontSize(18).text('Prospetto interno paghe');
    doc.font('Helvetica').fontSize(11).text('Uso interno · Non è un cedolino ufficiale');
    doc.moveDown().text(azienda);
    doc.text(p.persona.nome + ' ' + p.persona.cognome + ' · ' + p.persona.mansione);
    doc.text('Mese di competenza · ' + p.mese);
    doc.moveDown(1.5);
    for (const [campo, etichetta] of campiProspettoPaghe) {
      doc.text(etichetta + ' · ' + formatEuro(p[campo]));
      doc.moveDown(0.4);
    }
    doc.moveDown().font('Helvetica-Bold').fontSize(14).text('Saldo calcolato · ' + formatEuro(p.saldoCents));
    doc.end();
  });
}
