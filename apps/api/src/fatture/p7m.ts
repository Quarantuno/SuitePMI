/**
 * Estrazione del contenuto da una busta CAdES/PKCS#7 (.p7m), il formato delle
 * fatture elettroniche firmate digitalmente.
 *
 * Non verifichiamo la firma: ci serve solo l'XML imbustato. La struttura è
 *   ContentInfo ::= SEQUENCE { contentType OID, [0] EXPLICIT SignedData }
 *   SignedData  ::= SEQUENCE { version, digestAlgorithms SET,
 *                              encapContentInfo SEQUENCE { eContentType OID, [0] EXPLICIT eContent OCTET STRING }, ... }
 * Gestiamo sia DER (lunghezze definite) sia BER (lunghezze indefinite e OCTET STRING
 * spezzati in più pezzi), che alcuni software di firma producono.
 */

export class P7mError extends Error {}

interface Nodo {
  tag: number; // primo byte dell'identificatore (classe + constructed + numero)
  constructed: boolean;
  start: number; // inizio del contenuto
  end: number; // fine del contenuto (esclusa)
  next: number; // inizio del nodo successivo
}

const OID_SIGNED_DATA = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]); // 1.2.840.113549.1.7.2

function leggi(buf: Buffer, pos: number, limite = buf.length): Nodo {
  if (pos + 2 > limite) throw new P7mError('File .p7m troncato');
  const tag = buf[pos]!;
  if ((tag & 0x1f) === 0x1f) throw new P7mError('Tag ASN.1 a più byte non supportato');
  let p = pos + 1;
  let len = buf[p++]!;
  const constructed = (tag & 0x20) !== 0;

  if (len === 0x80) {
    // Lunghezza indefinita: il contenuto termina con 00 00
    if (!constructed) throw new P7mError('Lunghezza indefinita su un valore primitivo');
    let q = p;
    while (q < limite) {
      if (buf[q] === 0 && buf[q + 1] === 0) return { tag, constructed, start: p, end: q, next: q + 2 };
      q = leggi(buf, q, limite).next;
    }
    throw new P7mError('Fine del contenuto non trovata');
  }
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4) throw new P7mError('Lunghezza ASN.1 troppo grande');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++]!;
  }
  if (p + len > limite) throw new P7mError('File .p7m troncato');
  return { tag, constructed, start: p, end: p + len, next: p + len };
}

function figli(buf: Buffer, n: Nodo): Nodo[] {
  const out: Nodo[] = [];
  for (let p = n.start; p < n.end; ) {
    const c = leggi(buf, p, n.end);
    out.push(c);
    p = c.next;
  }
  return out;
}

/** Concatena un OCTET STRING primitivo o costruito (BER, a pezzi). */
function octetString(buf: Buffer, n: Nodo): Buffer {
  if ((n.tag & 0x1f) !== 0x04) throw new P7mError('Contenuto firmato non trovato');
  if (!n.constructed) return buf.subarray(n.start, n.end);
  return Buffer.concat(figli(buf, n).map((c) => octetString(buf, c)));
}

/** Accetta il .p7m binario oppure la sua versione codificata in base64. */
export function normalizzaP7m(input: Buffer): Buffer {
  if (input[0] === 0x30) return input;
  const testo = input.toString('latin1').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(testo)) {
    const decoded = Buffer.from(testo, 'base64');
    if (decoded[0] === 0x30) return decoded;
  }
  throw new P7mError('Il file non è un .p7m valido');
}

export function estraiDaP7m(input: Buffer): Buffer {
  const buf = normalizzaP7m(input);
  const contentInfo = leggi(buf, 0);
  const [oid, wrapper] = figli(buf, contentInfo);
  if (!oid || oid.tag !== 0x06 || !buf.subarray(oid.start, oid.end).equals(OID_SIGNED_DATA)) {
    throw new P7mError('Il file .p7m non contiene dati firmati (SignedData)');
  }
  if (!wrapper || wrapper.tag !== 0xa0) throw new P7mError('Struttura .p7m inattesa');
  const [signedData] = figli(buf, wrapper);
  if (!signedData) throw new P7mError('Struttura .p7m inattesa');
  const encap = figli(buf, signedData)[2];
  if (!encap || encap.tag !== 0x30) throw new P7mError('Struttura .p7m inattesa');
  const eContentWrapper = figli(buf, encap)[1];
  if (!eContentWrapper || eContentWrapper.tag !== 0xa0) {
    throw new P7mError('Firma "detached": il file .p7m non contiene la fattura');
  }
  const [eContent] = figli(buf, eContentWrapper);
  if (!eContent) throw new P7mError('Contenuto firmato vuoto');
  return octetString(buf, eContent);
}

/** Decodifica l'XML rispettando la codifica dichiarata (UTF-8 o ISO-8859-1). */
export function decodificaXml(bytes: Buffer): string {
  const testa = bytes.subarray(0, 200).toString('latin1');
  const enc = /encoding=["']([^"']+)["']/i.exec(testa)?.[1]?.toLowerCase();
  const latin1 = enc === 'iso-8859-1' || enc === 'latin1' || enc === 'windows-1252';
  const testo = latin1 ? bytes.toString('latin1') : bytes.toString('utf8');
  return testo.replace(/^﻿/, '');
}
