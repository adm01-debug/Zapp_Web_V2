import { describe, expect, it } from 'vitest';
import {
  desvioEstimativa,
  formatarTokensCompacto,
  normalizarResumo,
  rotuloStatus,
  taxaDevolucao,
} from '../useAIBudgetSummary';

describe('normalizarResumo', () => {
  it('devolve estrutura vazia quando a RPC não retorna nada', () => {
    const resumo = normalizarResumo(null);
    expect(resumo.janela.execucoes).toBe(0);
    expect(resumo.janela.reservado).toBe(0);
    expect(resumo.janela.desde).toBeNull();
    expect(resumo.por_status).toEqual([]);
    expect(resumo.por_funcao).toEqual([]);
    expect(resumo.por_dia).toEqual([]);
  });

  it('converte números em texto e ignora itens inválidos', () => {
    const resumo = normalizarResumo({
      janela: { dias: '30', execucoes: '12', reservado: '1500', consumido: '1000', devolvido: '500', usuarios: '2', travadas: '1' },
      por_funcao: [{ function_name: 'copilot-live', execucoes: '10', reservado: '1200', consumido: '900', devolvidas: '2' }, null],
      por_dia: [{ dia: '2026-11-25', execucoes: '4', reservado: '400', consumido: '300' }],
    });
    expect(resumo.janela.dias).toBe(30);
    expect(resumo.janela.reservado).toBe(1500);
    expect(resumo.janela.travadas).toBe(1);
    expect(resumo.por_funcao).toHaveLength(1);
    expect(resumo.por_funcao[0].consumido).toBe(900);
    expect(resumo.por_dia[0].dia).toBe('2026-11-25');
  });

  it('ordena funções por reservado e dias por data', () => {
    const resumo = normalizarResumo({
      por_funcao: [
        { function_name: 'classify-sticker', reservado: 100 },
        { function_name: 'copilot-live', reservado: 900 },
      ],
      por_dia: [
        { dia: '2026-11-25', reservado: 1 },
        { dia: '2026-11-23', reservado: 1 },
      ],
    });
    expect(resumo.por_funcao.map(item => item.function_name)).toEqual(['copilot-live', 'classify-sticker']);
    expect(resumo.por_dia.map(item => item.dia)).toEqual(['2026-11-23', '2026-11-25']);
  });
});

describe('desvioEstimativa', () => {
  it('mede o consumo acima da reserva em percentual', () => {
    expect(desvioEstimativa(4500, 4000)).toBeCloseTo(12.5, 5);
  });

  it('é negativo quando o consumo fica abaixo da reserva', () => {
    expect(desvioEstimativa(2000, 4000)).toBeCloseTo(-50, 5);
  });

  it('não divide por zero', () => {
    expect(desvioEstimativa(1000, 0)).toBeNull();
  });
});

describe('taxaDevolucao', () => {
  it('mede a fatia devolvida da reserva', () => {
    expect(taxaDevolucao(1000, 4000)).toBeCloseTo(25, 5);
  });

  it('não divide por zero', () => {
    expect(taxaDevolucao(10, 0)).toBeNull();
  });
});

describe('formatarTokensCompacto', () => {
  it('mantém números pequenos com separador local', () => {
    expect(formatarTokensCompacto(999)).toBe('999');
    expect(formatarTokensCompacto(1500)).toBe('1,5 mil');
  });

  it('compacta milhões e bilhões', () => {
    expect(formatarTokensCompacto(4_867_170)).toBe('4,9 mi');
    expect(formatarTokensCompacto(120_000_000)).toBe('120 mi');
    expect(formatarTokensCompacto(1_200_000_000)).toBe('1,2 bi');
  });

  it('preserva o sinal de valores negativos', () => {
    expect(formatarTokensCompacto(-1500)).toBe('-1,5 mil');
  });
});

describe('rotuloStatus', () => {
  it('traduz as situações do ledger', () => {
    expect(rotuloStatus('settled')).toBe('Concluídas');
    expect(rotuloStatus('released')).toBe('Devolvidas');
    expect(rotuloStatus('reserved')).toBe('Abertas');
    expect(rotuloStatus('outro')).toBe('outro');
    expect(rotuloStatus('')).toBe('Desconhecido');
  });
});
