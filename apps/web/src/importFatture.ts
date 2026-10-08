import { unzipSync } from 'fflate';

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

/** Espande gli archivi .zip (anche quelli scaricati dal cassetto fiscale) in singole fatture. */
export async function leggiFile(files: File[]): Promise<{ documenti: DocumentoFattura[]; saltati: string[] }> {
  const documenti: DocumentoFattura[] = [];
  const saltati: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) {
      let voci: Record<string, Uint8Array>;
      try {
        voci = unzipSync(bytes);
      } catch {
        saltati.push(`${file.name} (archivio non leggibile)`);
        continue;
      }
      for (const [nome, contenuto] of Object.entries(voci)) {
        if (nome.endsWith('/')) continue;
        if (eFattura(nome)) documenti.push(documento(`${file.name} › ${nome}`, contenuto));
        else saltati.push(`${file.name} › ${nome}`);
      }
    } else if (eFattura(file.name)) {
      documenti.push(documento(file.name, bytes));
    } else {
      saltati.push(file.name);
    }
  }
  return { documenti, saltati };
}
