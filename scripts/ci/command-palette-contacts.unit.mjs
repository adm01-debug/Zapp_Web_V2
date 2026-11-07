import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { setImmediate as nextTurn } from 'node:timers/promises';

/**
 * Contratos dos helpers REAIS: somente Supabase, history/eventos e relógio
 * ficam controlados. Não é renderização React nem prova de Auth/RLS/PostgreSQL.
 */
const root = new URL('../../', import.meta.url);
function execute(context, path, names) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
  runInContext(js + '\nglobalThis.__tested = { ' + names.join(', ') + ' };', context, { filename: path });
  return context.__tested;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function clock() {
  let now = 0, sequence = 0;
  const jobs = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++sequence;
      jobs.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { jobs.delete(id); },
    size: () => jobs.size,
    advance(ms) {
      const target = now + ms;
      for (let i = 0; i < 100; i++) {
        const next = [...jobs.entries()].filter(([, job]) => job.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) { now = target; return; }
        now = next[1].at;
        jobs.delete(next[0]);
        next[1].callback();
      }
      assert.fail('timer não convergiu no modelo');
    },
  };
}
const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const primary = Object.freeze({
  id: FIRST, name: '[E2E] Contato', surname: 'de teste', nickname: 'Teste',
  phone: '5511999900011', email: 'contato@example.invalid', company: 'Empresa A',
});
const homonym = Object.freeze({ ...primary, id: SECOND, phone: '5511999900022', company: 'Empresa B' });
const product = Object.freeze({ id: 'catalog-7', title: 'Produto', category: 'search', href: '/?view=catalog&product=7&send=1' });
const ERROR_ID = 'contact-search-error';

function runtime({ view = 'inbox', rpc = async () => ({ data: [], error: null }), consumeAt = 1 } = {}) {
  const timer = clock();
  const calls = [], events = [], pushes = [];
  const browser = {
    location: new URL('https://app.example.invalid/?view=' + view),
    history: {
      state: null,
      pushState(state, _, href) { this.state = state; pushes.push(href); browser.location = new URL(href); },
      replaceState(state, _, href) { this.state = state; browser.location = new URL(href); },
    },
    dispatchEvent(event) {
      events.push(event);
      if (event.type === 'open-contact-chat') {
        const count = events.filter((entry) => entry.type === 'open-contact-chat').length;
        if (count === consumeAt) delete browser.__pendingOpenContactId;
      }
      return true;
    },
  };
  const context = createContext({
    URL, URLSearchParams,
    window: browser,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    supabase: {
      rpc(name, args) { calls.push({ name, args: plain(args) }); return rpc(name, args); },
      from() { throw new Error('não deve carregar lista nem gravar dados'); },
    },
  });
  execute(context, 'src/services/contact.service.ts', ['ContactService']);
  execute(context, 'src/lib/emailThreadQuery.ts', ['escapeLikeWildcards']);
  execute(context, 'src/hooks/system/useNavigationHistory.ts', ['navigateToView']);
  const navigation = execute(context, 'src/lib/openContactChat.ts', ['openContactChat']);
  const search = execute(context, 'src/lib/commandPaletteSearch.ts', ['searchContactCommands', 'searchCommandSources']);
  return { ...search, ...navigation, timer, calls, events, pushes, browser, context };
}
function assertBoundedCall(call, term) {
  assert.deepEqual(call, {
    name: 'search_contacts',
    args: { search_term: term, sort_field: 'name', sort_direction: 'asc', page_size: 8, page_offset: 0 },
  });
}
function contactEvents(run) { return run.events.filter((event) => event.type === 'open-contact-chat'); }

