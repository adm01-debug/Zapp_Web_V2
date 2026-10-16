import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTalkXAbStats,
  type TalkXAbStatsClient,
} from '@/hooks/integrations/useTalkX';

/**
 * N-120 (refazer 1, ponto 1 da recusa): a tela NÃO pode derivar taxas do tamanho
 * do array — o PostgREST corta a lista no max-rows (padrão 1000) e campanha
 * grande media errado.
 *
 * Aqui a função de busca extraída (`fetchTalkXAbStats`) é exercitada com um
 * cliente falso que inspeciona as consultas REAIS: cada número tem de sair de
 * `count: 'exact', head: true` (total por variante + `not <carimbo> is null` por
 * métrica), e as variantes vêm do catálogo (`talkx_template_variants`).
 * Padrão copiado de `queueMetrics.test.ts` (R2-QUE-001, aprovado).
 */

interface Filtro {
  metodo: string;
  coluna: string;
  valor: unknown;
  operador?: string;
}

interface Consulta {
  tabela: string;
  colunas?: string;
  opcoes?: { count?: 'exact'; head?: boolean };
  filtros: Filtro[];
}

const { estado } = vi.hoisted(() => ({
  estado: { consultas: [] as Consulta[] },
}));

interface Resposta {
  data: unknown;
  count?: number | null;
  error: { message: string } | null;
}

/** Builder falso no formato do supabase-js (encadeável e thenable), que grava o que foi pedido. */
interface ConsultaFalsa {
  select: (colunas?: string, opcoes?: { count?: 'exact'; head?: boolean }) => ConsultaFalsa;
  eq: (coluna: string, valor?: unknown) => ConsultaFalsa;
  not: (coluna: string, operador: string, valor?: unknown) => ConsultaFalsa;
  order: (coluna: string, opcoes?: unknown) => ConsultaFalsa;
  limit: (n: number) => ConsultaFalsa;
  maybeSingle: () => Promise<Resposta>;
  then: (onfulfilled: (valor: Resposta) => unknown) => Promise<unknown>;
}

interface ServidorFalso {
  campaignRow?: { template_id: string | null } | null;
  erroCampaign?: { message: string } | null;
  variantes?: Array<{ id: string; label: string }>;
  erroVariantes?: { message: string } | null;
  /** Linhas da varredura de descoberta (caminho sem template). */
  varredura?: Array<{ variant_id: string | null }>;
  /** Contagens por `${variantId}|total|replied_at|clicked_at|delivered_at`. */
  contagens?: Record<string, number>;
  erroContagem?: { message: string } | null;
}

function metricaDosFiltros(filtros: Filtro[]): string {
  const n = filtros.find((f) => f.metodo === 'not');
  return n ? String(n.coluna) : 'total';
}

function varianteDosFiltros(filtros: Filtro[]): string {
  return String(filtros.find((f) => f.metodo === 'eq' && f.coluna === 'variant_id')?.valor ?? '');
}

function criarBuilder(registro: Consulta, responde: () => Resposta): ConsultaFalsa {
  const encadeia =
    (metodo: string) =>
    (coluna: string, valor?: unknown): ConsultaFalsa => {
      registro.filtros.push({ metodo, coluna, valor });
      return node;
    };
  const node = {} as ConsultaFalsa;
  node.select = (colunas?: string, opcoes?: { count?: 'exact'; head?: boolean }) => {
    registro.colunas = colunas;
    registro.opcoes = opcoes;
    return node;
  };
  node.eq = encadeia('eq');
  node.not = (coluna: string, operador: string, valor?: unknown) => {
    registro.filtros.push({ metodo: 'not', coluna, valor, operador });
    return node;
  };
  node.order = (coluna: string) => {
    registro.filtros.push({ metodo: 'order', coluna, valor: 'asc' });
    return node;
  };
  node.limit = (n: number) => {
    registro.filtros.push({ metodo: 'limit', coluna: '', valor: n });
    return node;
  };
  node.maybeSingle = () => Promise.resolve(responde());
  node.then = (onfulfilled: (valor: Resposta) => unknown) => Promise.resolve(responde()).then(onfulfilled);
  return node;
}

function montarCliente(opcoes: ServidorFalso): TalkXAbStatsClient {
  const clienteFalso = {
    from: (tabela: string) => {
      const registro: Consulta = { tabela, filtros: [] };
      estado.consultas.push(registro);
      if (tabela === 'talkx_campaigns') {
        return {
          select: (colunas?: string) => {
            registro.colunas = colunas;
            return criarBuilder(registro, () => ({
              data: opcoes.campaignRow === undefined ? { template_id: 't1' } : opcoes.campaignRow,
              error: opcoes.erroCampaign ?? null,
            }));
          },
        };
      }
      if (tabela === 'talkx_template_variants') {
        return {
          select: (colunas?: string) => {
            registro.colunas = colunas;
            return criarBuilder(registro, () => ({
              data: opcoes.variantes ?? [],
              error: opcoes.erroVariantes ?? null,
            }));
          },
        };
      }
      // `talkx_recipients`: ou contagem do servidor, ou varredura de ids.
      return {
        select: (colunas?: string, opcoesSelect?: { count?: 'exact'; head?: boolean }) => {
          registro.colunas = colunas;
          registro.opcoes = opcoesSelect;
          return criarBuilder(registro, () => {
            if (opcoesSelect?.head) {
              if (opcoes.erroContagem) return { data: null, count: null, error: opcoes.erroContagem };
              const chave = `${varianteDosFiltros(registro.filtros)}|${metricaDosFiltros(registro.filtros)}`;
              return { data: null, count: opcoes.contagens?.[chave] ?? 0, error: null };
            }
            return { data: opcoes.varredura ?? [], error: null };
          });
        },
      };
    },
  };
  return clienteFalso as unknown as TalkXAbStatsClient;
}

