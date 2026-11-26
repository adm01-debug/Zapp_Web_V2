import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Contrato da agregacao `resumo_orcamento_ia(p_dias)` (ledger
 * `ai_budget_reservations`). A tabela tem RLS ligado e nenhuma policy de SELECT:
 * o unico caminho de leitura para admin/supervisor e esta RPC agregada.
 *
 * `reservado` e o que foi prometido ao chamador (nunca e faturamento);
 * `consumido` e o gasto real (`actual_tokens`, gravado no settle); `devolvido`
 * sao reservas liberadas sem consumo.
 */
export interface OrcamentoJanela {
  dias: number;
  desde: string | null;
  execucoes: number;
  usuarios: number;
  reservado: number;
  consumido: number;
  devolvido: number;
  travadas: number;
}

export interface OrcamentoPorStatus {
  status: string;
  execucoes: number;
  reservado: number;
  consumido: number;
}

export interface OrcamentoPorFuncao {
  function_name: string;
  execucoes: number;
  reservado: number;
  consumido: number;
  devolvidas: number;
}

export interface OrcamentoPorDia {
  dia: string;
  execucoes: number;
  reservado: number;
  consumido: number;
}

export interface ResumoOrcamentoIA {
  janela: OrcamentoJanela;
  por_status: OrcamentoPorStatus[];
  por_funcao: OrcamentoPorFuncao[];
  por_dia: OrcamentoPorDia[];
}

export const JANELAS_ORCAMENTO = [7, 30, 90] as const;

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function lista(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
}

export function normalizarResumo(bruto: unknown): ResumoOrcamentoIA {
  const raiz = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const janela = (raiz.janela && typeof raiz.janela === 'object' ? raiz.janela : {}) as Record<string, unknown>;

  return {
    janela: {
      dias: numero(janela.dias),
      desde: typeof janela.desde === 'string' ? janela.desde : null,
      execucoes: numero(janela.execucoes),
      usuarios: numero(janela.usuarios),
      reservado: numero(janela.reservado),
      consumido: numero(janela.consumido),
      devolvido: numero(janela.devolvido),
      travadas: numero(janela.travadas),
    },
    por_status: lista(raiz.por_status).map(item => ({
      status: texto(item.status),
      execucoes: numero(item.execucoes),
      reservado: numero(item.reservado),
      consumido: numero(item.consumido),
    })),
    por_funcao: lista(raiz.por_funcao)
      .map(item => ({
        function_name: texto(item.function_name) || 'desconhecida',
        execucoes: numero(item.execucoes),
        reservado: numero(item.reservado),
        consumido: numero(item.consumido),
        devolvidas: numero(item.devolvidas),
      }))
      .sort((a, b) => b.reservado - a.reservado),
    por_dia: lista(raiz.por_dia)
      .map(item => ({
        dia: texto(item.dia),
        execucoes: numero(item.execucoes),
        reservado: numero(item.reservado),
        consumido: numero(item.consumido),
      }))
      .filter(item => item.dia !== '')
      .sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

/** Percentual de consumo acima (positivo) ou abaixo (negativo) do reservado. */
export function desvioEstimativa(consumido: number, reservado: number): number | null {
  if (!reservado) return null;
  return ((consumido - reservado) / reservado) * 100;
}

/** Fatia das reservas que voltou sem consumo (chamada barrada ou que falhou). */
export function taxaDevolucao(devolvido: number, reservado: number): number | null {
  if (!reservado) return null;
  return (devolvido / reservado) * 100;
}

const SUFIXOS: Array<{ limite: number; divisor: number; sufixo: string }> = [
  { limite: 1_000_000_000, divisor: 1_000_000_000, sufixo: 'bi' },
  { limite: 1_000_000, divisor: 1_000_000, sufixo: 'mi' },
  { limite: 1_000, divisor: 1_000, sufixo: 'mil' },
];

export function formatarTokensCompacto(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  const absoluto = Math.abs(n);
  for (const { limite, divisor, sufixo } of SUFIXOS) {
    if (absoluto >= limite) {
      const convertido = n / divisor;
      const casas = Math.abs(convertido) >= 100 ? 0 : 1;
      return `${convertido.toFixed(casas).replace('.', ',')} ${sufixo}`;
    }
  }
  return n.toLocaleString('pt-BR');
}

export function rotuloStatus(status: string): string {
  switch (status) {
    case 'settled':
      return 'Concluídas';
    case 'released':
      return 'Devolvidas';
    case 'reserved':
      return 'Abertas';
    default:
      return status || 'Desconhecido';
  }
}

export function useAIBudgetSummary(dias: number) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  return useQuery({
    queryKey: ['ai-budget-summary', dias],
    queryFn: async () => {
      const { data, error } = await rpc('resumo_orcamento_ia', { p_dias: dias });
      if (error) throw new Error(error.message);
      return normalizarResumo(data);
    },
    staleTime: 60_000,
    retry: 1,
  });
}
