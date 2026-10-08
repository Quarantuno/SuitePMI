import { formatData, type Azienda, type IsoDate } from '@suite/shared';
import PDFDocument from 'pdfkit';

export interface DatiLettera {
  mittente: Azienda;
  destinatario: { denominazione: string; indirizzo: string | null; pec: string | null; email: string | null };
  data: IsoDate;
  oggetto: string;
  testo: string;
  /** Es. "A mezzo PEC" per le diffide. */
  modalitaInvio?: string;
}

const MARGINE = 56; // ~2 cm

/** Impagina la lettera su A4 con intestazione, destinatario, oggetto e testo. */
export function lettera(d: DatiLettera): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGINE,
      info: { Title: d.oggetto, Author: d.mittente.ragioneSociale },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const larghezza = doc.page.width - MARGINE * 2;

    // Intestazione
    doc.font('Helvetica-Bold').fontSize(14).text(d.mittente.ragioneSociale);
    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    const intestazione = [
      d.mittente.indirizzo,
      `P.IVA ${d.mittente.partitaIva}`,
      [d.mittente.email && `Email ${d.mittente.email}`, d.mittente.pec && `PEC ${d.mittente.pec}`].filter(Boolean).join('  ·  '),
    ].filter(Boolean);
    doc.text(intestazione.join('\n'));
    doc.moveDown(0.5);
    doc
      .moveTo(MARGINE, doc.y)
      .lineTo(MARGINE + larghezza, doc.y)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();
    doc.fillColor('#000000').moveDown(1.5);

    // Destinatario, allineato a destra
    const colonna = MARGINE + larghezza / 2;
    doc.fontSize(10).font('Helvetica').text('Spett.le', colonna, doc.y, { width: larghezza / 2 });
    doc.font('Helvetica-Bold').text(d.destinatario.denominazione, { width: larghezza / 2 });
    doc.font('Helvetica');
    for (const riga of [d.destinatario.indirizzo, d.destinatario.pec && `PEC: ${d.destinatario.pec}`]) {
      if (riga) doc.text(riga, { width: larghezza / 2 });
    }
    doc.moveDown(1.5);

    doc.text(`Data: ${formatData(d.data)}`, MARGINE, doc.y, { width: larghezza });
    if (d.modalitaInvio) doc.text(d.modalitaInvio, { width: larghezza });
    doc.moveDown();

    doc.font('Helvetica-Bold').text(`Oggetto: ${d.oggetto}`, { width: larghezza });
    doc.moveDown();

    doc.font('Helvetica').fontSize(10.5);
    for (const paragrafo of d.testo.split(/\n{2,}/)) {
      doc.text(paragrafo.trim(), { width: larghezza, align: paragrafo.startsWith('- ') ? 'left' : 'justify', lineGap: 2 });
      doc.moveDown(0.6);
    }

    doc.end();
  });
}
