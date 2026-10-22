/** Trasforma la fattura di esempio in una nota di credito (TD04) per i test. */
export function notaDiCredito(
  xml: string,
  o: { numero: string; data: string; importo: string; rif?: string; rifData?: string },
): string {
  const collegate = o.rif
    ? `<DatiFattureCollegate><IdDocumento>${o.rif}</IdDocumento><Data>${o.rifData ?? '2026-01-15'}</Data></DatiFattureCollegate>`
    : '';
  return xml
    .replace('<TipoDocumento>TD01</TipoDocumento>', '<TipoDocumento>TD04</TipoDocumento>')
    .replace('<Numero>2026/0042</Numero>', `<Numero>${o.numero}</Numero>`)
    .replace('<Data>2026-01-15</Data>', `<Data>${o.data}</Data>`)
    .replace(/<ImportoTotaleDocumento>[^<]+<\/ImportoTotaleDocumento>/, `<ImportoTotaleDocumento>${o.importo}</ImportoTotaleDocumento>`)
    .replace('</DatiGeneraliDocumento>', `</DatiGeneraliDocumento>${collegate}`)
    .replace(/<DatiPagamento>[\s\S]*<\/DatiPagamento>/, '');
}
