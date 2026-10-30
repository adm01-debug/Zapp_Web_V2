/**
 * Saúde do relacionamento (fase K, etapa K05).
 *
 * Função PURA: os instantes são montados a partir de um `now` fixo e as fronteiras são
 * conferidas uma a uma (3/4, 14/15, 30/31 dias), porque é exatamente aí que a classificação
 * erra. Fuso não entra na conta: a diferença é feita em milissegundos sobre o instante ISO.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyJourneyHealth,
  HEALTH_ACTIVE_MAX_DAYS,
  HEALTH_COOLING_MAX_DAYS,
  HEALTH_RECENT_WINDOW_DAYS,
  HEALTH_WARM_MAX_DAYS,
} from '@/lib/journey/health';

const AGORA = new Date('2026-10-15T12:00:00.000Z');
const DIA_MS = 86_400_000;

/** Instante ISO `dias` (com `horas` a mais) antes do `AGORA` fixo. */
function atras(dias: number, horas = 0): string {
  return new Date(AGORA.getTime() - dias * DIA_MS - horas * 3_600_000).toISOString();
}

describe('classifyJourneyHealth', () => {
  it('classifica as quatro faixas com as fronteiras do cartão', () => {
    expect(classifyJourneyHealth({ lastInteractionAt: atras(0) }, AGORA).level).toBe('active');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(HEALTH_ACTIVE_MAX_DAYS) }, AGORA).level).toBe('active');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(HEALTH_ACTIVE_MAX_DAYS + 1) }, AGORA).level).toBe('warm');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(HEALTH_WARM_MAX_DAYS) }, AGORA).level).toBe('warm');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(HEALTH_WARM_MAX_DAYS + 1) }, AGORA).level).toBe('cooling');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(HEALTH_COOLING_MAX_DAYS) }, AGORA).level).toBe('cooling');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(HEALTH_COOLING_MAX_DAYS + 1) }, AGORA).level).toBe('inactive');
  });

  it('conta dias inteiros: as horas extras do dia corrente não mudam a faixa', () => {
    // 3 dias + 23 h ainda é o 3º dia (piso), e 4 dias + 23 h ainda é o 4º (Morno).
    expect(classifyJourneyHealth({ lastInteractionAt: atras(3, 23) }, AGORA).daysSinceContact).toBe(3);
    expect(classifyJourneyHealth({ lastInteractionAt: atras(3, 23) }, AGORA).level).toBe('active');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(4, 23) }, AGORA).level).toBe('warm');
  });

  it('escreve o texto do cartão ("<Rótulo>: N dias sem contato")', () => {
    const health = classifyJourneyHealth({ lastInteractionAt: atras(20) }, AGORA);
    expect(health.label).toBe('Esfriando');
    expect(health.headline).toBe('Esfriando: 20 dias sem contato');
    expect(health.daysSinceContact).toBe(20);
  });

  // O cartão dá as faixas (15–30 = Esfriando) e um exemplo com 12 dias ("Esfriando: 12 dias sem
  // contato"), que pertence a Morno. As FAIXAS mandam: 12 dias é Morno, no mesmo formato de texto.
  it('12 dias é Morno (as faixas mandam sobre o exemplo do cartão), com o texto do mesmo formato', () => {
    const health = classifyJourneyHealth({ lastInteractionAt: atras(12) }, AGORA);
    expect(health.level).toBe('warm');
    expect(health.headline).toBe('Morno: 12 dias sem contato');
  });

  it('singular e "hoje" não saem no plural nem como "0 dias"', () => {
    expect(classifyJourneyHealth({ lastInteractionAt: atras(0) }, AGORA).headline).toBe('Ativo: contato hoje');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(1) }, AGORA).headline).toBe('Ativo: 1 dia sem contato');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(2) }, AGORA).headline).toBe('Ativo: 2 dias sem contato');
  });

  it('leva a cor do sistema por faixa (success/info/warning/muted)', () => {
    expect(classifyJourneyHealth({ lastInteractionAt: atras(1) }, AGORA).tone).toBe('success');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(7) }, AGORA).tone).toBe('info');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(20) }, AGORA).tone).toBe('warning');
    expect(classifyJourneyHealth({ lastInteractionAt: atras(40) }, AGORA).tone).toBe('muted');
  });

  it('sem contato (ou com carimbo ilegível) é Inativo, sem dias e sem inventar número', () => {
    for (const vazio of [null, undefined, '', 'ontem']) {
      const health = classifyJourneyHealth({ lastInteractionAt: vazio }, AGORA);
      expect(health.level).toBe('inactive');
      expect(health.label).toBe('Inativo');
      expect(health.daysSinceContact).toBeNull();
      expect(health.headline).toBe('Sem contato registrado');
      expect(health.tone).toBe('muted');
    }
  });

  it('carimbo no futuro não vira dias negativos', () => {
    const health = classifyJourneyHealth({ lastInteractionAt: '2026-10-16T12:00:00.000Z' }, AGORA);
    expect(health.daysSinceContact).toBe(0);
    expect(health.level).toBe('active');
  });

  it('conta a frequência recente dentro da janela e ignora o que está fora ou é ilegível', () => {
    const health = classifyJourneyHealth(
      {
        lastInteractionAt: atras(1),
        recentInteractions: [
          atras(1),
          atras(10),
          atras(HEALTH_RECENT_WINDOW_DAYS),
          atras(HEALTH_RECENT_WINDOW_DAYS + 1),
          'não é data',
          null,
          undefined,
        ],
      },
      AGORA,
    );
    expect(health.recentCount).toBe(3);
  });

  it('sem lista de interações recentes a frequência é 0 (e o contato continua Ativo)', () => {
    expect(classifyJourneyHealth({ lastInteractionAt: atras(1) }, AGORA).recentCount).toBe(0);
    expect(classifyJourneyHealth({ lastInteractionAt: atras(0) }, AGORA).level).toBe('active');
  });

  it('toda classificação carrega a regra que explica o chip', () => {
    const health = classifyJourneyHealth({ lastInteractionAt: atras(20) }, AGORA);
    expect(health.rule).toContain('até 3 dias = Ativo');
    expect(health.rule).toContain('4 a 14 dias = Morno');
    expect(health.rule).toContain('15 a 30 dias = Esfriando');
    expect(health.rule).toContain('mais de 30 dias = Inativo');
  });

  it('respeita o relógio de referência recebido (não lê o relógio da máquina)', () => {
    const carimbo = '2026-10-15T11:00:00.000Z';
    expect(classifyJourneyHealth({ lastInteractionAt: carimbo }, AGORA).daysSinceContact).toBe(0);
    // Um ano depois o MESMO carimbo já é Inativo — a conta sai do `now`, não de um `Date.now` escondido.
    const depois = new Date('2027-10-15T12:00:00.000Z');
    expect(classifyJourneyHealth({ lastInteractionAt: carimbo }, depois).level).toBe('inactive');
  });
});
