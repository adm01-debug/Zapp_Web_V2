import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Executes the actual spec's init script, final collector and original action /
// assertion sequence. DOM, browser transport and test assertions are doubles;
// these tests do not execute WebKit or diagnose its historical scheduling.
const source = readFileSync(new URL('../../e2e/email-navy-visual.spec.ts', import.meta.url), 'utf8');
const title = 'workspace do Email é desmontado ao alternar entre módulos';
const start = source.indexOf("test('" + title + "'");
const end = source.indexOf('\ntest(', start + 1);
assert.ok(start >= 0 && end > start, 'The real return-to-Email test must exist');
const sourceTest = source.slice(start, end);
const helperStart = source.indexOf('async function abrirEmail(');
const helperEnd = source.indexOf('\n}\n', helperStart) + 3;
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Real abrirEmail helper must exist');
const bootConstant = source.match(/^const BOOT_DEADLINE_MS = .+;$/m)?.[0];
const testDeadline = source.match(/^test\.setTimeout\(.+\);$/m)?.[0];
assert.ok(bootConstant && testDeadline);
let timeout;
vm.runInNewContext(bootConstant + '\n' + testDeadline, { test: { setTimeout(value) { timeout = value; } } }, { timeout: 1000 });
assert.equal(timeout, 90_000, 'Existing global deadline must stay unchanged');
const compiled = stripTypeScriptTypes(bootConstant + '\nconst PRIMEIRA_CONVERSA = "fixture-ready";\n' + source.slice(helperStart, helperEnd) + '\n' + sourceTest, { mode: 'strip' });
const marker = 'CANARY_PRIVATE_BODY_PASSWORD_TOKEN';
const recordKeys = ['kind', 'ms', 'view', 'active', 'workspace_count', 'email_loading', 'visibility'].sort();
const headerKeys = ['schema', 'status', 'native_view_transition', 'dropped', 'collection_errors', 'records'].sort();

class Listeners {
  rows = new Map();
  addEventListener(type, fn, capture = false) {
    const rows = this.rows.get(type) ?? [];
    rows.push({ fn, capture }); this.rows.set(type, rows);
  }
  removeEventListener(type, fn, capture = false) {
    this.rows.set(type, (this.rows.get(type) ?? []).filter(row => row.fn !== fn || row.capture !== capture));
  }
  dispatch(type, event = {}) { for (const { fn } of [...(this.rows.get(type) ?? [])]) fn(event); }
  size() { return [...this.rows.values()].reduce((sum, rows) => sum + rows.length, 0); }
}

