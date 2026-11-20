import { Unzip, UnzipInflate } from 'fflate';

/** Un documento pronto da inviare a /fatture/import-xml. */
export interface DocumentoFattura {
  nome: string;
  corpo: { xml: string } | { p7mBase64: string };
}

function base64(bytes: Uint8Array): string {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}

function decodificaXml(bytes: Uint8Array): string {
  const testa = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const enc = /encoding=["']([^"']+)["']/i.exec(testa)?.[1]?.toLowerCase();
  const latin1 = enc === 'iso-8859-1' || enc === 'latin1' || enc === 'windows-1252';
  return new TextDecoder(latin1 ? 'latin1' : 'utf-8').decode(bytes);
}

/**
 * I file dei metadati dello SdI (es. IT01234567890_abc12_MT_001.xml) e i file
 * di servizio (ricevute, esiti) non sono fatture: li saltiamo.
 */
export function eFattura(nome: string): boolean {
  const base = nome.split('/').pop() ?? nome;
  if (base.startsWith('.') || nome.includes('__MACOSX')) return false;
  if (/_(MT|RC|NS|MC|NE|DT|AT|EC|SE)_\d+/i.test(base)) return false;
  return /\.xml$/i.test(base) || /\.p7m$/i.test(base);
}

function documento(nome: string, bytes: Uint8Array): DocumentoFattura {
  return /\.p7m$/i.test(nome)
    ? { nome, corpo: { p7mBase64: base64(bytes) } }
    : { nome, corpo: { xml: decodificaXml(bytes) } };
}

const MB = 1024 * 1024;
const MAX_FILE = 5 * MB;
const MAX_ARCHIVIO = 12 * MB;
const MAX_TOTALE = 32 * MB;
const MAX_VOCI = 200;
const BLOCCO = 16 * 1024;

function espandi(bytes: Uint8Array, budget: { residuo: number }) {
  const documenti: DocumentoFattura[] = [];
  const saltati: string[] = [];
  let voci = 0;
  let aperti = 0;
  const zip = new Unzip((file) => {
    if (++voci > MAX_VOCI) throw new Error('Troppe voci nell’archivio');
    if (file.name.endsWith('/')) return;
    if (!eFattura(file.name)) {
      saltati.push(file.name);
      return;
    }
    if (file.originalSize !== undefined && file.originalSize > Math.min(MAX_FILE, budget.residuo)) {
      throw new Error('Le fatture nell’archivio superano i limiti di importazione');
    }
    aperti++;
    const parti: Uint8Array[] = [];
    let dimensione = 0;
    file.ondata = (errore, contenuto, fine) => {
      if (errore) throw errore;
      dimensione += contenuto.length;
      budget.residuo -= contenuto.length;
      if (dimensione > MAX_FILE || budget.residuo < 0) {
        throw new Error('Le fatture nell’archivio superano i limiti di importazione');
      }
      parti.push(contenuto);
      if (!fine) return;
      const dati = new Uint8Array(dimensione);
      let offset = 0;
      for (const parte of parti) {
        dati.set(parte, offset);
        offset += parte.length;
      }
      documenti.push(documento(file.name, dati));
      aperti--;
    };
    file.start();
  });
  zip.register(UnzipInflate);
  for (let start = 0; start < bytes.length; start += BLOCCO) {
    const end = Math.min(start + BLOCCO, bytes.length);
    zip.push(bytes.subarray(start, end), end === bytes.length);
  }
  if (voci === 0 || aperti !== 0) throw new Error('Archivio non leggibile');
  return { documenti, saltati };
}

/** Espande solo le fatture e controlla i byte estratti prima di trattenerli. */
export async function leggiFile(files: File[]): Promise<{ documenti: DocumentoFattura[]; saltati: string[] }> {
  const documenti: DocumentoFattura[] = [];
  const saltati: string[] = [];
  const budget = { residuo: MAX_TOTALE };
  let letti = 0;

  for (const file of files.slice(0, MAX_VOCI)) {
    const archivio = /\.zip$/i.test(file.name);
    if (!archivio && !eFattura(file.name)) {
      saltati.push(file.name);
      continue;
    }
    if (file.size > (archivio ? MAX_ARCHIVIO : MAX_FILE) || letti + file.size > MAX_TOTALE
      || budget.residuo <= 0 || (!archivio && file.size > budget.residuo)) {
      saltati.push(file.name + ' (limite di importazione superato)');
      continue;
    }
    letti += file.size;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (archivio) {
        const esito = espandi(bytes, budget);
        for (const doc of esito.documenti) documenti.push({ ...doc, nome: file.name + ' › ' + doc.nome });
        for (const nome of esito.saltati) saltati.push(file.name + ' › ' + nome);
      } else {
        budget.residuo -= bytes.length;
        documenti.push(documento(file.name, bytes));
      }
    } catch (errore) {
      const motivo = errore instanceof Error ? errore.message : 'file non leggibile';
      saltati.push(file.name + ' (' + motivo + ')');
    }
  }
  if (files.length > MAX_VOCI) saltati.push('Selezione limitata ai primi ' + MAX_VOCI + ' file');
  return { documenti, saltati };
}
