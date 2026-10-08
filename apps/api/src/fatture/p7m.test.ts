import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFatturaPA } from './fatturapa.parser';
import { decodificaXml, estraiDaP7m, P7mError } from './p7m';

const fixture = (nome: string) => readFileSync(join(__dirname, '../../test/fixtures', nome));
const originale = fixture('fattura-attiva.xml');

describe('estraiDaP7m', () => {
  it('estrae la fattura da un .p7m DER', () => {
    expect(estraiDaP7m(fixture('fattura-attiva.xml.p7m')).equals(originale)).toBe(true);
  });

  it('estrae la fattura da un .p7m BER con lunghezze indefinite', () => {
    expect(estraiDaP7m(fixture('fattura-attiva-ber.xml.p7m')).equals(originale)).toBe(true);
  });

  it('accetta anche il .p7m codificato in base64', () => {
    const b64 = Buffer.from(fixture('fattura-attiva.xml.p7m').toString('base64').replace(/(.{64})/g, '$1\n'));
    const xml = decodificaXml(estraiDaP7m(b64));
    expect(parseFatturaPA(xml).numero).toBe('2026/0042');
  });

  it('rifiuta file che non sono buste firmate', () => {
    expect(() => estraiDaP7m(originale)).toThrow(P7mError);
    expect(() => estraiDaP7m(Buffer.from([0x30, 0x82, 0xff, 0xff, 0x06]))).toThrow(/troncato/);
  });
});

describe('decodificaXml', () => {
  it('rispetta la codifica ISO-8859-1 dichiarata', () => {
    const latin1 = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>Società</a>', 'latin1');
    expect(decodificaXml(latin1)).toContain('Società');
    expect(decodificaXml(Buffer.from('﻿<a>è</a>', 'utf8'))).toBe('<a>è</a>');
  });
});