async function simulate(options = {}) {
  const operations = [], attachments = [], violations = [];
  const originalFailure = new Error('ORIGINAL_ASSERTION_' + marker);
  const state = { now: 10, view: null, active: 'none', count: 0, loading: false, visibility: 'visible', sampleThrows: false, clockThrows: false };
  const docEvents = new Listeners(), windowEvents = new Listeners();
  let observer, observeOptions, disconnected = 0, installer, browser, callback, countIndex = 0;
  const forbidden = name => { violations.push(name); throw new Error('forbidden-' + name); };
  class Element {
    constructor(id, inNav = true, parentButton = null) { this.id = id; this.inNav = inNav; this.parentButton = parentButton; }
    closest(selector) {
      if (selector === 'button[data-tour]') return this.parentButton ?? this;
      if (selector === 'nav[aria-label="Menu de navegação principal"]') return this.inNav ? this : null;
      return forbidden('closest:' + selector);
    }
    getAttribute(name) { assert.equal(name, 'data-tour'); return this.id; }
    setAttribute() { return forbidden('setAttribute'); }
    appendChild() { return forbidden('appendChild'); }
    remove() { return forbidden('remove'); }
  }
  const doc = {
    addEventListener: (...args) => docEvents.addEventListener(...args),
    removeEventListener: (...args) => docEvents.removeEventListener(...args),
    get visibilityState() { return state.visibility; },
    querySelectorAll(selector) {
      assert.equal(selector, '.email-workspace');
      if (state.sampleThrows) throw new Error(marker);
      return { length: state.count };
    },
    querySelector(selector) {
      if (state.sampleThrows) throw new Error(marker);
      const prefix = 'nav[aria-label="Menu de navegação principal"] button[data-tour="';
      if (selector === prefix + 'email-chat"][aria-current="page"]') return ['email-chat', 'both'].includes(state.active) ? {} : null;
      if (selector === prefix + 'dashboard"][aria-current="page"]') return ['dashboard', 'both'].includes(state.active) ? {} : null;
      if (selector === 'section[aria-label="Carregando Email"]') return state.loading ? {} : null;
      return forbidden('querySelector:' + selector);
    },
    get body() { return forbidden('body-read'); },
    get cookie() { return forbidden('cookie-read'); },
    createElement() { return forbidden('createElement'); },
  };
  if (options.native !== false) doc.startViewTransition = () => forbidden('startViewTransition-call');
  const win = {
    addEventListener: (...args) => windowEvents.addEventListener(...args),
    removeEventListener: (...args) => windowEvents.removeEventListener(...args),
    location: { get search() { return state.view === null ? '' : '?view=' + encodeURIComponent(state.view) + '&password=' + marker; } },
    get localStorage() { return forbidden('localStorage-read'); },
    get sessionStorage() { return forbidden('sessionStorage-read'); },
    history: { pushState() { return forbidden('pushState'); }, replaceState() { return forbidden('replaceState'); } },
  };
  win.top = options.childFrame ? {} : win;
  const environment = {
    state, window: win, document: doc,
    mutation() { if (observer?.active) observer.fn([]); },
    set(patch) { Object.assign(state, patch); this.mutation(); },
    click(id, inNav = true, nested = false) {
      const button = new Element(id, inNav);
      docEvents.dispatch('click', { target: nested ? new Element(null, inNav, button) : button });
    },
    navigate(detail) { windowEvents.dispatch('zapp:navigate', { detail }); },
    normalReturn() {
      state.now += 2; state.view = 'email-chat'; this.navigate({ view: 'email-chat' });
      state.now += 2; this.set({ active: 'email-chat', count: 1 });
    },
    visibility(value) { state.visibility = value; docEvents.dispatch('visibilitychange'); },
    finished() { return win.__zappEmailReturnDiagnostics?.finish(); },
  };
  browser = vm.createContext({ window: win, document: doc, Element, URLSearchParams, Number, JSON,
    performance: { now() { if (state.clockThrows) throw new Error(marker); return state.now; } },
    MutationObserver: class {
      constructor(fn) { if (options.observerConstructionFails) throw new Error(marker); this.fn = fn; this.active = false; observer = this; }
      observe(target, config) { assert.equal(target, doc); observeOptions = JSON.parse(JSON.stringify(config)); this.active = true; }
      disconnect() { this.active = false; disconnected++; if (options.disconnectFails) throw new Error(marker); }
    },
    setTimeout: () => forbidden('setTimeout'), requestAnimationFrame: () => forbidden('requestAnimationFrame'),
    fetch: () => forbidden('fetch'),
  });
  const page = {
    async addInitScript(fn) { operations.push('install'); if (options.installFails) throw new Error(marker); assert.equal(installer, undefined); installer = fn; },
    async goto(url) {
      operations.push('goto:' + url); assert.equal(url, '/?view=email-chat');
      if (installer) { try { vm.runInContext('(' + installer.toString() + ')()', browser, { timeout: 1000 }); } catch { /* Browser script errors are collected as missing observer. */ } }
      state.now += 5; environment.set({ view: 'email-chat', active: 'email-chat', count: 1 });
      options.afterBoot?.(environment);
    },
    locator(selector) { assert.equal(selector, '.email-workspace'); return { kind: 'workspace' }; },
    getByText(text) { assert.equal(text, 'fixture-ready'); return { first: () => ({ kind: 'ready' }) }; },
    getByRole(role, selection) {
      assert.equal(role, 'button'); assert.deepEqual(JSON.parse(JSON.stringify(selection)), { name: selection.name, exact: true });
      assert.ok(['Dashboard', 'Email'].includes(selection.name));
      return { click: async (...args) => {
        assert.equal(args.length, 0, 'No forced click/options');
        operations.push('click:' + selection.name);
        state.now += 1; environment.click(selection.name === 'Dashboard' ? 'dashboard' : 'email-chat');
        if (selection.name === 'Dashboard') {
          state.now += 2; state.view = 'dashboard'; environment.navigate({ view: 'dashboard' });
          state.now += 2; environment.set({ active: 'dashboard', count: 0 });
          options.afterDashboard?.(environment);
        } else if (options.onReturn) options.onReturn(environment);
        else environment.normalReturn();
      } };
    },
    async evaluate(fn) {
      operations.push('collect');
      options.beforeCollect?.(environment);
      if (options.collectionFails) throw new Error(marker);
      let raw = vm.runInContext('(' + fn.toString() + ')()', browser, { timeout: 1000 });
      raw = raw === undefined ? undefined : structuredClone(raw);
      if (options.changePayload) raw = options.changePayload(raw);
      return raw;
    },
    waitForTimeout() { return forbidden('waitForTimeout'); },
    waitForFunction() { return forbidden('waitForFunction'); },
    addStyleTag() { return forbidden('addStyleTag'); },
  };
  const expect = subject => ({
    async toBeVisible(...args) { operations.push('ready'); assert.equal(subject.kind, 'ready'); assert.equal(args.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(args[0])), { timeout: 60_000 }); },
    async toHaveCount(...args) {
      assert.equal(args.length, 1, 'Keep the original implicit 5 s deadline');
      assert.equal(subject.kind, 'workspace');
      const [count] = args; operations.push('count:' + count); countIndex++;
      if (options.failCount === countIndex || state.count !== count) throw originalFailure;
    },
    async toHaveURL(...args) { operations.push('url:dashboard'); assert.equal(args.length, 1); assert.ok(args[0].test('http://127.0.0.1:5173/?view=' + state.view)); },
  });
  const testInfo = { async attach(name, details) {
    operations.push('attach');
    assert.equal(name, 'email-return-diagnostics.json');
    assert.deepEqual(Object.keys(details).sort(), ['body', 'contentType']);
    assert.equal(details.contentType, 'application/json');
    assert.equal(typeof details.body, 'string');
    assert.doesNotMatch(details.body, /CANARY|password|token|https?:|fixture-ready/i);
    attachments.push(JSON.parse(details.body));
    if (options.attachmentFails) throw new Error(marker);
  } };
  vm.runInNewContext(compiled, { test(name, fn) { assert.equal(name, title); assert.equal(callback, undefined); callback = fn; }, expect }, { timeout: 1000 });
  let failure;
  try { await callback({ page }, testInfo); } catch (error) { failure = error; }
  assert.deepEqual(violations, [], 'No hidden DOM/history/network/timer access');
  const actual = attachments.at(-1);
  assert.ok(actual, 'An attachment attempt must occur even if the original test fails');
  if (actual.status === 'unavailable') assert.deepEqual(Object.keys(actual).sort(), ['reason', 'schema', 'status']);
  else {
    assert.deepEqual(Object.keys(actual).sort(), headerKeys);
    assert.ok(actual.records.length <= 48);
    for (const row of actual.records) assert.deepEqual(Object.keys(row).sort(), recordKeys);
  }
  const counts = operations.filter(value => value.startsWith('count:'));
  assert.deepEqual(counts, ['count:1', 'count:0', 'count:1'].slice(0, counts.length));
  assert.equal(operations[0], 'install'); assert.equal(operations[1], 'goto:/?view=email-chat');
  assert.equal(operations.filter(value => value === 'goto:/?view=email-chat').length, 1);
  assert.equal(operations.filter(value => value === 'collect').length, options.installFails ? 0 : 1);
  assert.equal(operations.filter(value => value === 'attach').length, 1);
  if (options.failCount || options.expectOriginalFailure) assert.equal(failure, originalFailure, 'Keep the same original failure object');
  else assert.equal(failure, undefined);
  if (observer && !options.observerConstructionFails) {
    assert.deepEqual(observeOptions, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-label'] });
    if (!options.collectionFails) {
      assert.equal(observer.active, false); assert.equal(docEvents.size(), 0); assert.equal(windowEvents.size(), 0); assert.equal(disconnected, 1);
    }
  }
  return { report: actual, operations, environment, failure, originalFailure };
}

