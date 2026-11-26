import { describe, expect, it } from 'vitest';
import { prazoCompleto } from '../list/prazoCompleto';

const AGORA = new Date('2026-10-11T12:00:00');

describe('prazoCompleto', () => {
  it('usa a regra unica de data e acrescenta o dia exato', () => {
    expect(prazoCompleto('2026-10-11T14:00:00', AGORA)).toBe('Hoje, 14:00 · 11/10/2026');
  });

  it('em outro dia mantem o rotulo curto e o dia exato', () => {
    expect(prazoCompleto('2026-09-09T09:05:00', AGORA)).toBe('09 set., 09:05 · 09/09/2026');
  });

  it('sem valor devolve null (a celula nao mostra tooltip)', () => {
    expect(prazoCompleto(null, AGORA)).toBeNull();
    expect(prazoCompleto(undefined, AGORA)).toBeNull();
  });

  it('valor invalido devolve null', () => {
    expect(prazoCompleto('nao-e-data', AGORA)).toBeNull();
  });
});
