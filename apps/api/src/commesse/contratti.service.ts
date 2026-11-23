import { Injectable, NotFoundException } from '@nestjs/common';
import { formatData, type Contratto, type ContrattoInput, type ContrattoSintesi } from '@suite/shared';
import { and, desc, eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { DbService } from '../db/db.service';
import { aziende, commesse, contratti, controparti } from '../db/schema';

const sintesi = { id: contratti.id, titolo: contratti.titolo, data: contratti.data };
const campi = { ...sintesi, testo: contratti.testo };

@Injectable()
export class ContrattiService {
  constructor(private readonly db: DbService) {}

  list(aziendaId: string, commessaId: string): Promise<ContrattoSintesi[]> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const commessa = await tx.query.commesse.findFirst({ where: eq(commesse.id, commessaId), columns: { id: true } });
      if (!commessa) throw new NotFoundException('Commessa non trovata');
      return tx.select(sintesi).from(contratti).where(eq(contratti.commessaId, commessaId))
        .orderBy(desc(contratti.data), desc(contratti.id));
    });
  }

  get(aziendaId: string, commessaId: string, id: string): Promise<Contratto> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const [riga] = await tx.select(campi).from(contratti)
        .where(and(eq(contratti.commessaId, commessaId), eq(contratti.id, id)));
      if (!riga) throw new NotFoundException('Bozza non trovata');
      return riga;
    });
  }

  create(aziendaId: string, commessaId: string, input: ContrattoInput): Promise<Contratto> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const commessa = await tx.query.commesse.findFirst({ where: eq(commesse.id, commessaId), columns: { id: true } });
      if (!commessa) throw new NotFoundException('Commessa non trovata');
      const [riga] = await tx.insert(contratti).values({ ...input, aziendaId, commessaId }).returning(campi);
      return riga!;
    });
  }

  update(aziendaId: string, commessaId: string, id: string, input: ContrattoInput): Promise<Contratto> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const [riga] = await tx.update(contratti).set(input)
        .where(and(eq(contratti.commessaId, commessaId), eq(contratti.id, id))).returning(campi);
      if (!riga) throw new NotFoundException('Bozza non trovata');
      return riga;
    });
  }

  async pdf(aziendaId: string, commessaId: string, id: string): Promise<Buffer> {
    const dati = await this.db.withTenant(aziendaId, async (tx) => {
      const [riga] = await tx.select({
        ...campi,
        nomeCommessa: commesse.nome,
        azienda: { nome: aziende.ragioneSociale, iva: aziende.partitaIva, indirizzo: aziende.indirizzo },
        cliente: { nome: controparti.denominazione, iva: controparti.partitaIva, indirizzo: controparti.indirizzo },
      }).from(contratti)
        .innerJoin(commesse, eq(contratti.commessaId, commesse.id))
        .innerJoin(controparti, eq(commesse.clienteId, controparti.id))
        .innerJoin(aziende, eq(contratti.aziendaId, aziende.id))
        .where(and(eq(contratti.commessaId, commessaId), eq(contratti.id, id)));
      if (!riga) throw new NotFoundException('Bozza non trovata');
      return riga;
    });
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: dati.titolo } });
      const parti: Buffer[] = [];
      doc.on('data', (parte: Buffer) => parti.push(parte));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(parti)));

      doc.font('Helvetica-Bold').fontSize(10).text('BOZZA DI CONTRATTO');
      doc.moveDown().fontSize(20).text(dati.titolo);
      doc.moveDown().font('Helvetica').fontSize(11);
      doc.text('Commessa · ' + dati.nomeCommessa);
      doc.text('Data · ' + formatData(dati.data));
      for (const [etichetta, parte] of [['Fornitore', dati.azienda], ['Cliente', dati.cliente]] as const) {
        doc.moveDown().font('Helvetica-Bold').text(etichetta).font('Helvetica').text(parte.nome);
        if (parte.iva) doc.text('P. IVA ' + parte.iva);
        if (parte.indirizzo) doc.text(parte.indirizzo);
      }
      doc.moveDown(1.5).text(dati.testo, { lineGap: 3 });
      doc.end();
    });
  }
}
