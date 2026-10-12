/**
 * Prova do cálculo do SLA de RESOLUÇÃO (paridade V3 -> V2, parte 7).
 *
 * O painel lia só a 1ª resposta e ignorava as colunas de resolução que já
 * existem em `conversation_sla` (`resolution_breached`, `resolved_at`). Aqui se
 * prova a MESMA decisão “avaliada x pendente” da 1ª resposta, agora no desfecho
 * de resolução — e, o ponto do incidente R2-SLA-001, que a pendente não conta
 * como “no prazo” nem entra no denominador.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyResolution,
  resolutionRatePct,
  resolutionRatePctOrZero,
  sumResolutionTallies,
  tallyResolution,
  type ResolutionFields,
} from '@/hooks/sla/slaResolution';

const resolvida = (overrides: Partial<ResolutionFields> = {}): ResolutionFields => ({
  resolution_breached: false,
  resolved_at: '2026-10-12T10:00:00.000Z',
  ...overrides,
});

const violada = (): ResolutionFields => ({
  resolution_breached: true,
  resolved_at: '2026-10-12T10:00:00.000Z',
});

const pendente = (): ResolutionFields => ({
  resolution_breached: false,
  resolved_at: null,
});

describe('classifyResolution', () => {
  it('carimba a violação mesmo com resolved_at preenchido (o carimbo do banco manda)', () => {
    expect(classifyResolution(violada())).toBe('breached');
  });

  it('resolved_at sem violação é no prazo', () => {
    expect(classifyResolution(resolvida())).toBe('on_time');
  });

  it('sem violação e sem resolved_at é pendente', () => {
    expect(classifyResolution(pendente())).toBe('pending');
    expect(classifyResolution({ resolution_breached: null, resolved_at: null })).toBe('pending');
  });
});

describe('tallyResolution', () => {
  it('a pendente não entra no denominador nem no "no prazo"', () => {
    const tally = tallyResolution([
      resolvida(),
      resolvida(),
      violada(),
      pendente(),
      pendente(),
      pendente(),
    ]);

    // Vermelho antes: 3 pendentes virariam "no prazo" e a taxa mentiria 100%.
    expect(tally.evaluated).toBe(3);
    expect(tally.onTime).toBe(2);
    expect(tally.breached).toBe(1);
    expect(tally.pending).toBe(3);
    expect(resolutionRatePctOrZero(tally)).toBeCloseTo(66.67, 1);
  });

  it('só pendentes ⇒ taxa 0 e nenhuma avaliada (nunca 100)', () => {
    const tally = tallyResolution([pendente(), pendente()]);
    expect(tally.evaluated).toBe(0);
    expect(resolutionRatePctOrZero(tally)).toBe(0);
  });
});

describe('resolutionRatePct', () => {
  it('sem nenhuma avaliada devolve null — a taxa não existe', () => {
    expect(resolutionRatePct(tallyResolution([pendente()]))).toBeNull();
    expect(resolutionRatePct(tallyResolution([]))).toBeNull();
  });

  it('lista vazia é o estado inicial zera-tudo', () => {
    expect(tallyResolution([])).toEqual({ evaluated: 0, onTime: 0, breached: 0, pending: 0 });
  });
});

describe('sumResolutionTallies', () => {
  it('soma dia a dia sem recalcular o desfecho', () => {
    const dia1 = tallyResolution([resolvida(), violada()]);
    const dia2 = tallyResolution([resolvida(), pendente()]);

    expect(sumResolutionTallies([dia1, dia2])).toEqual({
      evaluated: 3,
      onTime: 2,
      breached: 1,
      pending: 1,
    });
    expect(sumResolutionTallies([])).toEqual({ evaluated: 0, onTime: 0, breached: 0, pending: 0 });
  });
});
