import { describe, it, expect } from 'vitest';
import { PROMOGIFTS_BASE_URL, promogiftsProductUrl } from '../catalogExport';

// A exportação CSV do catálogo e do histórico de envios saiu do produto (regra
// do dono: nenhuma informação sai do sistema). O módulo ficou só com o link
// PÚBLICO do PromoGifts, que não é saída de dado — é o "ver no site" do card e
// do rail.

describe('promogiftsProductUrl', () => {
  it('sem slug nao inventa link', () => {
    expect(promogiftsProductUrl(null)).toBe('');
    expect(promogiftsProductUrl('copos')).toBe(`${PROMOGIFTS_BASE_URL}/copos`);
  });
});
