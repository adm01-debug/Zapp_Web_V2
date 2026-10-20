/* Read-only probes of production callbacks. No app boot, DB, network or secrets.
 * TypeScript transpiles copied source in memory. React lifecycle is a minimal
 * deterministic hook driver, explicitly not a browser or React integration test.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const sourceRoot = '/workspace/scratch/f8f9b9cbce53/reaudit/source';
const sourceLog = new Map();
const rows = [];

function source(p, a, b) {
  const raw = fs.readFileSync(path.join(sourceRoot, p));
  const sha = crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
  const txt = raw.toString('utf8');
  sourceLog.set(p, { path: p, blob_sha: sha });
  return a ? txt.split('\n').slice(a - 1, b).join('\n') : txt;
}
function load(text, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, URLSearchParams,
    Set, Map, Date, Intl, Error, Promise, crypto: crypto.webcrypto,
    setTimeout, clearTimeout, ...globals,
    require(p) { if (!(p in mocks)) throw new Error(`Unmocked import: ${p}`); return mocks[p]; },
  });
  vm.runInContext(compiled, context);
  return module.exports;
}
function hookDriver(fn) {
  const values = [], effects = [], refs = [];
  let cursor = 0, dirty = false, pendingEffects = [], output;
  const react = {
    useState(initial) {
      const at = cursor++;
      if (!(at in values)) values[at] = typeof initial === 'function' ? initial() : initial;
      return [values[at], next => { const v = typeof next === 'function' ? next(values[at]) : next;
        if (!Object.is(values[at], v)) { values[at] = v; dirty = true; } }];
    },
    useRef(initial) { const at = cursor++; return refs[at] ??= { current: initial }; },
    useMemo(factory) { cursor++; return factory(); },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const at = cursor++; const previous = effects[at];
      if (!previous || !deps || deps.some((v, i) => !Object.is(v, previous.deps?.[i]))) {
        pendingEffects.push(() => { previous?.cleanup?.(); effects[at] = { deps, cleanup: effect() }; });
      }
    },
  };
  return { react, render(...args) {
    let loops = 0;
    do { dirty = false; cursor = 0; pendingEffects = []; output = fn(...args);
      pendingEffects.forEach(run => run()); assert(++loops < 20, 'hook loop');
    } while (dirty);
    return output;
  } };
}

(async () => {
  // R2-MOD-007: execute the exact sendSingleProduct function.
  const sendEvents = [], sentAttempts = [];
  const sendFn = load(source('src/components/catalog/CatalogBulkSendDialog.tsx', 41, 79) + '\nexports.send = sendSingleProduct;', {}, {
    buildMessage: () => 'Mensagem sintética',
    sendOutboundMessage: async v => { sentAttempts.push(v); throw new Error('Controlled failure'); },
    logCatalogSendEvent: async event => { sendEvents.push(event); },
  }).send;
  const status = await sendFn({ id: 'synthetic-contact' }, { id: 'synthetic-product', name: 'Synthetic', sku: 'S', primary_image_url: null }, null);
  assert.equal(status, 'partial'); assert.equal(sendEvents[0].messageIds.length, 0);
  rows.push({ id: 'R2-MOD-007', probe: 'actual sendSingleProduct callback', result: { status, attempts: sentAttempts.length, persisted_message_ids: sendEvents[0].messageIds.length }, note: 'No image + the only text attempt rejected still returns partial; production loop counts partial as success.' });

  // R2-MOD-013: preserve the actual component state and saving callback.
  const noteWrites = [];
  let noteComponent;
  const noteDriver = hookDriver((...args) => noteComponent(...args));
  noteComponent = load(source('src/components/calls/SelectedCallPanel.tsx', 34, 62) + '\nreturn { valor, setRascunho, salvar };\n}\nexports.component = SelectedCallPanel;', {}, {
    ...noteDriver.react, useCalls: () => ({ addCallNotes: async (...args) => { noteWrites.push(args); return true; } }),
    useUserRole: () => ({ hasRole: () => true }), useAuth: () => ({ profile: { id: 'synthetic-agent' } }),
    useQueryClient: () => ({ invalidateQueries: async () => {} }), PAPEIS_QUE_ANOTAM: ['admin', 'supervisor'],
  }).component;
  let n = noteDriver.render({ call: { id: 'call-A', agent_notes: 'Original A' }, onClose() {} });
  n.setRascunho('Draft for A');
  n = noteDriver.render({ call: { id: 'call-B', agent_notes: 'Original B' }, onClose() {} });
  await n.salvar();
  assert.equal(noteWrites[0][0], 'call-B'); assert.equal(noteWrites[0][1], 'Draft for A');
  rows.push({ id: 'R2-MOD-013', probe: 'actual SelectedCallPanel state and salvar callback under deterministic hook driver', result: { written_call: noteWrites[0][0], written_notes: noteWrites[0][1] } });

  // R2-MOD-014: actual URL filter hook, selecting a call on page 3.
  let params = new URLSearchParams('page=3&channel=voip'); let filterHook;
  const filterDriver = hookDriver(() => filterHook());
  filterHook = load(source('src/hooks/calls/useTelefoniaFilters.ts'), {
    react: filterDriver.react,
    'react-router-dom': { useSearchParams: () => [params, next => { params = typeof next === 'function' ? next(params) : next; }] },
  }).useTelefoniaFilters;
  filterDriver.render().setFilter('call', 'call-on-page-3');
  const selectedFilters = filterDriver.render().filtros;
  assert.equal(selectedFilters.page, 1); assert.equal(selectedFilters.call, 'call-on-page-3');
  rows.push({ id: 'R2-MOD-014', probe: 'actual useTelefoniaFilters callback', result: { page_after_selection: selectedFilters.page, call: selectedFilters.call } });

  // R2-MOD-012: a controlled unresolved request, then a chosen-period change.
  let completeAi, universityHook;
  const aiToasts = [];
  const aiDriver = hookDriver((...args) => universityHook(...args));
  universityHook = load(source('src/hooks/ui/useUniversityHelp.ts'), {
    react: aiDriver.react,
    '@/integrations/supabase/client': { supabase: { functions: { invoke: () => new Promise(resolve => { completeAi = resolve; }) } } },
    sonner: { toast: new Proxy({}, { get: (_, level) => value => aiToasts.push({ level, value }) }) },
    '@/components/inbox/ai-tools/ToneSelector': { getTonePrompt: () => 'Friendly synthetic tone' },
    '@/components/inbox/ai-tools/PeriodFilterSelector': { usePeriodFilter(messages, initial) {
      const [analysisPeriod, setAnalysisPeriod] = aiDriver.react.useState(initial);
      return { analysisPeriod, setAnalysisPeriod, customDateFrom: null, customDateTo: null, filteredMessages: messages };
    } },
  }).useUniversityHelp;
  const syntheticMessages = [{ id: 'm1', sender: 'contact', content: 'Synthetic old-period question', timestamp: '2026-10-03T12:00:00Z' }];
  const renderAi = () => aiDriver.render('contact-A', 'Synthetic Contact', syntheticMessages);
  let u = renderAi(); u.toggleMessage('m1'); u = renderAi(); const pendingAi = u.generateResponse();
  u = renderAi(); u.periodFilter.setAnalysisPeriod('today'); u = renderAi();
  assert.equal(u.response, null); assert.equal(u.selectedIds.size, 0);
  completeAi({ data: { content: 'Answer for previous period' }, error: null }); await pendingAi;
  u = renderAi(); assert.equal(u.periodFilter.analysisPeriod, 'today'); assert.equal(u.response, 'Answer for previous period');
  rows.push({ id: 'R2-MOD-012', probe: 'actual useUniversityHelp with deterministic hooks and deferred ai-proxy mock', result: { period: u.periodFilter.analysisPeriod, selected_messages: u.selectedIds.size, applied_response: u.response, toast_count: aiToasts.length }, limitation: 'No browser/React renderer. Does not assert cross-contact leakage; current ChatPanel is keyed by conversation.' });

  // R2-MOD-017: exact app day helpers with fixed time; exact hook formulas.
  const realDate = Date; const now = new Date('2026-10-04T15:00:00.000Z');
  class FrozenDate extends realDate { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } static now() { return now.getTime(); } }
  const local = load(source('src/lib/localDay.ts'), {}, { Date: FrozenDate });
  let reportsHook; const reportDriver = hookDriver(() => reportsHook()); const configurations = new Map();
  const samples = [];
  for (let i = 0; i < 8; i++) for (let n = 0; n < 70; n++) samples.push({ id: `${i}-${n}`, created_at: local.appDayStart(i).toISOString(), sender: 'agent' });
  const fakeQuery = { gte() { return this; }, lte() { return this; }, eq() { return this; }, then(resolve) { resolve({ data: [], error: null }); } };
  reportsHook = load(source('src/components/reports/useReportsData.ts'), {
    react: reportDriver.react,
    '@tanstack/react-query': { useQuery(config) { configurations.set(config.queryKey[0], config); return { data: config.queryKey[0] === 'reports-messages' ? samples : [], isLoading: false }; } },
    '@/integrations/supabase/client': { supabase: { from: () => ({ select: () => fakeQuery }) } },
    '@/hooks/crm/useAgents': { useAgents: () => ({ agents: [] }) }, 'date-fns': { format: () => 'synthetic-date', parseISO: value => new FrozenDate(value) },
    '@/lib/localDay': local, 'date-fns/locale': { ptBR: {} }, '@/utils/whatsappFileTypes': { CONTACT_TYPES: [] },
  }, { Date: FrozenDate }).useReportsData;
  let report = reportDriver.render(); report.setPeriod('7'); report = reportDriver.render();
  const actualDays = (report.dateRange.to.getTime() - report.dateRange.from.getTime() + 1) / 86400000;
  const previousFrom = local.appDayStart(14), previousTo = local.appDayEnd(8);
  const actualPreviousDays = (previousTo - previousFrom + 1) / 86400000;
  const displayedPreviousFrom = new FrozenDate(report.dateRange.from.getTime() - (report.dateRange.to - report.dateRange.from));
  assert.equal(actualDays, 8); assert.equal(actualPreviousDays, 7); assert.equal(report.stats.avgMessagesPerDay, 80);
  rows.push({ id: 'R2-MOD-017', probe: 'actual localDay helpers and useReportsData, fixed 2026-10-04 and 70 synthetic messages per calendar day', result: { current_days: actualDays, previous_days: actualPreviousDays, current_total: report.stats.totalMessages, reported_average: report.stats.avgMessagesPerDay, actual_average: 70, queried_previous_start: previousFrom.toISOString(), displayed_previous_start: displayedPreviousFrom.toISOString() } });

  // R2-MOD-026: exact production debounce callback, controlled timers/cache.
  let timerId = 0; const timers = new Map(); let cached = [{ id: 'A', sent_count: 0 }, { id: 'B', sent_count: 0 }];
  const callback = load('const callback = (payload) => {\n' + source('src/hooks/integrations/useTalkX.ts', 172, 180) + '\n};\nexports.callback = callback;', {}, {
    debounceRef: { current: null }, setTimeout: cb => { timers.set(++timerId, cb); return timerId; }, clearTimeout: id => timers.delete(id),
    queryClient: { setQueryData: (_, update) => { cached = update(cached); } },
  }).callback;
  callback({ new: { id: 'A', sent_count: 1 } }); callback({ new: { id: 'B', sent_count: 1 } });
  [...timers.values()].forEach(cb => cb()); assert.equal(cached[0].sent_count, 0); assert.equal(cached[1].sent_count, 1);
  rows.push({ id: 'R2-MOD-026', probe: 'actual TalkX UPDATE debounce callback', result: { cached_after_two_different_campaign_events: cached } });

  // R2-MOD-023: execute production mutation + onSettled after lost response.
  let createHook; const createDriver = hookDriver(() => createHook()); const creationKeys = [];
  createHook = load(source('src/hooks/integrations/useMultiplixDispatches.ts'), {
    react: createDriver.react, '@tanstack/react-query': { useMutation: config => config, useQuery() { throw new Error('Unused query'); } },
    sonner: { toast: { error() {} } }, '@/integrations/supabase/client': { supabase: {} },
    './useMultiplixAudience': { createMultiplixDraft: async input => { creationKeys.push(input.client_request_id); if (creationKeys.length === 1) throw new Error('Committed server-side, response lost (synthetic)'); return { dispatch_id: 'synthetic-dispatch', recipient_count: 1, created: true }; } },
  }).useCreateMultiplixDispatch;
  const mutation = createDriver.render(); const input = { name: 'Synthetic', messageTemplate: 'Hello', companyIds: ['company-A'], startNow: false };
  await mutation.mutationFn(input).catch(() => {}); mutation.onSettled(); await mutation.mutationFn(input); mutation.onSettled();
  assert.notEqual(creationKeys[0], creationKeys[1]);
  rows.push({ id: 'R2-MOD-023', probe: 'actual creation mutation and onSettled with uncertain-outcome mock', result: { distinct_creation_keys_after_retry: creationKeys[0] !== creationKeys[1], attempts: creationKeys.length }, limitation: 'Shows client identity change; server commit/lost response is an explicitly synthetic precondition.' });

  // R2-MOD-032: exact adjacent production effects, preserving declaration order.
  let finalization; const finalizationCalls = [];
  const finalizationDriver = hookDriver((...args) => finalization(...args));
  finalization = load('function run(campaign, sending, selectedId) {\n' + source('src/components/talkx/TalkXCampaignRunning.tsx', 501, 517) + '\nreturn prevCampaignRef.current;\n}\nexports.run = run;', {}, {
    React: finalizationDriver.react, toast: { info: message => finalizationCalls.push(['toast', message]) },
    setSelectedId: value => finalizationCalls.push(['selectedId', value]),
    setPauseOpen: value => finalizationCalls.push(['pauseOpen', value]),
    setCancelOpen: value => finalizationCalls.push(['cancelOpen', value]),
    setLimitsOpen: value => finalizationCalls.push(['limitsOpen', value]),
  }).run;
  const runningCampaign = { id: 'campaign-A', status: 'sending' };
  finalizationDriver.render(runningCampaign, [runningCampaign], 'campaign-A');
  finalizationDriver.render(null, [], 'campaign-A');
  assert.equal(finalizationCalls.length, 0);
  rows.push({ id: 'R2-MOD-032', probe: 'exact TalkXCampaignRunning adjacent effects in declaration order', result: { cleanup_state_setters_after_campaign_completed: finalizationCalls }, limitation: 'Deterministic hook effect driver; not React/DOM integration. First effect overwrites previous campaign with null before second effect reads the ref.' });

  // Second pass Tasks: exact DTO transforms, not a reimplementation.
  const taskPatches = load(source('src/hooks/tasks/useMyWorkItems.ts', 149, 171) + '\nexports.db = toDbPatch; exports.item = toItemPatch;');
  const contactPatch = taskPatches.db({ contactId: 'contact-B' });
  const contactOptimistic = taskPatches.item({ contactId: 'contact-B' });
  assert.equal(Object.keys(contactPatch).length, 0);
  assert.equal(Object.keys(contactOptimistic).length, 0);
  rows.push({ id: 'R2-MOD-049', probe: 'actual toDbPatch and toItemPatch helpers', result: { input_contact: 'contact-B', database_patch: contactPatch, optimistic_patch: contactOptimistic } });

  const reminderPatch = taskPatches.db({ remindAt: '2026-10-05T12:00:00.000Z' });
  assert.equal(reminderPatch.remind_at, '2026-10-05T12:00:00.000Z');
  assert.equal(Object.hasOwn(reminderPatch, 'notified_at'), false);
  rows.push({ id: 'R2-MOD-052', probe: 'actual toDbPatch used by Sheet Save', result: { patch: reminderPatch, rearms_notified_at: Object.hasOwn(reminderPatch, 'notified_at') }, limitation: 'Proves emitted DTO only; existing SQL trigger and scheduler were read statically, not executed.' });

  // Compare actual local-time serializers under an explicit synthetic zone.
  const previousTasksProbeTimezone = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    const composeSheet = load(source('src/components/tasks/shared/WorkItemSheet.tsx', 51, 55) + '\nexports.compose = compor;').compose;
    const composeQuick = load(source('src/components/tasks/shared/QuickAdd.tsx', 32, 37) + '\nexports.compose = compor;').compose;
    const sheetDate = composeSheet('2026-10-05', '09:00');
    const quickDate = composeQuick('2026-10-05', '09:00');
    assert.equal(sheetDate, '2026-10-05T09:00:00');
    assert.equal(quickDate, '2026-10-05T12:00:00.000Z');
    rows.push({ id: 'R2-MOD-050', probe: 'actual WorkItemSheet/QuickAdd compor functions with TZ=America/Sao_Paulo', result: { requested_local_time: '2026-10-05 09:00', sheet_payload: sheetDate, quick_add_payload: quickDate, hours_apart_if_server_interprets_offsetless_as_utc: (Date.parse(quickDate) - Date.parse(sheetDate + 'Z')) / 3600000 }, limitation: 'No PostgreSQL session. The UTC interpretation is an explicit server-timezone precondition, not an observation of the deployed database.' });
  } finally {
    if (previousTasksProbeTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTasksProbeTimezone;
  }

  const savingCalls = [];
  const neverFinishes = new Promise(() => {});
  const saveTask = load(source('src/components/tasks/shared/WorkItemSheet.tsx', 179, 204) + '\nexports.save = salvar;', {}, {
    motivoObrigatorio: false, motivo: '', setErro() {}, dia: null, hora: '', alarmeDia: null, alarmeHora: '', compor: () => null,
    status: 'doing', title: 'Edited task', description: '', prioridade: 'medium', contactId: '',
    item: { status: 'todo', title: 'Original task', description: null, priority: 'medium', contact_id: null, waiting_reason: null, due_date: null, remind_at: null },
    onMove: () => { savingCalls.push('move-pending'); return neverFinishes; },
    onSave: () => { savingCalls.push('save-pending'); return neverFinishes; },
    onOpenChange: value => savingCalls.push(value ? 'open' : 'closed'),
  }).save;
  saveTask();
  assert.equal(savingCalls.join(','), 'move-pending,save-pending,closed');
  rows.push({ id: 'R2-MOD-051', probe: 'actual WorkItemSheet salvar callback with unresolved move/save promises', result: { order_before_either_write_resolves: savingCalls }, limitation: 'No server mutation executed; pending promises prove premature close and concurrent dispatch.' });

  // Exact drag resolver plus exact persistence callback on a filtered board.
  const taskTypes = load(source('src/hooks/tasks/workItem.types.ts'));
  const taskMachine = load(source('src/hooks/tasks/workItemMachine.ts'), { './workItem.types': taskTypes });
  const resolveDrag = load(source('src/components/tasks/board/resolveDragEnd.ts'), { '@/hooks/tasks/workItemMachine': taskMachine }).resolveDragEnd;
  const bucketStatuses = load(source('src/hooks/tasks/workItemAggregates.ts', 154, 167) + '\nexports.bucket = bucketByStatus;', {}, { PRIORITY_WEIGHT: { urgent: 0, high: 1, medium: 2, low: 3 } }).bucket;
  const task = (id, status, position) => ({ id, title: id, status, position, created_by: 'owner', created_at: '2026-10-01T12:00:00Z', priority: 'medium', waiting_reason: null });
  const hidden = task('hidden', 'todo', 0), aTask = task('A', 'todo', 1), bTask = task('B', 'todo', 2), movedTask = task('X', 'backlog', 0);
  const allTasks = [hidden, aTask, bTask, movedTask];
  const visibleColumns = bucketStatuses([aTask, bTask, movedTask]);
  const resolution = resolveDrag({ source: { droppableId: 'backlog', index: 0 }, destination: { droppableId: 'todo', index: 1 }, draggableId: 'X' }, visibleColumns, 0);
  let writtenPositions;
  const persistPositions = load(source('src/hooks/tasks/useMyWorkItems.ts', 383, 401) + '\nexports.persist = persistPositions;', {}, {
    items: allTasks, bucketByStatus: bucketStatuses, profileId: 'owner',
    supabase: { from: () => ({ upsert: async positions => { writtenPositions = positions; return { error: null }; } }) },
  }).persist;
  await persistPositions(resolution.item, resolution.to, resolution.opts.index);
  const visibleAfter = writtenPositions.filter(p => p.id !== 'hidden').sort((a,b) => a.position-b.position).map(p => p.id);
  assert.equal(visibleAfter.join(','), 'X,A,B');
  rows.push({ id: 'R2-MOD-055', probe: 'actual resolveDragEnd and persistPositions callbacks with hidden target-column row', result: { requested_visible_order: ['A','X','B'], persisted_visible_order: visibleAfter, written_positions: writtenPositions.map(p => ({ id:p.id, position:p.position })) }, limitation: 'Stubbed upsert records payload only; no DnD renderer or database. Hidden row is an explicit active-filter precondition.' });

  // Agenda day changes while QuickAdd is awaiting its first create.
  let quickComponent, resolveQuickCreate;
  const quickDriver = hookDriver((...args) => quickComponent(...args));
  quickComponent = load(source('src/components/tasks/shared/QuickAdd.tsx', 47, 147) + '\nreturn { dueDate, diaAplicado, setTitle, handleSubmit };\n});\nexports.component = QuickAdd;', {}, {
    ...quickDriver.react, forwardRef: fn => fn,
  }).component;
  const quickCreates = [];
  const quickProps = due => ({ defaultDueDate: due, defaultStatus: 'todo', onAdd: input => { quickCreates.push(input); return new Promise(resolve => { resolveQuickCreate = resolve; }); } });
  const dayA = '2026-10-05T23:59:00.000Z', dayB = '2026-10-06T23:59:00.000Z';
  let quick = quickDriver.render(quickProps(dayA)); quick.setTitle('Task A');
  quick = quickDriver.render(quickProps(dayA)); const pendingQuick = quick.handleSubmit();
  quick = quickDriver.render(quickProps(dayB)); assert.equal(quick.dueDate, dayB);
  resolveQuickCreate(); await pendingQuick;
  quick = quickDriver.render(quickProps(dayB));
  assert.equal(quick.diaAplicado, dayB); assert.equal(quick.dueDate, dayA);
  quick.setTitle('Task intended for B'); quick = quickDriver.render(quickProps(dayB));
  const secondQuick = quick.handleSubmit(); assert.equal(quickCreates[1].dueDate, dayA);
  resolveQuickCreate(); await secondQuick;
  rows.push({ id: 'R2-MOD-056', probe: 'actual QuickAdd state/render synchronization and deferred handleSubmit callback', result: { selected_default_day: dayB, internal_applied_marker: quick.diaAplicado, second_create_due_date: quickCreates[1].dueDate }, limitation: 'Deterministic hook driver, not browser/React rendering. Actual Agenda leaves day-selection buttons enabled during create.' });

  // Exact ProductThumb state machine. JSX is an object tree, not a DOM renderer.
  let thumbComponent;
  const thumbDriver = hookDriver(props => thumbComponent(props));
  thumbComponent = load(source('src/components/catalog/catalogShared.tsx', 261, 294), {}, {
    useState: thumbDriver.react.useState,
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    cfImagesSrcSet: () => null, Package: 'SyntheticPackageIcon',
  }).ProductThumb;
  const findImage = node => !node || typeof node !== 'object' ? null : node.type === 'img' ? node : (node.children || []).map(findImage).find(Boolean) || null;
  const thumbProps = { src: 'synthetic-broken-primary', fallbackSrc: 'synthetic-valid-fallback', alt: 'Synthetic' };
  let thumb = thumbDriver.render(thumbProps);
  findImage(thumb).props.onError(); thumb = thumbDriver.render(thumbProps);
  const imageAfterPrimaryError = findImage(thumb).props.src;
  findImage(thumb).props.onLoad(); thumb = thumbDriver.render(thumbProps);
  const imageAfterFallbackLoad = findImage(thumb).props.src;
  assert.equal(imageAfterPrimaryError, thumbProps.fallbackSrc);
  assert.equal(imageAfterFallbackLoad, thumbProps.src);
  findImage(thumb).props.onError(); thumb = thumbDriver.render(thumbProps);
  findImage(thumb).props.onError(); thumb = thumbDriver.render(thumbProps);
  assert.equal(findImage(thumb), null);
  const afterNewSource = thumbDriver.render({ ...thumbProps, src: 'synthetic-valid-next-image' });
  assert.equal(findImage(afterNewSource), null);
  rows.push({ id: 'R2-MOD-066', probe: 'actual ProductThumb with deterministic hooks and JSX object tree', result: { image_after_primary_error: imageAfterPrimaryError, image_after_fallback_load: imageAfterFallbackLoad, new_source_after_terminal_error_still_has_no_img: findImage(afterNewSource) === null }, limitation: 'No browser, HTTP or image decoder. Controlled callbacks prove source selection and persistent error state, not measured network traffic.' });

  // JSONB preserves the scalar string handed to the API; simulate only that contract.
  let storedChatbotFlow = null, chatbotQueryConfig;
  const chatbotHook = load(source('src/hooks/integrations/useChatbotFlows.ts'), {
    '@tanstack/react-query': {
      useQuery: config => { chatbotQueryConfig = config; return { data: [] }; },
      useMutation: config => config,
      useQueryClient: () => ({ invalidateQueries() {} }),
    },
    sonner: { toast: { success() {}, error() {} } },
    '@/integrations/supabase/client': { supabase: { from: () => ({
      select: () => ({ order: async () => ({ data: storedChatbotFlow ? [storedChatbotFlow] : [], error: null }) }),
      insert: payload => ({ select: () => ({ single: async () => {
        storedChatbotFlow = JSON.parse(JSON.stringify({ id: 'synthetic-flow', ...payload }));
        return { data: storedChatbotFlow, error: null };
      } }) }),
      update: payload => ({ eq: () => ({ select: () => ({ single: async () => {
        storedChatbotFlow = { ...storedChatbotFlow, ...JSON.parse(JSON.stringify(payload)) };
        return { data: storedChatbotFlow, error: null };
      } }) }) }),
    }) } },
  }).useChatbotFlows;
  const chatbot = chatbotHook();
  await chatbot.createFlow.mutationFn({ name: 'Synthetic chatbot' });
  const initialNodePayload = storedChatbotFlow.nodes;
  const retrievedFlow = (await chatbotQueryConfig.queryFn())[0];
  let chatbotEditor;
  const chatbotDriver = hookDriver(props => chatbotEditor(props));
  chatbotEditor = load(source('src/components/chatbot/ChatbotFlowEditor.tsx', 21, 26) + '\nreturn { nodes, edges };\n}', {}, chatbotDriver.react).ChatbotFlowEditor;
  const graph = chatbotDriver.render({ flow: retrievedFlow });
  assert.equal(typeof initialNodePayload, 'string');
  assert.equal(JSON.parse(initialNodePayload).length, 1);
  assert.equal(graph.nodes.length, 0);
  await chatbot.updateFlow.mutationFn({ id: retrievedFlow.id, nodes: graph.nodes, edges: graph.edges });
  assert.equal(storedChatbotFlow.nodes, '[]');
  rows.push({ id: 'R2-MOD-068', probe: 'actual create/query/update hook callbacks and editor initial state with scalar-preserving mock', result: { initial_nodes_payload_type: typeof initialNodePayload, nodes_encoded_initially: JSON.parse(initialNodePayload).length, nodes_displayed_after_reopen: graph.nodes.length, nodes_payload_after_saving_empty_editor: storedChatbotFlow.nodes }, limitation: 'JSON transport/mock preserves supplied scalar. SQL column and no-normalizer facts were reviewed separately; no PostgreSQL, RLS or actual React renderer executed.' });

  // UI action and actual Edge dispatch table, both isolated from the network.
  let voiceDesignHandler;
  const vendorOperations = [], voiceDesignToasts = [], voiceDesignAudioWrites = [];
  const SyntheticLogger = class { info() {} done() {} error() {} };
  load(source('supabase/functions/elevenlabs-voice-design/index.ts'), {
    '../_shared/validation.ts': {
      handleCors: () => null, requireAuth: async () => ({ userId: 'synthetic-user' }),
      enforceRateLimit: async () => ({ allowed: true }), requireEnv: () => 'synthetic-only-key', Logger: SyntheticLogger,
      jsonResponse: (body, status) => new Response(JSON.stringify(body), { status }),
      errorResponse: (error, status) => new Response(JSON.stringify({ error }), { status }),
    },
    '../_shared/schemas.ts': {
      ElevenLabsVoiceDesignPreviewSchema: {}, ElevenLabsVoiceDesignCreateSchema: {},
      parseBody: () => { throw new Error('Unexpected preview/create path'); },
      validationErrorResponse: () => { throw new Error('Unexpected schema response'); },
    },
  }, {
    Deno: { serve: handler => { voiceDesignHandler = handler; } }, Response,
    fetch: async (url, options = {}) => {
      vendorOperations.push({ url, method: options.method || 'GET' });
      return new Response(JSON.stringify({ voices: [] }), { status: 200 });
    },
  });
  const voiceDesignGenerate = load(source('src/components/voice/ElevenLabsVoiceDesign.tsx', 22, 69) + '\nexports.generate = generateVoice;', {}, {
    name: 'Synthetic voice', description: 'Synthetic description', gender: 'female', age: 'young', accent: 'brazilian', previewText: 'Synthetic text', audioUrl: null,
    setGenerating() {}, setAudioUrl: value => voiceDesignAudioWrites.push(value),
    toast: { error: value => voiceDesignToasts.push(['error', value]), success: value => voiceDesignToasts.push(['success', value]) },
    SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon',
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-access' } } }) } },
    fetch: async (url, options) => voiceDesignHandler(new Request(url, options)),
  }).generate;
  await voiceDesignGenerate();
  assert.equal(vendorOperations.length, 1);
  assert.equal(vendorOperations[0].method, 'GET');
  assert.equal(vendorOperations[0].url, 'https://api.elevenlabs.io/v1/voices');
  assert.equal(voiceDesignAudioWrites.length, 0);
  assert.equal(voiceDesignToasts[0][0], 'success');
  rows.push({ id: 'R2-MOD-070', probe: 'actual UI generateVoice and actual Edge dispatch with synthetic auth/rate/fetch', result: { operation_selected: vendorOperations[0], audio_state_writes: voiceDesignAudioWrites.length, toast: voiceDesignToasts[0] }, limitation: 'No external request. A successful voices-list response is an explicit synthetic precondition; preview/create schemas are not exercised.' });

  // The actual loader resets its Promise after failure, but keeps the failed tag.
  // No browser/network is simulated beyond one explicitly delivered error event.
  let lameTag = null, lameCreated = 0, lameAppended = 0, lameTimers = 0;
  const lameWindow = {};
  const lameDocument = {
    querySelector: () => lameTag,
    createElement: () => {
      lameCreated++;
      return { dataset: {}, listeners: { load: [], error: [] },
        addEventListener(type, callback) { this.listeners[type].push(callback); } };
    },
    head: { appendChild(tag) { lameTag = tag; lameAppended++; } },
  };
  const loadLamejs = load(source('src/utils/audioToMp3.ts', 11, 75) + '\nexports.loadLamejs = loadLamejs;', {}, {
    document: lameDocument, window: lameWindow,
    setTimeout() { lameTimers++; return 1; },
  }).loadLamejs;
  const lameFirst = loadLamejs().then(() => 'unexpected-success', error => error.message);
  lameTag.listeners.error.forEach(callback => callback());
  const lameFirstError = await lameFirst;
  assert.equal(lameFirstError, 'Falha ao carregar lamejs');
  let lameRetrySettled = false;
  loadLamejs().then(() => { lameRetrySettled = true; }, () => { lameRetrySettled = true; });
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  assert.equal(lameCreated, 1);
  assert.equal(lameAppended, 1);
  assert.equal(lameTag.listeners.load.length, 2);
  assert.equal(lameTag.listeners.error.length, 2);
  assert.equal(lameTimers, 0);
  assert.equal(lameRetrySettled, false);
  rows.push({ id: 'R2-MOD-071', probe: 'actual loadLamejs after one explicit script error, with event-listener mock', result: { first_error: lameFirstError, script_tags_created: lameCreated, script_tags_appended_after_retry: lameAppended, load_listeners_on_failed_tag: lameTag.listeners.load.length, timeout_scheduled: lameTimers, retry_settled_without_new_event: lameRetrySettled }, limitation: 'No browser/vendor/network. Does not measure an indefinite wall-clock hang; it proves that retry creates no new load request or timeout and depends on another event from the already failed tag.' });

  fs.writeFileSync(path.join(__dirname, 'proofs.json'), JSON.stringify({ source_head: 'da307ba5626dce892f0b37cb6762463f55d14a96', executed_at: new Date().toISOString(), execution: 'offline isolated production callbacks; controlled mocks; no DB/network/browser', source_files: [...sourceLog.values()], probes: rows }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ passed: rows.length, ids: rows.map(r => r.id), output: path.join(__dirname, 'proofs.json') }) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