const states = [
  { name: 'contato e produto', contacts: [primary], products: [product] },
  { name: 'homônimos e produto', contacts: [primary, homonym], products: [product] },
  { name: 'contatos vazios', contacts: [], products: [product] },
  { name: 'contatos nulos', contacts: null, products: [product] },
  { name: 'erro RPC e produto', contacts: null, error: { message: 'PRIVATE-RPC' }, products: [product] },
  { name: 'rejeição RPC e produto', rejectContact: true, products: [product] },
  { name: 'contato e rejeição catálogo', contacts: [primary], rejectCatalog: true },
  { name: 'ambas fontes falham', rejectContact: true, rejectCatalog: true },
];
for (const state of states) for (const order of ['contact-first', 'catalog-first', 'together']) for (const view of ['inbox', 'dashboard']) {
  test('composição real: ' + state.name + ' / ' + order + ' / ' + view, async () => {
    const contacts = deferred(), catalog = deferred();
    const run = runtime({ view, rpc: () => contacts.promise });
    const queries = [];
    let settled = false;
    const result = run.searchCommandSources('  [E2E]  ', [
      { kind: 'catalog', search: (query) => { queries.push(query); return catalog.promise; } },
      { kind: 'contacts', search: run.searchContactCommands },
    ]).then((value) => { settled = true; return value; });
    await nextTurn();
    assert.equal(run.calls.length, 1);
    assertBoundedCall(run.calls[0], '[E2E]');
    assert.deepEqual(queries, ['  [E2E]  '], 'catálogo conserva seu termo original');
    const settleContact = () => state.rejectContact
      ? contacts.reject(new Error('PRIVATE-CONTACT'))
      : contacts.resolve({ data: state.contacts, error: state.error ?? null });
    const settleCatalog = () => state.rejectCatalog
      ? catalog.reject(new Error('PRIVATE-CATALOG'))
      : catalog.resolve(state.products);
    if (order === 'contact-first') {
      settleContact(); await nextTurn(); assert.equal(settled, false); settleCatalog();
    } else if (order === 'catalog-first') {
      settleCatalog(); await nextTurn(); assert.equal(settled, false); settleContact();
    } else { settleContact(); settleCatalog(); }
    const commands = await result;
    const badContact = Boolean(state.error || state.rejectContact);
    const rows = badContact ? [] : state.contacts ?? [];
    const expected = [
      ...(state.rejectCatalog ? [] : ['catalog-7']),
      ...(badContact ? [ERROR_ID] : rows.map((row) => 'contact-' + row.id)),
    ];
    assert.deepEqual(Array.from(commands, (item) => item.id), expected);
    assert.doesNotMatch(JSON.stringify(commands), /PRIVATE-/);
    if (badContact) {
      const failure = commands.find((item) => item.id === ERROR_ID);
      assert.equal(failure.disabled, true);
      assert.equal(failure.action, undefined);
    }
    if (rows.length) {
      const row = rows.at(-1);
      const chosen = commands.find((item) => item.id === 'contact-' + row.id);
      assert.equal(chosen.title, '[E2E] Contato de teste');
      assert.equal(chosen.description, row.phone + ' · ' + row.company);
      assert.equal(chosen.badge, 'Contato');
      assert.equal(chosen.href, undefined, 'contato não inventa rota');
      chosen.action();
      assert.equal(run.browser.__pendingOpenContactId, row.id);
      assert.equal(run.browser.location.searchParams.get('view'), 'inbox');
      assert.equal(run.browser.location.searchParams.has('contact'), false);
      assert.equal(run.pushes.length, view === 'inbox' ? 0 : 1);
      run.timer.advance(149);
      assert.equal(contactEvents(run).length, 0);
      run.timer.advance(1);
      assert.equal(contactEvents(run).length, 1);
      assert.equal(contactEvents(run)[0].detail.contactId, row.id);
      assert.equal(run.browser.__pendingOpenContactId, undefined);
    } else {
      assert.equal(run.events.length, 0);
      assert.equal(run.pushes.length, 0);
    }
    assert.equal(run.timer.size(), 0);
  });
}

for (const query of ['', ' ', 'a', ' a ', '\t\n']) {
  test('termo curto não consulta nenhuma fonte: ' + JSON.stringify(query), async () => {
    const run = runtime();
    let otherCalls = 0;
    assert.equal((await run.searchContactCommands(query)).length, 0);
    assert.equal((await run.searchCommandSources(query, [{ kind: 'catalog', search: () => { otherCalls++; return Promise.resolve([]); } }])).length, 0);
    assert.equal(run.calls.length, 0);
    assert.equal(otherCalls, 0);
    assert.equal(run.timer.size(), 0);
  });
}

