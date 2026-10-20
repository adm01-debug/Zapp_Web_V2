/**
 * Servidor falso de `audit_logs` (e `profiles`) para os testes do painel de Auditoria (HZ1-08).
 *
 * Reproduz o que o PostgREST faz de verdade:
 * - `select(colunas, { count: 'exact', head: true })` devolve SÓ o número — e o número é
 *   calculado aplicando os filtros recebidos (eq/in/like/or/gte/lte) ao conjunto do arquivo
 *   falso. É isso que prova que o total vem do servidor, e não da página de 200 linhas que a
 *   tela carrega;
 * - sem `range`, uma leitura devolve no máximo `cap` linhas (o teto de 1000 por resposta do
 *   projeto — achados A6/A11);
 * - `range(from, to)` devolve a fatia pedida, como o `fetchAllRows` usa.
 *
 * `queries` registra cada leitura (tabela, colunas, filtros, ordem, faixa, se era contagem): o
 * teste afirma O QUE foi pedido ao servidor, não só o que voltou.
 */

/** Teto de linhas por resposta do PostgREST no projeto. */
export const POSTGREST_PAGE = 1000;

export interface FakeAuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface FakeProfileRow {
  id: string;
  name: string;
}

/** Linha completa a partir do que importa para o cenário. */
export function fakeAuditLog(over: Partial<FakeAuditLogRow> & { id: string }): FakeAuditLogRow {
  return {
    action: 'login',
    entity_type: 'user',
    entity_id: null,
    user_id: 'u1',
    details: null,
    ip_address: null,
    user_agent: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Uma leitura que chegou ao servidor, como o teste a vê. */
export interface RecordedAuditQuery {
  table: string;
  colunas: string;
  /** `true` quando a leitura pediu `{ count: 'exact', head: true }`. */
  contagem: boolean;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  like: Array<[string, string]>;
  gte: Array<[string, unknown]>;
  lte: Array<[string, unknown]>;
  /** `.not(coluna, operador, valor)` — usado para `user_id is not null`. */
  not: Array<[string, string, unknown]>;
  /** Uma entrada por chamada de `.or(...)`, com a string crua do filtro. */
  or: string[];
  order: string[];
  limit: number | null;
  range: [number, number] | null;
}

export interface AuditLogsServer {
  /** O `supabase.from` a ser injetado no mock do cliente. */
  from: (table: string) => unknown;
  /** Todas as leituras feitas, na ordem. */
  queries: RecordedAuditQuery[];
}

export interface AuditLogsServerOpts {
  /** Linhas de `profiles` (o painel busca o nome do autor). */
  profiles?: FakeProfileRow[];
  /** Teto de linhas por resposta (default: `POSTGREST_PAGE`). */
  cap?: number;
  /** Quando presente, TODA leitura falha com este erro. */
  error?: { message: string } | null;
  /** Chamado quando uma leitura é resolvida (já com os filtros aplicados). */
  registrar?: (query: RecordedAuditQuery) => void;
}

/** Canal Realtime falso: guarda os assinantes e deixa o teste emitir um INSERT. */
export interface FakeRealtime {
  /** O `supabase.channel` a ser injetado no mock do cliente. */
  channel: (nome: string) => unknown;
  /** O `supabase.removeChannel` a ser injetado. */
  removeChannel: (canal: unknown) => Promise<'ok'>;
  /** Nomes dos canais vivos (some quando o hook faz o cleanup). */
  canais: string[];
  /** Dispara um INSERT em todos os canais vivos. */
  emitirInsert: (linha: FakeAuditLogRow) => void;
  /** Quantos assinantes de `postgres_changes` estão vivos. */
  assinantes: () => number;
}

export function createAuditLogsRealtime(): FakeRealtime {
  interface Canal {
    nome: string;
    ativo: boolean;
    inscritos: Array<(linha: FakeAuditLogRow) => void>;
  }
  const vivos: Canal[] = [];

  const channel = (nome: string): unknown => {
    const canal: Canal = { nome, ativo: true, inscritos: [] };
    vivos.push(canal);
    const builder = {
      nome,
      on: (evento: string, _filtro: unknown, cb: (payload: { new: FakeAuditLogRow }) => void) => {
        if (evento === 'postgres_changes') canal.inscritos.push((linha) => cb({ new: linha }));
        return builder;
      },
      subscribe: () => builder,
    };
    return builder;
  };

  return {
    channel,
    removeChannel: (canal: unknown) => {
      const alvo = canal as { nome?: string } | null;
      const indice = vivos.findIndex((c) => c.nome === alvo?.nome);
      if (indice >= 0) {
        vivos[indice].ativo = false;
        vivos.splice(indice, 1);
      }
      return Promise.resolve('ok' as const);
    },
    emitirInsert: (linha) => {
      vivos.forEach((canal) => canal.inscritos.forEach((cb) => cb(linha)));
    },
    // O array devolvido é vivo: `canais` reflete o estado atual.
    get canais() {
      return vivos.map((canal) => canal.nome);
    },
    assinantes: () => vivos.reduce((total, canal) => total + canal.inscritos.length, 0),
  };
}


/** `like`/`ilike` do PostgREST: `%` e `*` são curinga; o resto é literal. */
const comoRegex = (padrao: string): RegExp =>
  new RegExp(
    '^' +
      padrao
        .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : '\\' + m))
        .replace(/%/g, '.*') +
      '$',
  );

