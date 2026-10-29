/**
 * Codici TipoDocumento della FatturaPA (specifiche tecniche SdI 1.8+).
 * Servono a decidere cosa fa un documento sui flussi di cassa.
 */
export const TIPI_DOCUMENTO: Readonly<Record<string, string>> = {
  TD01: 'Fattura',
  TD02: 'Acconto su fattura',
  TD03: 'Acconto su parcella',
  TD04: 'Nota di credito',
  TD05: 'Nota di debito',
  TD06: 'Parcella',
  TD07: 'Fattura semplificata',
  TD08: 'Nota di credito semplificata',
  TD16: 'Integrazione reverse charge interno',
  TD17: 'Integrazione servizi dall\'estero',
  TD18: 'Integrazione beni intracomunitari',
  TD19: 'Integrazione beni art. 17 c. 2',
  TD20: 'Autofattura di regolarizzazione',
  TD21: 'Autofattura per splafonamento',
  TD22: 'Estrazione beni da deposito IVA',
  TD23: 'Estrazione beni da deposito IVA con versamento',
  TD24: 'Fattura differita',
  TD25: 'Fattura differita (triangolazione)',
  TD26: 'Cessione beni ammortizzabili',
  TD27: 'Autoconsumo o cessione gratuita',
  TD28: 'Acquisti da San Marino',
};

/**
 * Integrazioni e autofatture: servono all'IVA ma non creano un credito o un debito
 * verso la controparte (l'imposta si versa all'Erario, il fornitore estero fattura a parte).
 * Non le importiamo tra incassi e pagamenti.
 */
export const TIPI_SOLO_FISCALI: ReadonlySet<string> = new Set([
  'TD16', 'TD17', 'TD18', 'TD19', 'TD20', 'TD21', 'TD22', 'TD23', 'TD27', 'TD28',
]);

export function etichettaTipoDocumento(tipo: string): string {
  return TIPI_DOCUMENTO[tipo] ?? tipo;
}