for (const [query, expected] of [
  ['  Ana  ', 'Ana'], ['[E2E]', '[E2E]'], ['%_', '\\%\\_'],
  ['a\\b', 'a\\\\b'], [' a%_\\b ', 'a\\%\\_\\\\b'],
  ['José', 'José'], ['张三', '张三'], ['a,b', 'a,b'], ['a(b)', 'a(b)'],
  ['"ab"', '"ab"'], ['\\%', '\\\\\\%'], ['__', '\\_\\_'],
]) {
  test('ILIKE literal e parâmetros limitados: ' + JSON.stringify(query), async () => {
    const run = runtime();
    await run.searchContactCommands(query);
    assert.equal(run.calls.length, 1);
    assertBoundedCall(run.calls[0], expected);
  });
}

for (const [name, data] of [
  ['objeto no lugar de lista', {}],
  ['undefined no lugar de lista', undefined],
  ['linha nula', [null]],
  ['UUID inválido', [{ ...primary, id: 'not-a-uuid' }]],
  ['UUID vazio', [{ ...primary, id: '' }]],
]) {
  test('resposta inválida é erro visível e sem ação: ' + name, async () => {
    const run = runtime({ rpc: async () => ({ data, error: null }) });
    const result = await run.searchContactCommands('Contato');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, ERROR_ID);
    assert.equal(result[0].disabled, true);
    assert.equal(result[0].action, undefined);
    assert.equal(run.timer.size(), 0);
  });
}

for (const [name, fields, title, description] of [
  ['nome e sobrenome', { name: 'Ana', surname: 'Silva', phone: '5511999900000', company: 'Acme' }, 'Ana Silva', '5511999900000 · Acme'],
  ['apelido', { name: '', surname: '', nickname: ' Ana ', phone: '' }, 'Ana', ''],
  ['telefone', { name: '', surname: '', nickname: '', phone: '5511999900000' }, '5511999900000', '5511999900000'],
  ['sem nome', { name: '', surname: '', nickname: '', phone: '', email: '' }, 'Contato sem nome', ''],
  ['email na descrição', { name: 'Ana', phone: '', email: 'ana@example.invalid', company: 'Acme' }, 'Ana', 'ana@example.invalid · Acme'],
]) {
  test('identificação do contato: ' + name, async () => {
    const run = runtime({ rpc: async () => ({ data: [{ id: FIRST, ...fields }], error: null }) });
    const [item] = await run.searchContactCommands('Contato');
    assert.equal(item.title, title);
    assert.equal(item.description, description);
    assert.equal(item.id, 'contact-' + FIRST);
  });
}

test('limite de oito comandos também vale para resposta excessiva', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ ...primary, id: '11111111-1111-4111-8111-' + String(index).padStart(12, '0') }));
  const snapshot = JSON.stringify(rows);
  const run = runtime({ rpc: async () => ({ data: rows, error: null }) });
  const items = await run.searchContactCommands('Contato');
  assert.equal(items.length, 8);
  assert.deepEqual(Array.from(items, (item) => item.id), rows.slice(0, 8).map((row) => 'contact-' + row.id));
  assert.equal(JSON.stringify(rows), snapshot);
});

test('throw síncrono de uma fonte mantém a outra e não vaza erro', async () => {
  const run = runtime({ rpc: async () => ({ data: [primary], error: null }) });
  const items = await run.searchCommandSources('Contato', [
    { kind: 'catalog', search: () => { throw new Error('PRIVATE-SOURCE'); } },
    { kind: 'contacts', search: run.searchContactCommands },
  ]);
  assert.deepEqual(Array.from(items, (item) => item.id), ['contact-' + FIRST]);
  assert.doesNotMatch(JSON.stringify(items), /PRIVATE-/);
});