export function createAuditLogsServer(
  logs: FakeAuditLogRow[],
  opts: AuditLogsServerOpts = {},
): AuditLogsServer {
  const cap = opts.cap ?? POSTGREST_PAGE;
  const profiles = opts.profiles ?? [];
  const queries: RecordedAuditQuery[] = [];

  const linhasDe = (table: string): Array<Record<string, unknown>> =>
    (table === 'profiles' ? profiles : logs) as unknown as Array<Record<string, unknown>>;

  const from = (table: string): unknown => {
    const rec: RecordedAuditQuery = {
      table,
      colunas: '',
      contagem: false,
      eq: [],
      in: [],
      like: [],
      gte: [],
      lte: [],
      not: [],
      or: [],
      order: [],
      limit: null,
      range: null,
    };
    queries.push(rec);

    const valor = (row: Record<string, unknown>, coluna: string): string =>
      String(row[coluna] ?? '');

    const filtrar = (): Array<Record<string, unknown>> => {
      let out = linhasDe(table);
      out = out.filter((r) => rec.eq.every(([c, v]) => r[c] === v));
      out = out.filter((r) => rec.in.every(([c, vs]) => vs.includes(r[c])));
      out = out.filter((r) => rec.like.every(([c, p]) => comoRegex(p).test(valor(r, c))));
      out = out.filter((r) => rec.gte.every(([c, v]) => valor(r, c) >= String(v)));
      out = out.filter((r) => rec.lte.every(([c, v]) => valor(r, c) <= String(v)));
      // `.not(coluna, 'is', null)` do PostgREST.
      out = out.filter((r) => rec.not.every(([c, operador, v]) => (operador === 'is' ? r[c] !== v : true)));
      // `.or('a.like.x,a.like.y')`: OR entre os termos.
      out = out.filter((r) =>
        rec.or.every((termos) =>
          termos.split(',').some((termo) => {
            const [coluna, op, padrao] = termo.split('.');
            return op === 'like' && comoRegex(padrao ?? '').test(valor(r, coluna));
          }),
        ),
      );

      const ordem = [...rec.order];
      return [...out].sort((a, b) => {
        for (const o of ordem) {
          const [coluna, direcao] = o.split(':');
          const cmp = valor(a, coluna) < valor(b, coluna) ? -1 : valor(a, coluna) > valor(b, coluna) ? 1 : 0;
          if (cmp !== 0) return direcao === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    };

    const resposta = (): { data: unknown; count: number | null; error: { message: string } | null } => {
      opts.registrar?.(rec);
      if (opts.error) return { data: null, count: null, error: opts.error };
      const filtradas = filtrar();
      if (rec.contagem) return { data: null, count: filtradas.length, error: null };
      const inicio = rec.range ? rec.range[0] : 0;
      const fim = rec.range
        ? rec.range[1]
        : rec.limit !== null
          ? inicio + rec.limit - 1
          : cap - 1;
      return { data: filtradas.slice(inicio, Math.min(fim + 1, inicio + cap)), count: filtradas.length, error: null };
    };

    const builder = {
      select: (colunas: string, o?: { count?: string; head?: boolean }) => {
        rec.colunas = colunas;
        if (o?.count) rec.contagem = true;
        if (o?.head && !o.count) rec.contagem = true;
        return builder;
      },
      eq: (coluna: string, v: unknown) => {
        rec.eq.push([coluna, v]);
        return builder;
      },
      in: (coluna: string, vs: unknown[]) => {
        rec.in.push([coluna, vs]);
        return builder;
      },
      like: (coluna: string, p: string) => {
        rec.like.push([coluna, p]);
        return builder;
      },
      or: (filtro: string) => {
        rec.or.push(filtro);
        return builder;
      },
      gte: (coluna: string, v: unknown) => {
        rec.gte.push([coluna, v]);
        return builder;
      },
      lte: (coluna: string, v: unknown) => {
        rec.lte.push([coluna, v]);
        return builder;
      },
      not: (coluna: string, operador: string, v: unknown) => {
        rec.not.push([coluna, operador, v]);
        return builder;
      },
      order: (coluna: string, o?: { ascending?: boolean }) => {
        rec.order.push(`${coluna}:${o?.ascending === false ? 'desc' : 'asc'}`);
        return builder;
      },
      limit: (n: number) => {
        rec.limit = n;
        return builder;
      },
      range: (inicio: number, fim: number) => {
        rec.range = [inicio, fim];
        return builder;
      },
      then: (
        onFulfilled?: ((v: unknown) => unknown) | null,
        onRejected?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve(resposta()).then(onFulfilled, onRejected),
    };

    return builder;
  };

  return { from, queries };
}