beforeEach(() => {
  estado.consultas = [];
});

describe('fetchTalkXAbStats — contagens no servidor, não o tamanho do array', () => {
  it('totais vêm do count: 1500 + 1000 destinatários com arrays vazios no fio', async () => {
    const cliente = montarCliente({
      campaignRow: { template_id: 't1' },
      variantes: [
        { id: 'v-a', label: 'Nova oferta' },
        { id: 'v-b', label: 'Controle' },
      ],
      contagens: {
        'v-a|total': 1500,
        'v-a|replied_at': 300,
        'v-a|clicked_at': 150,
        'v-a|delivered_at': 1400,
        'v-b|total': 1000,
        'v-b|replied_at': 100,
        'v-b|clicked_at': 40,
        'v-b|delivered_at': 950,
      },
    });

    const { variants } = await fetchTalkXAbStats(cliente, 'c1');

    // antes: total = recipients.filter(...).length (≤ 1000); agora: o count.
    expect(variants).toHaveLength(2);
    expect(variants.find((v) => v.variant_id === 'v-a')).toEqual({
      variant_id: 'v-a',
      label: 'Nova oferta',
      total: 1500,
      replies: 300,
      clicks: 150,
      deliveries: 1400,
    });
    expect(variants.find((v) => v.variant_id === 'v-b')?.total).toBe(1000);

    // TODA leitura de destinatários é contagem do servidor: 2 variantes × 4 medidas.
    const contagens = estado.consultas.filter(
      (c) => c.tabela === 'talkx_recipients' && c.opcoes?.head === true,
    );
    expect(contagens).toHaveLength(8);
    for (const c of contagens) {
      expect(c.opcoes).toEqual({ count: 'exact', head: true });
      // escopo da campanha + variante em todas
      expect(c.filtros).toContainEqual({ metodo: 'eq', coluna: 'campaign_id', valor: 'c1' });
      expect(c.filtros.some((f) => f.metodo === 'eq' && f.coluna === 'variant_id')).toBe(true);
    }

    // cada métrica filtra o carimbo correspondente (`not <col> is null`)
    const porMetrica = (coluna: string) =>
      contagens.filter((c) =>
        c.filtros.some(
          (f) => f.metodo === 'not' && f.coluna === coluna && f.operador === 'is' && f.valor === null,
        ),
      );
    expect(porMetrica('replied_at')).toHaveLength(2);
    expect(porMetrica('clicked_at')).toHaveLength(2);
    expect(porMetrica('delivered_at')).toHaveLength(2);
    // os totais não têm filtro de carimbo
    expect(contagens.filter((c) => !c.filtros.some((f) => f.metodo === 'not'))).toHaveLength(2);

    // NENHUMA consulta baixa a lista de linhas (o array truncado sumiu do caminho)
    const listas = estado.consultas.filter(
      (c) => c.tabela === 'talkx_recipients' && c.opcoes?.head !== true,
    );
    expect(listas).toHaveLength(0);
  });

  it('sem template na campanha: descobre pela varredura leve e conta no servidor', async () => {
    const cliente = montarCliente({
      campaignRow: { template_id: null },
      varredura: [{ variant_id: 'v2' }, { variant_id: 'v1' }, { variant_id: null }, { variant_id: 'v1' }],
      contagens: { 'v1|total': 60, 'v2|total': 55 },
    });

    const { variants } = await fetchTalkXAbStats(cliente, 'c9');

    // nulos fora, ordem estável, sem rótulo (a tela mostra A/B/C)
    expect(variants.map((v) => v.variant_id)).toEqual(['v1', 'v2']);
    expect(variants.every((v) => v.label === null)).toBe(true);
    expect(variants.find((v) => v.variant_id === 'v1')?.total).toBe(60);

    // a varredura pede SÓ a coluna variant_id (nunca a campanha inteira)
    const varreduras = estado.consultas.filter(
      (c) => c.tabela === 'talkx_recipients' && c.opcoes?.head !== true,
    );
    expect(varreduras).toHaveLength(1);
    expect(varreduras[0]?.colunas).toBe('variant_id');
  });

  it('erro na contagem propaga para quem chamou (nada de bloco "zerado" silencioso)', async () => {
    const cliente = montarCliente({
      campaignRow: { template_id: 't1' },
      variantes: [{ id: 'v-a', label: 'A' }],
      erroContagem: { message: 'sem permissão de leitura' },
    });

    await expect(fetchTalkXAbStats(cliente, 'c1')).rejects.toMatchObject({
      message: 'sem permissão de leitura',
    });
  });

  it('campanha inexistente: sem variantes e sem contagens (bloco some, sem throw espúrio)', async () => {
    const cliente = montarCliente({ campaignRow: null });

    const { variants } = await fetchTalkXAbStats(cliente, 'sumiu');

    expect(variants).toEqual([]);
    expect(estado.consultas.some((c) => c.tabela === 'talkx_template_variants')).toBe(false);
    expect(estado.consultas.some((c) => c.opcoes?.head === true)).toBe(false);
  });
});
