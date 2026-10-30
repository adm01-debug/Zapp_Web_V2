/**
 * Prova que as cinco fusões dos hooks duplicados do RADAR (CV-078/079/080/087/088)
 * mantêm o comportamento antigo e o que veio da versão apagada.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLossRiskDetector } from '../useLossRiskDetector';
import { useMinQuantityAlternative } from '../useMinQuantityAlternative';
import { usePostRejection } from '../usePostRejection';
import { useUpsellSuggestion } from '../useUpsellSuggestion';
import { useOccasionKits } from '../useOccasionKits';

describe('useLossRiskDetector (une useLossRiskAlert)', () => {
  it('sinal do concorrente, que só a versão apagada tinha, é risco alto', () => {
    const { result } = renderHook(() => useLossRiskDetector({ clientText: 'Recebi outra proposta ontem' }));
    expect(result.current.level).toBe('high');
    expect(result.current.signals).toContain('recebi outra proposta');
  });

  it('separa a orientação do vendedor da mensagem para o cliente', () => {
    const { result } = renderHook(() => useLossRiskDetector({ clientText: 'vou pensar' }));
    expect(result.current.recoveryAction).toMatch(/proposta revisada/);
    expect(result.current.script).toMatch(/confirmação/);
    expect(result.current.script).not.toBe(result.current.recoveryAction);
  });

  it('considera o histórico recente do cliente', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({ clientText: 'ok', recentClientMessages: ['fechei com outro fornecedor'] }),
    );
    expect(result.current.level).toBe('high');
  });

  it('sem risco não sugere mensagem', () => {
    const { result } = renderHook(() => useLossRiskDetector({ clientText: 'Ótimo, vamos confirmar.' }));
    expect(result.current.level).toBe('low');
    expect(result.current.script).toBe('');
  });
});

describe('useMinQuantityAlternative (une useMinQtyAlternative)', () => {
  it('gatilho que só a versão apagada tinha dispara e traz as alternativas de composição', () => {
    const { result } = renderHook(() => useMinQuantityAlternative({ lastClientMessage: 'não chego no lote' }));
    expect(result.current).not.toBeNull();
    expect(result.current?.alternatives).toHaveLength(3);
  });

  it('mantém a sugestão de 30 unidades para pedidos muito pequenos', () => {
    const { result } = renderHook(() => useMinQuantityAlternative({ lastClientMessage: 'preciso de 10 unidades' }));
    expect(result.current?.suggestedQty).toBe(30);
  });

  it('acima do mínimo não dispara', () => {
    const { result } = renderHook(() => useMinQuantityAlternative({ lastClientMessage: 'quero 200 peças' }));
    expect(result.current).toBeNull();
  });
});

describe('usePostRejection (une useRejectionRecovery)', () => {
  it('gatilho que só a versão apagada tinha é detectado, com ação para o vendedor', () => {
    const { result } = renderHook(() => usePostRejection({ clientMessage: 'Vou passar dessa vez, obrigado' }));
    expect(result.current.detected).toBe(true);
    expect(result.current.followUpDays).toBe(90);
    expect(result.current.followUpAction).toMatch(/90 dias/);
  });

  it('mensagem neutra não é rejeição', () => {
    const { result } = renderHook(() => usePostRejection({ clientMessage: 'Pode mandar o orçamento' }));
    expect(result.current.detected).toBe(false);
  });
});

describe('useUpsellSuggestion (une useUpsell)', () => {
  it('ecobag, que só a versão apagada cobria, ganha sugestão com incremento de ticket', () => {
    const { result } = renderHook(() => useUpsellSuggestion({ productMentioned: 'ecobag' }));
    expect(result.current[0]).toMatchObject({ type: 'crosssell', ticketIncreasePct: 50 });
  });

  it('camiseta mantém o upsell antigo e ganha o boné', () => {
    const { result } = renderHook(() => useUpsellSuggestion({ productMentioned: 'camiseta' }));
    expect(result.current.map((s) => s.productSuggestion)).toEqual(['Camiseta dry-fit ou premium', 'Boné bordado']);
  });
});

describe('useOccasionKits (une useKitSuggestion)', () => {
  it('ocasião reconhecida continua tendo prioridade', () => {
    const { result } = renderHook(() => useOccasionKits({ conversationText: 'canetas para o congresso' }));
    expect(result.current?.kitName).toBe('Kit Executivo');
  });

  it('sem ocasião, cai para o kit do produto citado', () => {
    const { result } = renderHook(() => useOccasionKits({ conversationText: 'quero ecobags com logo' }));
    expect(result.current?.kitName).toBe('Kit Sustentabilidade');
  });

  it('sem ocasião nem produto conhecido, não sugere', () => {
    const { result } = renderHook(() => useOccasionKits({ conversationText: 'bom dia' }));
    expect(result.current).toBeNull();
  });
});
