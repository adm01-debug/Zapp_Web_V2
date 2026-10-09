import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeQueueMetrics,
  fetchQueueMetrics,
  todayWindow,
  SLA_PAGE_SIZE,
  type QueueMetricsClient,
  type SlaSample,
} from '@/pages/queue-details/queueMetrics';

/**
 * R2-QUE-001 / R2-QUE-003 (item 105, refazer): a tela de fila não pode exibir estimativa fixa nem
 * medir a FILA pelo recorte visível.
 *
 * Aqui a função de busca extraída (`fetchQueueMetrics`) é exercitada com um cliente falso que
 * inspeciona as consultas REAIS: as contagens são `count: 'exact', head: true` (a fila inteira, não
 * a página de 50), `resolvedToday` tem janela semiaberta no `conversation_status_changed_at` e o SLA
 * é lido por relação com `contacts.queue_id`, paginando explicitamente.
 */

interface Filtro {
  metodo: string;
  coluna: string;
  valor: unknown;
}

interface Consulta {
  tabela: string;
  colunas?: string;
  opcoes?: { count?: 'exact'; head?: boolean };
  filtros: Filtro[];
}

const { estado, logError } = vi.hoisted(() => ({
  estado: {
    consultas: [] as Consulta[],
    paginas: [] as Array<{ from: number; to: number }>,
  },
  logError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
  gte: (coluna: string, valor?: unknown) => ConsultaFalsa;
  lt: (coluna: string, valor?: unknown) => ConsultaFalsa;
  in: (coluna: string, valores?: unknown) => ConsultaFalsa;
  order: (coluna: string, opcoes?: unknown) => ConsultaFalsa;
  range: (from: number, to: number) => Promise<Resposta>;
  then: (onfulfilled: (valor: Resposta) => unknown) => Promise<unknown>;
}

function criarBuilder(
  registro: Consulta,
  responde: (range?: { from: number; to: number }) => Resposta,
): ConsultaFalsa {
  const encadeia = (metodo: string) => (coluna: string, valor?: unknown) => {
    registro.filtros.push({ metodo, coluna, valor });
    return node;
  };
  const node = {} as ConsultaFalsa;
  node.select = (_colunas?: string, _opcoes?: { count?: 'exact'; head?: boolean }) => node;
  node.eq = encadeia('eq');
  node.not = encadeia('not');
  node.gte = encadeia('gte');
  node.lt = encadeia('lt');
  node.in = encadeia('in');
  node.order = encadeia('order');
  node.range = (from: number, to: number) => {
    estado.paginas.push({ from, to });
    return Promise.resolve(responde({ from, to }));
  };
  node.then = (onfulfilled: (valor: Resposta) => unknown) => Promise.resolve(responde()).then(onfulfilled);
  return node;
}

interface ServidorFalso {
  total?: number;
  atribuidos?: number;
  resolvidosHoje?: number;
  /** Páginas de `conversation_sla` na ORDEM em que o `range` as pede (página 0 = `from` 0). */
  paginasSla?: SlaSample[][];
  erroSla?: { message: string } | null;
  /** Índice da página a partir da qual a leitura passa a falhar (default 0). */
  erroSlaAPartirDePagina?: number;
  erroContagem?: { message: string } | null;
}

function montarCliente(opcoes: ServidorFalso): QueueMetricsClient {
  const clienteFalso = {
    from: (tabela: string) => {
      const registro: Consulta = { tabela, filtros: [] };
      estado.consultas.push(registro);
      if (tabela === 'conversation_sla') {
        return {
          select: (colunas?: string, opcoesSelect?: { count?: 'exact'; head?: boolean }) => {
            registro.colunas = colunas;
            registro.opcoes = opcoesSelect;
            return criarBuilder(registro, (range) => {
              const pagina = Math.floor((range?.from ?? 0) / SLA_PAGE_SIZE);
              const falha = opcoes.erroSla != null && pagina >= (opcoes.erroSlaAPartirDePagina ?? 0);
              // `erroSla` marca a leitura como FALHA sem apagar o que veio: assim o teste prova que
              // a leitura PARCIAL é descartada, e não só que um `data: null` virou "Sem dados".
              return {
                data: (opcoes.paginasSla ?? [])[pagina] ?? [],
                error: falha ? opcoes.erroSla ?? null : null,
              };
            });
          },
        };
      }
      // `contacts` (e qualquer outra tabela) responde como contagem do servidor.
      return {
        select: (colunas?: string, opcoesSelect?: { count?: 'exact'; head?: boolean }) => {
          registro.colunas = colunas;
          registro.opcoes = opcoesSelect;
          return criarBuilder(registro, () => {
            if (opcoes.erroContagem) return { data: null, count: null, error: opcoes.erroContagem };
            const filtros = registro.filtros;
            const pediuResolvidos = filtros.some((f) => f.coluna === 'conversation_status');
            const pediuAtribuidos = filtros.some((f) => f.coluna === 'assigned_to');
            return {
              data: null,
              count: pediuResolvidos
                ? opcoes.resolvidosHoje ?? 0
                : pediuAtribuidos
                  ? opcoes.atribuidos ?? 0
                  : opcoes.total ?? 0,
              error: null,
            };
          });
        },
      };
    },
  };
  return clienteFalso as unknown as QueueMetricsClient;
}

/** A consulta a `contacts` que pediu a contagem de Resolvidos Hoje (status `resolved`). */
function consultaDeResolvidos(): Consulta | undefined {
  return estado.consultas.find(
    (c) => c.tabela === 'contacts' && c.filtros.some((f) => f.coluna === 'conversation_status'),
  );
}

function consultaDeSla(): Consulta {
  const c = estado.consultas.find((x) => x.tabela === 'conversation_sla');
  if (!c) throw new Error('nenhuma consulta a conversation_sla foi feita');
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.consultas = [];
  estado.paginas = [];
});

describe('fetchQueueMetrics — fila inteira, não a página de 50', () => {
  it('usa contagens do servidor: 137 contatos, 92 atribuídos e 7 resolvidos hoje fora dos 50 exibidos', async () => {
    const cliente = montarCliente({ total: 137, atribuidos: 92, resolvidosHoje: 7 });

    const m = await fetchQueueMetrics(cliente, 'q-1', new Date(2026, 9, 5, 14, 30));

    // antes: total = contactsData.length (≤ 50) e resolvedToday = floor(atribuídos * 0.7)
    expect(m.totalContacts).toBe(137);
    expect(m.assignedContacts).toBe(92);
    expect(m.waitingContacts).toBe(45);
    expect(m.resolvedToday).toBe(7);

    // as três contagens são pedidas ao servidor com `count: 'exact', head: true`
    const contagens = estado.consultas.filter((c) => c.tabela === 'contacts');
    expect(contagens).toHaveLength(3);
    for (const c of contagens) {
      expect(c.opcoes).toEqual({ count: 'exact', head: true });
      expect(c.colunas).toBe('id');
    }

    // a de Resolvidos Hoje filtra o status canônico…
    const resolvidos = consultaDeResolvidos();
    expect(resolvidos).toBeDefined();
    expect(resolvidos?.filtros).toContainEqual({
      metodo: 'eq',
      coluna: 'conversation_status',
      valor: 'resolved',
    });

    // …e NENHUMA das consultas usa uma lista de IDs da página visível
    const usouListaDeIds = estado.consultas.some((c) => c.filtros.some((f) => f.metodo === 'in'));
    expect(usouListaDeIds).toBe(false);
  });

  it('a janela de "hoje" é semiaberta: [início de hoje, início de amanhã)', async () => {
    const cliente = montarCliente({ total: 1, atribuidos: 0, resolvidosHoje: 0 });
    const agora = new Date(2026, 9, 5, 14, 30); // 05/10/2026 14:30 no fuso local
    const inicioDeHoje = new Date(2026, 9, 5, 0, 0, 0, 0).toISOString();
    const inicioDeAmanha = new Date(2026, 9, 6, 0, 0, 0, 0).toISOString();

    expect(todayWindow(agora)).toEqual({ start: inicioDeHoje, end: inicioDeAmanha });
    await fetchQueueMetrics(cliente, 'q-1', agora);

    const resolvidos = consultaDeResolvidos();
    expect(resolvidos?.filtros).toContainEqual({
      metodo: 'gte',
      coluna: 'conversation_status_changed_at',
      valor: inicioDeHoje,
    });
    // limite aberto à direita: um contato resolvido às 00:00 de amanhã NÃO entra em hoje
    expect(resolvidos?.filtros).toContainEqual({
      metodo: 'lt',
      coluna: 'conversation_status_changed_at',
      valor: inicioDeAmanha,
    });
  });

  it('erro na contagem segue o tratamento geral: propaga para quem chamou', async () => {
    const cliente = montarCliente({ erroContagem: { message: 'sem permissão de leitura' } });

    await expect(fetchQueueMetrics(cliente, 'q-1', new Date(2026, 9, 5, 14, 30))).rejects.toEqual({
      message: 'sem permissão de leitura',
    });
  });
});

describe('fetchQueueMetrics — SLA da fila inteira, paginado', () => {
  const paginaCheia: SlaSample[] = Array.from({ length: SLA_PAGE_SIZE }, () => ({
    first_message_at: '2026-10-05T09:00:00.000Z',
    first_response_at: null, // amostra sem primeira resposta: fora da média
  }));

  it('considera amostra válida que só aparece na SEGUNDA página', async () => {
    const cliente = montarCliente({
      total: 137,
      atribuidos: 92,
      resolvidosHoje: 7,
      paginasSla: [
        paginaCheia,
        [{ first_message_at: '2026-10-05T09:00:00.000Z', first_response_at: '2026-10-05T09:02:00.000Z' }],
      ],
    });

    const m = await fetchQueueMetrics(cliente, 'q-1', new Date(2026, 9, 5, 14, 30));

    // a média só existe se a leitura tiver passado da primeira página: 120s = 2 min
    expect(m.avgResponseTime).toBe('2 min');
    expect(estado.paginas).toEqual([
      { from: 0, to: SLA_PAGE_SIZE - 1 },
      { from: SLA_PAGE_SIZE, to: 2 * SLA_PAGE_SIZE - 1 },
    ]);
    // a leitura é da FILA por relação com contacts.queue_id — não de uma lista dos 50 exibidos
    expect(consultaDeSla().colunas).toContain('contacts!inner(queue_id)');
    expect(consultaDeSla().filtros).toEqual([
      { metodo: 'eq', coluna: 'contacts.queue_id', valor: 'q-1' },
      { metodo: 'order', coluna: 'id', valor: { ascending: true } },
    ]);
    // medidas de SLA não afetam as contagens do servidor
    expect(m.totalContacts).toBe(137);
    expect(m.resolvedToday).toBe(7);
  });

  it('erro na leitura de SLA é fail-closed: "Sem dados" e as contagens permanecem', async () => {
    const cliente = montarCliente({
      total: 137,
      atribuidos: 92,
      resolvidosHoje: 7,
      // A página 0 já trouxe amostras (uma delas válida, 600s) e a página 1 FALHA. A leitura
      // parcial tem de ser descartada: média sobre leitura incompleta é número inventado.
      paginasSla: [
        [
          ...paginaCheia.slice(1),
          { first_message_at: '2026-10-05T09:00:00.000Z', first_response_at: '2026-10-05T09:10:00.000Z' },
        ],
        [],
      ],
      erroSla: { message: 'timeout na leitura de conversation_sla' },
      erroSlaAPartirDePagina: 1,
    });

    const m = await fetchQueueMetrics(cliente, 'q-1', new Date(2026, 9, 5, 14, 30));

    expect(m.avgResponseTime).toBe('Sem dados'); // antes caía no valor fixo "~3 min"; parcial daria "10 min"
    expect(m.totalContacts).toBe(137);
    expect(m.assignedContacts).toBe(92);
    expect(m.waitingContacts).toBe(45);
    expect(m.resolvedToday).toBe(7);
    expect(estado.paginas).toEqual([
      { from: 0, to: SLA_PAGE_SIZE - 1 },
      { from: SLA_PAGE_SIZE, to: 2 * SLA_PAGE_SIZE - 1 },
    ]);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Sem dados'), {
      message: 'timeout na leitura de conversation_sla',
    });
  });
});

