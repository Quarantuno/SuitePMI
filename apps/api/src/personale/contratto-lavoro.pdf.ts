import { formatData, type ContrattoLavoro } from '@suite/shared';
import PDFDocument from 'pdfkit';

type BozzaPdf = ContrattoLavoro & {
  azienda: { ragioneSociale: string; partitaIva: string; indirizzo: string | null };
  persona: { nome: string; cognome: string; mansione: string };
};

export function generaContrattoLavoroPdf(bozza: BozzaPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Bozza di contratto di lavoro' } });
    const parti: Buffer[] = [];
    doc.on('data', (parte: Buffer) => parti.push(parte));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(parti)));

    doc.font('Helvetica-Bold').fontSize(10).text('BOZZA DI CONTRATTO DI LAVORO');
    doc.moveDown().fontSize(20).text(bozza.titolo);
    doc.moveDown().font('Helvetica').fontSize(11).text('Decorrenza · ' + formatData(bozza.decorrenza));
    doc.moveDown().font('Helvetica-Bold').text('Datore di lavoro').font('Helvetica');
    doc.text(bozza.azienda.ragioneSociale);
    doc.text('P. IVA ' + bozza.azienda.partitaIva);
    if (bozza.azienda.indirizzo) doc.text(bozza.azienda.indirizzo);
    doc.moveDown().font('Helvetica-Bold').text('Persona').font('Helvetica');
    doc.text(bozza.persona.nome + ' ' + bozza.persona.cognome);
    doc.text('Mansione · ' + bozza.persona.mansione);
    doc.moveDown(1.5).text(bozza.testo, { lineGap: 3 });
    doc.end();
  });
}
