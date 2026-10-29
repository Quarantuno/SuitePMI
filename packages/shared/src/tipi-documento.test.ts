import { describe, expect, it } from 'vitest';
import { etichettaTipoDocumento, TIPI_SOLO_FISCALI } from './tipi-documento';

describe('tipi documento', () => {
  it('etichette e documenti solo fiscali', () => {
    expect(etichettaTipoDocumento('TD05')).toBe('Nota di debito');
    expect(etichettaTipoDocumento('TD99')).toBe('TD99');
    expect(TIPI_SOLO_FISCALI.has('TD17')).toBe(true);
    expect(TIPI_SOLO_FISCALI.has('TD24')).toBe(false);
  });
});