describe('computeQueueMetrics', () => {
  it('deriva o tempo médio de amostras de SLA reais', () => {
    const m = computeQueueMetrics(
      { totalContacts: 3, assignedContacts: 3, resolvedToday: 1 },
      [
        { first_message_at: '2024-01-10T08:00:00Z', first_response_at: '2024-01-10T08:02:00Z' }, // 120s
        { first_message_at: '2024-01-10T08:00:00Z', first_response_at: '2024-01-10T08:04:00Z' }, // 240s
        { first_message_at: '2024-01-10T08:00:00Z', first_response_at: null }, // sem amostra: fora da média
      ],
    );
    // (120 + 240) / 2 = 180s = 3 min — antes era a string fixa '~3 min'
    expect(m.avgResponseTime).toBe('3 min');
  });

  it('representa ausência de amostra como Sem dados', () => {
    const semAmostra = computeQueueMetrics(
      { totalContacts: 3, assignedContacts: 3, resolvedToday: 0 },
      [{ first_message_at: '2024-01-10T08:00:00Z', first_response_at: null }],
    );
    expect(semAmostra.avgResponseTime).toBe('Sem dados');
    expect(
      computeQueueMetrics({ totalContacts: 3, assignedContacts: 3, resolvedToday: 0 }, []).avgResponseTime,
    ).toBe('Sem dados');
  });

  it('mantém os totais vindos das contagens do servidor (Aguardando nunca fica negativo)', () => {
    const m = computeQueueMetrics({ totalContacts: 137, assignedContacts: 92, resolvedToday: 7 }, []);
    expect(m.totalContacts).toBe(137);
    expect(m.assignedContacts).toBe(92);
    expect(m.waitingContacts).toBe(45);
    expect(m.resolvedToday).toBe(7);

    const atribuidosMaiorQueTotal = computeQueueMetrics(
      { totalContacts: 2, assignedContacts: 5, resolvedToday: 0 },
      [],
    );
    expect(atribuidosMaiorQueTotal.waitingContacts).toBe(0);
  });
});