test('consultas concorrentes conservam identidades sem cache compartilhado', async () => {
  const first = deferred(), second = deferred();
  const run = runtime({ rpc: (_, args) => args.search_term === 'antiga' ? first.promise : second.promise });
  const oldQuery = run.searchContactCommands('antiga');
  const newQuery = run.searchContactCommands('nova');
  second.resolve({ data: [homonym], error: null });
  assert.equal((await newQuery)[0].id, 'contact-' + SECOND);
  first.resolve({ data: [primary], error: null });
  assert.equal((await oldQuery)[0].id, 'contact-' + FIRST);
  // O descarte visual da antiga pertence ao searchSeqRef da paleta e à suíte React.
});

for (const view of ['inbox', 'dashboard']) for (const consumeAt of [1, 3, 15, 0]) {
  test('navegação extraída conserva entrega/teto: ' + view + ' / ' + consumeAt, () => {
    const run = runtime({ view, consumeAt });
    run.openContactChat(FIRST);
    run.timer.advance(5_000);
    assert.equal(contactEvents(run).length, consumeAt || 15);
    assert.equal(run.pushes.length, view === 'dashboard' ? 1 : 0);
    assert.equal(run.timer.size(), 0);
    assert.equal(run.browser.__pendingOpenContactId, consumeAt ? undefined : FIRST);
  });
}

for (const advanceBeforeReplacement of [0, 100, 150, 350]) {
  test('seleção nova cancela a cadeia anterior: ' + advanceBeforeReplacement, () => {
    const run = runtime({ view: 'dashboard', consumeAt: 0 });
    run.openContactChat(FIRST);
    run.timer.advance(advanceBeforeReplacement);
    const countBefore = contactEvents(run).length;
    run.openContactChat(SECOND);
    run.timer.advance(149);
    assert.equal(contactEvents(run).length, countBefore);
    run.timer.advance(5_000);
    assert.equal(run.browser.__pendingOpenContactId, SECOND);
    assert.equal(contactEvents(run).slice(countBefore).length, 15);
    assert.ok(contactEvents(run).slice(countBefore).every((event) => event.detail.contactId === SECOND));
    assert.equal(run.pushes.length, 1);
    assert.equal(run.timer.size(), 0);
  });
}

for (const before of [true, false]) {
  test('window ausente ' + (before ? 'antes da seleção' : 'antes do timer') + ' encerra sem erro', () => {
    const run = runtime();
    if (before) delete run.context.window;
    run.openContactChat(FIRST);
    if (!before) delete run.context.window;
    assert.doesNotThrow(() => run.timer.advance(5_000));
    assert.equal(contactEvents(run).length, 0);
    assert.equal(run.timer.size(), 0);
  });
}



for (const pending of ['catalog', 'contacts', 'both']) {
  const availableOutcomes = pending === 'both' ? ['none'] : ['success', 'failure'];
  for (const available of availableOutcomes) for (const late of ['resolve', 'reject', 'never']) for (const elapsed of [0, 300, 12_000]) {
    test('orçamento por fonte: ' + pending + ' / ' + available + ' / ' + late + ' / início ' + elapsed, async () => {
      const contacts = deferred(), catalog = deferred();
      const run = runtime({ rpc: () => contacts.promise });
      run.timer.advance(elapsed);
      assert.equal(run.timer.size(), 0, 'não há timer antes da invocação da busca');
      let settlements = 0, catalogCalls = 0;
      const request = run.searchCommandSources('Contato', [
        { kind: 'catalog', search: () => { catalogCalls++; return catalog.promise; } },
        { kind: 'contacts', search: run.searchContactCommands },
      ]).then((value) => { settlements++; return value; });
      await nextTurn();
      assert.equal(run.timer.size(), 2);
      if (pending === 'catalog') {
        if (available === 'success') contacts.resolve({ data: [primary], error: null });
        else contacts.reject(new Error('PRIVATE-CONTACT'));
      } else if (pending === 'contacts') {
        if (available === 'success') catalog.resolve([product]);
        else catalog.reject(new Error('PRIVATE-CATALOG'));
      }
      await nextTurn();
      assert.equal(run.timer.size(), pending === 'both' ? 2 : 1);
      run.timer.advance(4_999);
      await nextTurn();
      assert.equal(settlements, 0, 'não fecha antes dos 5 segundos da invocação');
      run.timer.advance(1);
      const result = await request;
      const expected = [
        ...(pending === 'contacts' && available === 'success' ? ['catalog-7'] : []),
        pending === 'catalog' && available === 'success' ? 'contact-' + FIRST : ERROR_ID,
      ];
      assert.deepEqual(Array.from(result, (item) => item.id), expected);
      if (expected.includes(ERROR_ID)) {
        const failure = result.find((item) => item.id === ERROR_ID);
        assert.equal(failure.disabled, true);
        assert.equal(failure.action, undefined);
      }
      assert.equal(run.timer.size(), 0, 'success, erro e timeout limpam todos os timers');
      const snapshot = JSON.stringify(result);
      if (late === 'resolve') {
        if (pending !== 'catalog') contacts.resolve({ data: [homonym], error: null });
        if (pending !== 'contacts') catalog.resolve([{ ...product, id: 'catalog-tardio' }]);
      } else if (late === 'reject') {
        if (pending !== 'catalog') contacts.reject(new Error('PRIVATE-LATE-CONTACT'));
        if (pending !== 'contacts') catalog.reject(new Error('PRIVATE-LATE-CATALOG'));
      }
      await nextTurn();
      run.timer.advance(10_000);
      await nextTurn();
      assert.equal(JSON.stringify(result), snapshot, 'resposta tardia não substitui o resultado fechado');
      assert.doesNotMatch(snapshot, /PRIVATE-/);
      assert.equal(settlements, 1);
      assert.equal(run.calls.length, 1, 'sem retry de contatos');
      assert.equal(catalogCalls, 1, 'sem retry de catálogo');
      assert.equal(run.timer.size(), 0);
    });
  }
}

