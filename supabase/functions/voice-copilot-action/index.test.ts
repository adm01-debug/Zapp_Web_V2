import {
  searchEmailThreads,
  sanitizeEmailSearchTerm,
  type EmailSearchDb,
  type EmailSearchQueryBuilder,
} from './index.ts';

type Row = Record<string, unknown>;

interface FakeQueryCall {
  table: string;
  selects: string[];
  or: string[];
  eq: Array<{ column: string; value: unknown }>;
  ilike: Array<{ column: string; pattern: string }>;
  order: string;
  limit: number;
}

interface FakeOptions {
  contacts?: Row[];
  threads?: Row[];
  contactsError?: unknown;
  threadsError?: unknown;
}

/**
 * Fake do client autenticado. A lista `threads`/`contacts` entregue aqui
 * REPRESENTA o que a RLS deixa passar para o JWT do caller — é a camada de
 * visibilidade. O teste prova o contrato da ação: ela parte desse client,
 * nunca consulta email_messages/body_text e para quando o contato não é visível.
 */
function makeFakeDb(options: FakeOptions) {
  const calls: FakeQueryCall[] = [];

  function builder(table: string): EmailSearchQueryBuilder {
    const record: FakeQueryCall = { table, selects: [], or: [], eq: [], ilike: [], order: '', limit: 0 };
    const qb: EmailSearchQueryBuilder = {
      select(columns: string) {
        record.selects.push(columns);
        return qb;
      },
      or(filter: string) {
        record.or.push(filter);
        return qb;
      },
      eq(column: string, value: unknown) {
        record.eq.push({ column, value });
        return qb;
      },
      ilike(column: string, pattern: string) {
        record.ilike.push({ column, pattern });
        return qb;
      },
      order(column: string) {
        record.order = column;
        return qb;
      },
      limit(count: number) {
        record.limit = count;
        calls.push(record);
        const source = table === 'contacts' ? (options.contacts ?? []) : (options.threads ?? []);
        const error = table === 'contacts' ? (options.contactsError ?? null) : (options.threadsError ?? null);
        // Projeção: o PostgREST devolve SÓ as colunas pedidas no select. Emular
        // isso é o que prova que body_text (corpo cru do e-mail) nunca chega.
        const columns = (record.selects[record.selects.length - 1] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
        const data = error
          ? null
          : source.slice(0, count).map((row) => {
            const projected: Row = {};
            for (const column of columns) projected[column] = row[column];
            return projected;
          });
        return Promise.resolve({ data, error });
      },
    };
    return qb;
  }

  const db: EmailSearchDb = { from: (table: string) => builder(table) };
  return { db, calls };
}

const CONTACT_ID = '11111111-2222-4333-8444-555555555555';

Deno.test('search_emails: sem termo útil devolve [] sem tocar no banco', async () => {
  const { db, calls } = makeFakeDb({ threads: [{ id: 't1' }] });
  const empty = await searchEmailThreads(db, { query: '  %_ ' });
  if (empty.length !== 0) throw new Error('query só com curingas deveria devolver []');
  const blank = await searchEmailThreads(db, {});
  if (blank.length !== 0) throw new Error('sem termo deveria devolver []');
  if (calls.length !== 0) throw new Error(`não deveria consultar o banco, mas consultou: ${JSON.stringify(calls)}`);
});

Deno.test('search_emails: assunto devolve só as threads visíveis e os campos mínimos', async () => {
  const { db, calls } = makeFakeDb({
    threads: [
      {
        id: 't1',
        subject: 'Orçamento de brindes',
        snippet: 'segue o orçamento',
        is_unread: true,
        last_message_at: '2026-10-10T12:00:00Z',
        contact_id: CONTACT_ID,
        body_text: 'SEGREDO QUE NÃO PODE VAZAR',
      },
    ],
  });

  const result = await searchEmailThreads(db, { query: 'orcamento' });
  if (result.length !== 1) throw new Error(`esperava 1 thread, veio ${result.length}`);
  if ('body_text' in result[0]) throw new Error('não pode expor body_text');
  if (result[0].subject !== 'Orçamento de brindes') throw new Error('subject errado');

  const threadCall = calls.find((c) => c.table === 'email_threads');
  if (!threadCall) throw new Error('não consultou email_threads');
  if (!threadCall.selects.includes('id, subject, snippet, is_unread, last_message_at, contact_id')) {
    throw new Error(`colunas mínimas não conferem: ${threadCall.selects.join('|')}`);
  }
  const filter = threadCall.or.join(',');
  if (!filter.includes('subject.ilike."%orcamento%"') || !filter.includes('snippet.ilike."%orcamento%"')) {
    throw new Error(`filtro de assunto errado: ${filter}`);
  }
  if (threadCall.order !== 'last_message_at' || threadCall.limit !== 5) {
    throw new Error(`order/limit errados: ${threadCall.order}/${threadCall.limit}`);
  }
});

Deno.test('search_emails: contato fora da RLS não vaza nenhuma thread', async () => {
  // O client autenticado devolve zero contatos: a RLS escondeu o contato do
  // outro time. A ação deve parar sem consultar e-mail algum.
  const { db, calls } = makeFakeDb({ contacts: [], threads: [{ id: 't-alheia', subject: 'Alheia' }] });
  const result = await searchEmailThreads(db, { contactQuery: 'Fulano de Outro Time' });
  if (result.length !== 0) throw new Error('contato invisível não pode devolver thread');
  if (calls.some((c) => c.table === 'email_threads')) {
    throw new Error('não deveria consultar email_threads quando o contato não é visível');
  }
});

Deno.test('search_emails: busca por contato visível filtra contact_id e ordena por data', async () => {
  const { db, calls } = makeFakeDb({
    contacts: [{ id: CONTACT_ID }],
    threads: [{ id: 't1', subject: 'Proposta', snippet: '', is_unread: false, last_message_at: '2026-10-09T00:00:00Z', contact_id: CONTACT_ID }],
  });
  const result = await searchEmailThreads(db, { contactQuery: 'Maria' });
  if (result.length !== 1 || result[0].id !== 't1') throw new Error('thread do contato visível não retornou');
  const threadCall = calls.find((c) => c.table === 'email_threads');
  if (!threadCall) throw new Error('não consultou email_threads');
  // Composição: exatamente UM contato visível ("11111111-2222-4333-8444-555555555555")
  // filtra por .eq ligado (sem interpolar uuid cru no `.or`, que dava 400).
  const eqHit = threadCall.eq.find((e) => e.column === 'contact_id' && e.value === CONTACT_ID);
  if (!eqHit) throw new Error(`sem .eq contact_id="${CONTACT_ID}": ${JSON.stringify(threadCall.eq)}`);
  if (threadCall.or.join(',').includes('contact_id.in.(')) {
    throw new Error(`não pode usar contact_id.in.: ${threadCall.or.join(',')}`);
  }
  const contactCall = calls.find((c) => c.table === 'contacts');
  if (!contactCall || contactCall.or.join(',') !== 'name.ilike."%Maria%",email.ilike."%Maria%"') {
    throw new Error(`filtro do contato errado: ${contactCall && contactCall.or.join(',')}`);
  }
  // Composição com assunto: 1 contato + termo → .eq + .ilike('subject', ...).
  {
    const again = makeFakeDb({
      contacts: [{ id: CONTACT_ID }],
      threads: [{ id: 't2', subject: 'Fatura vencida', snippet: '', is_unread: false, last_message_at: '2026-10-09T00:00:00Z', contact_id: CONTACT_ID }],
    });
    const res2 = await searchEmailThreads(again.db, { contactQuery: 'Maria', subjectQuery: 'fatura' });
    if (res2.length !== 1) throw new Error('contato+assunto deveria retornar a thread');
    const tc2 = again.calls.find((c) => c.table === 'email_threads')!;
    if (!tc2.eq.some((e) => e.column === 'contact_id' && e.value === CONTACT_ID)) {
      throw new Error(`sem .eq no caminho contato+assunto: ${JSON.stringify(tc2.eq)}`);
    }
    if (!tc2.ilike.some((l) => l.column === 'subject' && l.pattern === '%fatura%')) {
      throw new Error(`sem .ilike subject no caminho contato+assunto: ${JSON.stringify(tc2.ilike)}`);
    }
  }
});

Deno.test('search_emails: contato informado sem match NUNCA consulta threads (mesmo com assunto)', async () => {
  // Refazer 3, pontos 1-2: contactTerm existe e nenhum contato visivel casou
  // (contato sem e-mail / fora da RLS) -> [] sem consultar threads, MESMO
  // com termo de assunto (sem fallback global por assunto, que vazava
  // e-mails de outros contatos). So consulta a tabela com contact_id
  // resolvido ou quando NENHUM contactTerm foi informado.
  const { db, calls } = makeFakeDb({ contacts: [], threads: [{ id: 't-alheia', subject: 'Fatura', snippet: '', is_unread: false, last_message_at: '2026-10-09T00:00:00Z', contact_id: null }] });
  const warns: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  try {
    const result = await searchEmailThreads(db, { contactQuery: 'Fulano', subjectQuery: 'fatura' });
    if (result.length !== 0) throw new Error('contato sem match nao pode devolver thread de outro contato');
    if (calls.some((c) => c.table === 'email_threads')) {
      throw new Error('nao deveria consultar email_threads quando o contato informado nao casou');
    }
    if (warns.length === 0) throw new Error('deveria registrar console.warn explicativo no contato sem match');
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test('search_emails: erro do PostgREST propaga (não engole falha)', async () => {
  const { db } = makeFakeDb({ threads: [], threadsError: { message: 'boom' } });
  let threw = false;
  try {
    await searchEmailThreads(db, { query: 'x' });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('erro do banco deveria propagar');
});

Deno.test('sanitizeEmailSearchTerm remove curingas e espaços', () => {
  if (sanitizeEmailSearchTerm(' a%b_c\\d ') !== 'abcd') {
    throw new Error(`sanitização errada: ${JSON.stringify(sanitizeEmailSearchTerm(' a%b_c\\d '))}`);
  }
  if (sanitizeEmailSearchTerm(undefined) !== '') throw new Error('undefined deveria virar string vazia');
  if (sanitizeEmailSearchTerm('reunião — amanhã') !== 'reunião - amanhã') {
    throw new Error(`em-dash deveria virar hífen: ${JSON.stringify(sanitizeEmailSearchTerm('reunião — amanhã'))}`);
  }
});

Deno.test('search_emails: múltiplos contatos devolvem [] com warn sem consultar threads', async () => {
  const { db, calls } = makeFakeDb({
    contacts: [{ id: CONTACT_ID }, { id: '22222222-3333-4444-8555-666666666666' }],
    threads: [{ id: 't1', subject: 'X', snippet: '', is_unread: false, last_message_at: '2026-10-09T00:00:00Z', contact_id: CONTACT_ID }],
  });
  const warns: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  try {
    const result = await searchEmailThreads(db, { contactQuery: 'Silva' });
    if (result.length !== 0) throw new Error('contato ambíguo deveria devolver []');
    if (calls.some((c) => c.table === 'email_threads')) {
      throw new Error('não deveria consultar email_threads quando há múltiplos contatos');
    }
    if (warns.length === 0) throw new Error('deveria registrar console.warn no contato ambíguo');
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test('search_emails: em-dash do iOS vira hífen e ainda acha o assunto', async () => {
  const { db, calls } = makeFakeDb({
    threads: [{ id: 't1', subject: 'reunião - amanhã', snippet: '', is_unread: false, last_message_at: '2026-10-09T00:00:00Z', contact_id: null }],
  });
  const result = await searchEmailThreads(db, { query: 'reunião — amanhã' });
  if (result.length !== 1) throw new Error('em-dash normalizado deveria achar o assunto com hífen');
  const filter = calls.find((c) => c.table === 'email_threads')!.or.join(',');
  if (!filter.includes('reunião - amanhã')) throw new Error(`filtro deveria conter hífen normalizado: ${filter}`);
  if (filter.includes('—')) throw new Error(`filtro não pode conter em-dash cru: ${filter}`);
});