const normalKinds = ['init', 'state', 'click-dashboard', 'navigate-dashboard', 'state', 'click-email', 'navigate-email', 'state', 'final'];
const cases = [
  { name: 'normal sequence preserves click, URL/event, commit and workspace separately', check(r) { assert.equal(r.status, 'ok'); assert.deepEqual(r.records.map(x=>x.kind),normalKinds); assert.equal(r.records[3].view,'dashboard'); assert.equal(r.records[3].active,'email-chat'); assert.equal(r.records[6].view,'email-chat'); assert.equal(r.records[6].active,'dashboard'); } },
  { name: 'unsupported native API is recorded without calling it', native:false, check(r) { assert.equal(r.native_view_transition,false); } },
  { name: 'click without navigation remains distinct at failure', onReturn() {}, expectOriginalFailure:true, check(r) { assert.equal(r.records.at(-1).view,'dashboard'); assert.ok(!r.records.some(x=>x.kind==='navigate-email')); } },
  { name: 'URL and event can precede an uncommitted route', onReturn(e) { e.state.view='email-chat';e.navigate({view:'email-chat'}); }, expectOriginalFailure:true, check(r) { assert.equal(r.records.at(-1).view,'email-chat');assert.equal(r.records.at(-1).active,'dashboard');assert.equal(r.records.at(-1).workspace_count,0); } },
  { name: 'committed Email can precede workspace readiness', onReturn(e) {e.state.view='email-chat';e.navigate({view:'email-chat'});e.set({active:'email-chat',count:0});}, expectOriginalFailure:true, check(r) { assert.equal(r.records.at(-1).active,'email-chat');assert.equal(r.records.at(-1).workspace_count,0); } },
  { name: 'late mount at collection does not erase original failure', onReturn(e) {e.state.view='email-chat';e.navigate({view:'email-chat'});e.set({active:'email-chat',count:0});},beforeCollect(e){e.state.now+=5500;e.set({count:1});},expectOriginalFailure:true,check(r){assert.equal(r.records.at(-1).workspace_count,1);assert.ok(r.records.some(x=>x.active==='email-chat'&&x.workspace_count===0));} },
  { name: 'wrong route is reduced to other without URL disclosure', onReturn(e){e.set({view:'contacts?private='+marker,active:'none',count:0});},expectOriginalFailure:true,check(r){assert.equal(r.records.at(-1).view,'other');} },
  { name: 'account loading is explicit without collecting its text', onReturn(e){e.state.view='email-chat';e.navigate({view:'email-chat'});e.set({active:'email-chat',loading:true,count:0});},expectOriginalFailure:true,check(r){assert.equal(r.records.at(-1).email_loading,true);} },
  { name: 'duplicate workspaces retain count2 and original rejection', onReturn(e){e.normalReturn();e.set({count:2});},expectOriginalFailure:true,check(r){assert.equal(r.records.at(-1).workspace_count,2);} },
  { name: 'workspace count saturates at3 without unbounded values', onReturn(e){e.normalReturn();e.set({count:1000});},expectOriginalFailure:true,check(r){assert.equal(r.records.at(-1).workspace_count,3);} },
  { name: 'inconsistent active items are represented as both', onReturn(e){e.normalReturn();e.set({active:'both'});},check(r){assert.equal(r.records.at(-1).active,'both');} },
  { name: 'missing view has the closed unknown value', onReturn(e){e.normalReturn();e.set({view:null});},check(r){assert.equal(r.records.at(-1).view,'unknown');} },
  { name: 'unrelated DOM mutations are deduplicated', onReturn(e){e.normalReturn();for(let i=0;i<100;i++){e.state.now++;e.mutation();}},check(r){assert.deepEqual(r.records.map(x=>x.kind),normalKinds);} },
  { name: 'event milestones remain visible even with equal snapshots', onReturn(e){e.normalReturn();e.navigate({view:'email-chat'});e.navigate({view:'email-chat'});},check(r){assert.equal(r.records.filter(x=>x.kind==='navigate-email').length,3);} },
  { name: 'nested click targets use the allowed parent button', onReturn(e){e.click('email-chat',true,true);e.normalReturn();},check(r){assert.equal(r.records.filter(x=>x.kind==='click-email').length,2);} },
  { name: 'same data-tour outside the primary navigation is ignored', onReturn(e){e.click('email-chat',false);e.normalReturn();},check(r){assert.equal(r.records.filter(x=>x.kind==='click-email').length,1);} },
  { name: 'unknown click identifiers and canaries are ignored', onReturn(e){e.click(marker);e.normalReturn();},check(r){assert.deepEqual(r.records.map(x=>x.kind),normalKinds);} },
  { name: 'unknown navigation events and extra fields never enter records', onReturn(e){e.navigate({view:marker,password:marker});e.normalReturn();e.navigate({view:'email-chat',body:marker});},check(r){assert.equal(r.status,'ok');assert.equal(r.records.filter(x=>x.kind==='navigate-email').length,2);} },
  { name: 'undefined event details are ignored', onReturn(e){e.navigate(undefined);e.normalReturn();},check(r){assert.equal(r.status,'ok');assert.deepEqual(r.records.map(x=>x.kind),normalKinds);} },
  { name: 'throwing event getters become partial without leaking cause', onReturn(e){e.navigate(Object.defineProperty({},'view',{get(){throw new Error(marker);}}));e.normalReturn();},check(r){assert.equal(r.status,'partial');assert.equal(r.collection_errors,1);} },
  { name: 'hidden and other visibility states use only fixed values', onReturn(e){e.normalReturn();e.visibility('hidden');e.visibility(marker);e.visibility('visible');},check(r){assert.deepEqual(r.records.slice(-4,-1).map(x=>x.visibility),['hidden','other','visible']);} },
  { name: '48-record limit retains init and the latest final observation', onReturn(e){e.normalReturn();for(let i=0;i<60;i++){e.state.now++;e.set({count:i%2?1:2});}},check(r){assert.equal(r.records.length,48);assert.equal(r.dropped,21);assert.equal(r.records[0].kind,'init');assert.equal(r.records.at(-1).kind,'final');assert.equal(r.records.at(-1).workspace_count,1);} },
  { name: 'drop count is bounded under an event storm', onReturn(e){e.normalReturn();for(let i=0;i<10100;i++)e.navigate({view:'email-chat'});},check(r){assert.equal(r.records.length,48);assert.equal(r.dropped,9999);} },
  { name: 'relative time is rounded, monotonic and bounded', onReturn(e){e.normalReturn();e.state.now=50.49;e.navigate({view:'email-chat'});e.state.now=-100;e.navigate({view:'email-chat'});e.state.now=999999999;e.navigate({view:'email-chat'});},check(r){const rows=r.records.filter(x=>x.kind==='navigate-email');assert.deepEqual(rows.slice(-3).map(x=>x.ms),[40,40,120000]);} },
  { name: 'nonfinite clock makes collection partial', onReturn(e){e.normalReturn();e.state.now=NaN;e.navigate({view:'email-chat'});e.state.now=30;},check(r){assert.equal(r.status,'partial');assert.equal(r.collection_errors,1);} },
  { name: 'DOM sampling failure is counted and later sample recovers', onReturn(e){e.normalReturn();e.state.sampleThrows=true;e.mutation();e.state.sampleThrows=false;},check(r){assert.equal(r.status,'partial');assert.equal(r.collection_errors,1);assert.equal(r.records.at(-1).kind,'final');} },
  { name: 'failing final sample preserves earlier evidence and failure',failCount:3,beforeCollect(e){e.state.sampleThrows=true;},check(r){assert.equal(r.status,'partial');assert.notEqual(r.records.at(-1).kind,'final');} },
  { name: 'collector cleans listeners and repeated finish is stable',check(r,env){const before=JSON.stringify(env.finished());env.set({count:2});env.click('email-chat');env.navigate({view:'email-chat'});assert.equal(JSON.stringify(env.finished()),before);assert.equal(JSON.parse(before).status,r.status);} },
  { name: 'cleanup failure is partial and does not mask assertion',disconnectFails:true,failCount:3,check(r){assert.equal(r.status,'partial');assert.equal(r.collection_errors,1);} },
  { name: 'init registration failure keeps the test sequence',installFails:true,check(r){assert.equal(r.reason,'install-failed');} },
  { name: 'init registration failure preserves same first-count failure',installFails:true,failCount:1,check(r){assert.equal(r.reason,'install-failed');} },
  { name: 'browser collection failure preserves same exit-count failure',collectionFails:true,failCount:2,check(r){assert.equal(r.reason,'collection-failed');} },
  { name: 'browser collection failure preserves same return failure',collectionFails:true,failCount:3,check(r){assert.equal(r.reason,'collection-failed');} },
  { name: 'attachment failure preserves same return failure',attachmentFails:true,failCount:3,check(r){assert.equal(r.status,'ok');} },
  { name: 'attachment failure cannot turn success into failure',attachmentFails:true,check(r){assert.equal(r.status,'ok');} },
  { name: 'observer construction failure is reported as missing',observerConstructionFails:true,check(r){assert.equal(r.reason,'collector-missing');} },
  { name: 'child-frame installer does not collect that frame',childFrame:true,check(r){assert.equal(r.reason,'collector-missing');} },
  { name: 'root extra canary fields reject the complete payload',changePayload(r){return {...r,body:marker};},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'row extra canary fields reject the complete payload',changePayload(r){r.records[0].password=marker;return r;},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'unknown milestone value cannot escape the schema',changePayload(r){r.records[0].kind=marker;return r;},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'malformed count and time are rejected',changePayload(r){r.records[0].workspace_count=4;r.records[0].ms=-1;return r;},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'oversized returned array is rejected',changePayload(r){r.records=Array.from({length:49},()=>({...r.records[0]}));return r;},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'empty success payload is rejected',changePayload(r){r.records=[];return r;},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'inconsistent health status is rejected',changePayload(r){r.collection_errors=1;return r;},check(r){assert.equal(r.reason,'invalid-payload');} },
  { name: 'nonenumerable toJSON cannot inject a hidden body',changePayload(r){Object.defineProperty(r,'toJSON',{value(){return {body:marker};}});Object.defineProperty(r.records[0],'toJSON',{value(){return {body:marker};}});return r;},check(r){assert.equal(r.status,'ok');assert.deepEqual(Object.keys(r).sort(),headerKeys);} },
];

for (const scenario of cases) test('Email navigation diagnostics: ' + scenario.name, async () => {
  const result = await simulate(scenario);
  scenario.check(result.report, result.environment);
});

test('Email navigation diagnostics: existing actions, three count assertions and global deadline stay exact', () => {
  assert.deepEqual([...sourceTest.matchAll(/await expect\(page\.locator\('\.email-workspace'\)\)\.toHaveCount\(([^)]+)\);/g)].map(x=>x[1]),['1','0','1']);
  assert.equal([...sourceTest.matchAll(/\.click\(/g)].length,2);
  assert.equal([...sourceTest.matchAll(/await abrirEmail\(page\);/g)].length,1);
  assert.equal([...sourceTest.matchAll(/await expect\(page\)\.toHaveURL\(\/view=dashboard\/\);/g)].length,1);
  assert.doesNotMatch(sourceTest,/waitForTimeout|waitForFunction|waitForResponse|waitForEvent|setTimeout|requestAnimationFrame|addStyleTag/);
  assert.doesNotMatch(sourceTest,/startViewTransition\s*=(?!=)|startViewTransition\s*\(/);
});