for (const kind of ['catalog', 'contacts']) for (const arrivesAt of [4_999, 5_001]) {
  test('fronteira do orçamento: ' + kind + ' termina em ' + arrivesAt, async () => {
    const delayed = deferred();
    const run = runtime({ rpc: () => kind === 'contacts' ? delayed.promise : Promise.resolve({ data: [primary], error: null }) });
    const request = run.searchCommandSources('Contato', [
      { kind: 'catalog', search: () => kind === 'catalog' ? delayed.promise : Promise.resolve([product]) },
      { kind: 'contacts', search: run.searchContactCommands },
    ]);
    await nextTurn();
    assert.equal(run.timer.size(), 1);
    run.timer.advance(Math.min(arrivesAt, 5_000));
    if (arrivesAt < 5_000) delayed.resolve(kind === 'catalog' ? [product] : { data: [primary], error: null });
    const result = await request;
    const expected = arrivesAt < 5_000 ? ['catalog-7', 'contact-' + FIRST]
      : kind === 'catalog' ? ['contact-' + FIRST] : ['catalog-7', ERROR_ID];
    assert.deepEqual(Array.from(result, (item) => item.id), expected);
    if (arrivesAt > 5_000) {
      run.timer.advance(1);
      delayed.resolve(kind === 'catalog' ? [product] : { data: [primary], error: null });
      await nextTurn();
      assert.deepEqual(Array.from(result, (item) => item.id), expected);
    }
    assert.equal(run.timer.size(), 0);
  });
}

test('busca seguinte pode recuperar contatos depois de timeout sem aceitar a resposta velha', async () => {
  const old = deferred();
  const run = runtime({ rpc: (_, args) => args.search_term === 'antiga' ? old.promise : Promise.resolve({ data: [homonym], error: null }) });
  const sources = [
    { kind: 'catalog', search: async () => [] },
    { kind: 'contacts', search: run.searchContactCommands },
  ];
  const request = run.searchCommandSources('antiga', sources);
  await nextTurn();
  run.timer.advance(5_000);
  const oldResult = await request;
  assert.equal(oldResult[0].id, ERROR_ID);
  const currentResult = await run.searchCommandSources('atual', sources);
  assert.equal(currentResult[0].id, 'contact-' + SECOND);
  old.resolve({ data: [primary], error: null });
  await nextTurn();
  assert.equal(oldResult[0].id, ERROR_ID);
  assert.equal(currentResult[0].id, 'contact-' + SECOND);
  assert.equal(run.timer.size(), 0);
});

