/** Costruttori di FatturaPA per i test: lotti e fatture semplificate. */

const BODY = /<FatturaElettronicaBody>[\s\S]*<\/FatturaElettronicaBody>/;

/** Cambia numero, data e totale della fattura di esempio (le rate restano quelle originali). */
export function variante(xml: string, o: { numero: string; data?: string }): string {
  return xml
    .replace('<Numero>2026/0042</Numero>', `<Numero>${o.numero}</Numero>`)
    .replace('<Data>2026-01-15</Data>', `<Data>${o.data ?? '2026-01-15'}</Data>`);
}

/** Un unico file con l'header del primo documento e i body di tutti (fattura "in lotto"). */
export function lotto(...documenti: string[]): string {
  const bodies = documenti.map((d) => d.match(BODY)![0]).join('\n');
  return documenti[0]!.replace(BODY, bodies);
}

/** Fattura semplificata FSM10 (TD07) o nota di credito semplificata (TD08). */
export function semplificata(o: {
  tipo?: 'TD07' | 'TD08';
  numero: string;
  data: string;
  righe: string[];
  cedentePiva?: string;
  cessionario?: { piva?: string; cf?: string; denominazione?: string; nome?: string; cognome?: string };
  rif?: { numero: string; data?: string };
}): string {
  const c = o.cessionario ?? { piva: '01234567897', denominazione: 'Cliente Demo S.p.A.' };
  const ident = [
    c.piva ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${c.piva}</IdCodice></IdFiscaleIVA>` : '',
    c.cf ? `<CodiceFiscale>${c.cf}</CodiceFiscale>` : '',
  ].join('');
  const nome = c.denominazione
    ? `<Denominazione>${c.denominazione}</Denominazione>`
    : `<Nome>${c.nome ?? ''}</Nome><Cognome>${c.cognome ?? ''}</Cognome>`;
  const rettificata = o.rif
    ? `<DatiFatturaRettificata><NumeroFR>${o.rif.numero}</NumeroFR>${o.rif.data ? `<DataFR>${o.rif.data}</DataFR>` : ''}<ElementiRettificati>Importo</ElementiRettificati></DatiFatturaRettificata>`
    : '';
  const righe = o.righe
    .map((importo, i) => `<DatiBeniServizi><Descrizione>Riga ${i + 1}</Descrizione><Importo>${importo}</Importo><DatiIVA><Aliquota>22.00</Aliquota></DatiIVA></DatiBeniServizi>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronicaSemplificata versione="FSM10" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.0">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${o.cedentePiva ?? '12345678903'}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>S0001</ProgressivoInvio>
      <FormatoTrasmissione>FSM10</FormatoTrasmissione>
      <CodiceDestinatario>0000000</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${o.cedentePiva ?? '12345678903'}</IdCodice></IdFiscaleIVA>
      <Denominazione>Officina Demo S.r.l.</Denominazione>
      <Sede><Indirizzo>Via Roma</Indirizzo><NumeroCivico>1</NumeroCivico><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede>
      <RegimeFiscale>RF01</RegimeFiscale>
    </CedentePrestatore>
    <CessionarioCommittente>
      <IdentificativiFiscali>${ident}</IdentificativiFiscali>
      <AltriDatiIdentificativi>${nome}<Sede><Indirizzo>Corso Italia</Indirizzo><NumeroCivico>10</NumeroCivico><CAP>10100</CAP><Comune>Torino</Comune><Provincia>TO</Provincia><Nazione>IT</Nazione></Sede></AltriDatiIdentificativi>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${o.tipo ?? 'TD07'}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${o.data}</Data>
        <Numero>${o.numero}</Numero>
      </DatiGeneraliDocumento>
      ${rettificata}
    </DatiGenerali>
    ${righe}
  </FatturaElettronicaBody>
</p:FatturaElettronicaSemplificata>`;
}
