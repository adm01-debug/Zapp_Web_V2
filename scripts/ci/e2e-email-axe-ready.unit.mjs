import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import vm from 'node:vm';

// Execute the real Email spec callback with a virtual DOM/clock. These are
// synchronization contracts, not a browser run or an implementation of axe.
// List/header are already ready; the model isolates the empty-state entrance.
const source = readFileSync(new URL('../../e2e/email-navy-visual.spec.ts', import.meta.url), 'utf8');
const title = 'workspace do Email não introduz violações axe';
const start = source.indexOf("test('" + title + "'");
const end = source.indexOf('\ntest(', start + 1);
assert.ok(start >= 0 && end > start, 'Real accessibility test must exist');
const sourceTest = source.slice(start, end);
const bootConstant = source.match(/^const BOOT_DEADLINE_MS = .+;$/m)?.[0];
const deadlineStatement = source.match(/^test\.setTimeout\(.+\);$/m)?.[0];
assert.ok(bootConstant && deadlineStatement, 'Real boot and test deadlines must exist');
let TEST_TIMEOUT_MS;
vm.runInNewContext(bootConstant + '\n' + deadlineStatement, {
  test: { setTimeout(value) { TEST_TIMEOUT_MS = value; } },
}, { timeout: 1000 });
assert.equal(TEST_TIMEOUT_MS, 90_000, 'The existing test deadline must not increase');
function sourceFunction(name) {
  const first = source.indexOf('async function ' + name + '(');
  const last = source.indexOf('\n}\n', first) + 3;
  assert.ok(first >= 0 && last > first, 'Missing source helper ' + name);
  return source.slice(first, last);
}
const helpers = ['abrirEmail', 'freezeVisualTransitions', 'waitForAppliedTheme'].map(sourceFunction).join('\n');
const compiled = stripTypeScriptTypes(
  bootConstant + '\nconst PRIMEIRA_CONVERSA = "fixture-ready";\n' + helpers + '\n' + sourceTest,
  { mode: 'strip' },
);

const base = {
  mounted: true, connected: true, generation: 'a', parentBranch: 'a',
  targetOpacity: '1', parentOpacity: '1', grandOpacity: '1', bodyOpacity: '1', htmlOpacity: '1',
  targetDisplay: 'flex', parentDisplay: 'flex', grandDisplay: 'block',
  targetVisibility: 'visible', parentVisibility: 'visible', grandVisibility: 'visible',
  targetWidth: 500, targetHeight: 300, parentWidth: 500, parentHeight: 300,
  dark: true, htmlTransition: false, bodyTransition: false,
  bg: [14, 14, 16], bodyColor: [248, 250, 252], textColor: [179, 189, 204],
  axeBusy: false, decorativeInfinite: false, decorativeOpacity: '1',
};
const luminance = color => color.reduce((sum, v, i) => {
  const c = v / 255;
  return sum + [0.2126, 0.7152, 0.0722][i] * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
}, 0);
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const rgb = color => 'rgb(' + color.join(', ') + ')';
class Clock {
  now = 0; nextId = 0; tasks = new Map(); frames = 0;
  constructor(interval = 16) { this.interval = interval; }
  schedule(fn, ms) { const id = ++this.nextId; this.tasks.set(id, { id, at: this.now + ms, fn }); return id; }
  clear(id) { this.tasks.delete(id); }
  raf(fn) {
    const id = ++this.nextId;
    if (Number.isFinite(this.interval)) {
      const at = (Math.floor(this.now / this.interval) + 1) * this.interval;
      this.tasks.set(id, { id, at, fn: () => { this.frames++; fn(this.now); } });
    }
    return id;
  }
  delay(ms) { return new Promise(resolve => this.schedule(resolve, ms)); }
  async run(fn, phase) {
    let settled = false, failure = null;
    Promise.resolve().then(fn).then(() => { settled = true; }, e => { settled = true; failure = e; });
    const deadline = this.schedule(() => {
      settled = true;
      failure = new Error('Existing 90 s test deadline');
      failure.kind = phase() === 'theme' ? 'theme-timeout' : 'test-timeout';
    }, TEST_TIMEOUT_MS);
    for (let guard = 0; guard < 100_000 && !settled; guard++) {
      // Drain native and VM promise continuations before advancing virtual time.
      await new Promise(resolve => setImmediate(resolve));
      if (settled) break;
      const task = [...this.tasks.values()].sort((a, b) => a.at - b.at || a.id - b.id)[0];
      assert.ok(task, 'Unsettled promise with no scheduled timeout');
      this.tasks.delete(task.id); this.now = task.at; task.fn();
    }
    this.clear(deadline);
    assert.ok(settled, 'Virtual scheduler guard reached');
    return failure;
  }
}

async function simulate(example) {
  const clock = new Clock(example.frameInterval ?? 16);
  const state = () => ({ ...base, ...example.at(clock.now) });
  const nodes = new Map(), scans = [], readinessSamples = [], operations = [];
  let phase = 'opening', testBody, inFlight = false, competitorBusy = false, competitorQueued = false, axeAttempts = 0, themeWaits = 0;
  const node = (role, key = role) => {
    const id = role + ':' + key;
    if (nodes.has(id)) return nodes.get(id);
    const value = {
      role, key, className: '',
      get isConnected() { const s = state(); return role !== 'target' || (s.mounted && s.connected && s.generation === key); },
      get parentElement() {
        const s = state();
        if (role === 'target') return node('parent', s.parentBranch);
        if (role === 'parent') return node('grand');
        if (role === 'grand') return node('body');
        if (role === 'body') return node('html');
        return null;
      },
      getBoundingClientRect() {
        const s = state();
        if (role === 'target') {
          if (!this.isConnected || s.targetDisplay === 'none' || s.parentDisplay === 'none' || s.grandDisplay === 'none') return { width: 0, height: 0 };
          return { width: s.targetWidth, height: s.targetHeight };
        }
        return { width: s.parentWidth, height: s.parentHeight };
      },
      classList: { contains(name) { const s = state(); return name === 'dark' ? role === 'html' && s.dark : name === 'theme-transitioning' && (role === 'html' ? s.htmlTransition : role === 'body' && s.bodyTransition); } },
      appendChild() {}, remove() {},
    };
    nodes.set(id, value); return value;
  };
  const doc = {
    documentElement: node('html'), body: node('body'),
    createElement() { return node('probe'); },
    querySelector(selector) {
      if (example.throwSelector) { const err = new Error('Simulated DOM selector error'); err.kind = 'dom-error'; throw err; }
      assert.equal(selector, '[data-testid="email-workspace"] [data-testid="conversation-empty-state"]');
      const s = state();
      readinessSamples.push({ at: clock.now, generation: s.mounted ? s.generation : null, busy: s.axeBusy });
      return s.mounted ? node('target', s.generation) : null;
    },
  };
  const css = target => {
    const s = state(), role = target.role;
    if (example.throwStyle && role === 'parent') { const err = new Error('Simulated DOM style error'); err.kind = 'dom-error'; throw err; }
    return {
      opacity: s[role + 'Opacity'] ?? '1',
      display: s[role + 'Display'] ?? 'block',
      visibility: s[role + 'Visibility'] ?? 'visible',
      color: rgb(role === 'body' ? s.bodyColor : s.textColor),
      backgroundColor: rgb(s.bg),
    };
  };
  const axe = {
    get _running() {
      if (example.competeAfterCheck && clock.now >= 32 && !competitorQueued) {
        competitorQueued = true;
        queueMicrotask(() => { if (!inFlight) competitorBusy = true; });
      }
      return state().axeBusy || inFlight || competitorBusy;
    },
    run(selector, options) {
      axeAttempts++;
      if (state().axeBusy || inFlight || competitorBusy) { const err = new Error('Simulated concurrent axe invocation'); err.kind = 'concurrent-axe'; throw err; }
      assert.equal(selector, '.email-workspace');
      assert.deepEqual(JSON.parse(JSON.stringify(options)), { rules: { 'color-contrast': { enabled: true } } },
        'Axe options must preserve the full existing analysis');
      if (example.axeNeverResolves) { inFlight = true; return new Promise(() => {}); }
      if (example.throwAxe) {
        const err = new Error('Simulated axe error'); err.kind = 'axe-error';
        if (example.throwAxe === 'sync') throw err;
        return Promise.reject(err);
      }
      inFlight = true;
      const s = state();
      const alpha = ['target', 'parent', 'grand', 'body', 'html'].reduce((a, role) => a * Number(s[role + 'Opacity']), 1);
      const hasText = s.mounted && s.connected && s.targetWidth > 0 && s.targetHeight > 0
        && ![s.targetDisplay, s.parentDisplay, s.grandDisplay].includes('none')
        && ![s.targetVisibility, s.parentVisibility, s.grandVisibility].some(v => ['hidden', 'collapse'].includes(v))
        && Number.isFinite(alpha) && alpha > 0;
      const composite = s.textColor.map((v, i) => Math.round(s.bg[i] + (v - s.bg[i]) * alpha));
      const contrast = hasText ? ratio(composite, s.bg) : null;
      scans.push({ at: clock.now, generation: s.generation, alpha, hasText, composite, contrast,
        themeDark: s.dark, themeTransition: s.htmlTransition || s.bodyTransition, frames: clock.frames });
      return Promise.resolve({ violations: hasText && contrast < 4.5 ? [{
        id: 'color-contrast', impact: 'serious', nodes: [{ target: ['.leading-relaxed'], failureSummary: 'Simulated contrast ' + contrast }],
      }] : [] }).finally(() => { inFlight = false; });
    },
  };
  const page = {
    async goto() { operations.push('goto mocked fixture'); },
    getByText() { return { first: () => ({ kind: 'list-ready' }) }; },
    getByTestId() { return { getByRole: () => ({ kind: 'header-ready' }) }; },
    async addStyleTag({ content }) {
      assert.equal(content, '*, *::before, *::after { animation: none !important; transition: none !important; }',
        'The existing CSS freeze must not force product opacity or colors');
      operations.push('existing CSS freeze');
    },
    async waitForTimeout(ms) { operations.push('fixed ' + ms + 'ms'); await clock.delay(ms); },
    async addScriptTag() { operations.push('axe script model'); if (example.scriptDelay) await clock.delay(example.scriptDelay); },
    async waitForFunction(fn, arg) {
      phase = 'theme'; themeWaits++;
      while (!await fn(arg)) await new Promise(resolve => clock.raf(resolve));
      phase = 'theme-done';
    },
    async evaluate(fn) { phase = 'axe-evaluate'; return await fn(); },
  };
  const win = {
    axe,
    setTimeout: (fn, ms) => clock.schedule(fn, ms),
    clearTimeout: id => clock.clear(id),
    requestAnimationFrame: fn => clock.raf(fn),
    cancelAnimationFrame: id => clock.clear(id),
  };
  const context = vm.createContext({
    window: win, document: doc, getComputedStyle: css, page,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: win.cancelAnimationFrame,
    join, process: { cwd: () => '/offline-model' },
    test: (name, fn) => { assert.equal(name, title); testBody = fn; },
    expect: actual => ({
      async toBeVisible() { assert.ok(['list-ready', 'header-ready'].includes(actual.kind)); },
      toEqual(expected) {
        if (!isDeepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)))) {
          const err = new Error('Original violations assertion failed'); err.kind = 'scan-axe-fail'; throw err;
        }
      },
    }),
  });
  vm.runInContext(compiled, context, { timeout: 1000 });
  assert.equal(typeof testBody, 'function');
  const failure = await clock.run(() => testBody({ page }), () => phase);
  const outcome = failure
    ? failure.kind ?? (failure.message.includes('Email não estabilizou') ? 'readiness-timeout' : 'unexpected-error')
    : 'scan-pass';
  return { outcome, finishedAt: clock.now, scans, readinessSamples, operations, axeAttempts, themeWaits,
    pendingTasks: clock.tasks.size, error: failure?.message ?? null };
}

const scenario = (at = () => ({}), options = {}) => ({ at, ...options });
const check = async (example, outcome, attempts, time) => {
  const result = await simulate(example);
  assert.equal(result.outcome, outcome, result.error ?? 'Unexpected result');
  assert.equal(result.axeAttempts, attempts);
  assert.equal(result.themeWaits, 1, 'The real applied-theme helper must run before measurement');
  if (time !== undefined) assert.equal(result.finishedAt, time);
  if (outcome !== 'theme-timeout') assert.equal(result.pendingTasks, 0, 'No readiness timer/frame may survive');
  return result;
};

test('Email axe: tema aplicado e dois frames antes de uma única análise', async () => {
  const result = await check(scenario(), 'scan-pass', 1, 32);
  assert.equal(result.scans.length, 1);
  assert.equal(result.scans[0].frames, 2);
});

test('Email axe: classe dark não libera tokens resolvidos ainda claros', async () => {
  await check(scenario(t => t < 700 ? { bg: [248, 249, 250], bodyColor: [24, 28, 35] } : {}), 'scan-pass', 1, 736);
});

test('Email axe: aguarda o fade do container e de cada nível ancestral', async () => {
  for (const key of ['targetOpacity', 'parentOpacity', 'grandOpacity', 'bodyOpacity', 'htmlOpacity']) {
    const result = await check(scenario(t => ({ [key]: t < 900 ? '.613' : '1' })), 'scan-pass', 1, 928);
    assert.equal(result.scans[0].alpha, 1, key);
  }
});

test('Email axe: opacidade quase completa não é aceita como estado final', async () => {
  await check(scenario(() => ({ targetOpacity: '.999' })), 'readiness-timeout', 0, 10_000);
});

test('Email axe: ausência permanente do alvo falha sem escanear conteúdo ausente', async () => {
  await check(scenario(() => ({ mounted: false })), 'readiness-timeout', 0, 10_000);
});

test('Email axe: remontagem, desaparecimento e nova cadeia ancestral reiniciam prontidão', async () => {
  await check(scenario(t => ({ generation: t < 24 ? 'a' : 'b' })), 'scan-pass', 1, 48);
  await check(scenario(t => ({ mounted: !(t >= 24 && t < 700) })), 'scan-pass', 1, 720);
  await check(scenario(t => ({ parentBranch: t < 24 ? 'a' : 'b', parentOpacity: t >= 24 && t < 900 ? '.613' : '1' })), 'scan-pass', 1, 928);
});

test('Email axe: display contents ancestral e decoração contínua não bloqueiam', async () => {
  await check(scenario(() => ({ parentDisplay: 'contents', parentWidth: 0, parentHeight: 0,
    decorativeInfinite: true, decorativeOpacity: '.2' })), 'scan-pass', 1, 32);
});

test('Email axe: conteúdo oculto ou sem layout nunca produz aprovação vazia', async () => {
  for (const state of [{ targetDisplay: 'none' }, { parentVisibility: 'hidden' }, { targetWidth: 0 }]) {
    await check(scenario(() => state), 'readiness-timeout', 0, 10_000);
  }
});

test('Email axe: troca de tema iniciada depois do helper exige nova estabilidade', async () => {
  await check(scenario(t => ({ htmlTransition: t >= 24 && t < 900 })), 'scan-pass', 1, 928);
});

test('Email axe: nova animação enquanto axe está ocupado é verificada depois', async () => {
  await check(scenario(t => ({ axeBusy: t < 2000, targetOpacity: t >= 1800 && t < 2500 ? '.613' : '1' })), 'scan-pass', 1, 2528);
});

test('Email axe: chamada concorrente na próxima microtask não ultrapassa a checagem', async () => {
  await check(scenario(undefined, { competeAfterCheck: true }), 'scan-pass', 1, 32);
});

test('Email axe: contraste final inadequado chega à asserção de violações intacta', async () => {
  const result = await check(scenario(() => ({ textColor: [115, 121, 131] })), 'scan-axe-fail', 1, 32);
  assert.equal(result.scans[0].alpha, 1);
  assert.ok(result.scans[0].contrast < 4.5);
  assert.equal(result.error, 'Original violations assertion failed');
});

test('Email axe: exceções de leitura do DOM limpam timer e frame', async () => {
  for (const options of [{ throwSelector: true }, { throwStyle: true }]) {
    await check(scenario(undefined, options), 'dom-error', 0, 16);
  }
});

test('Email axe: exceção e rejeição da análise são propagadas sem nova tentativa', async () => {
  for (const throwAxe of ['sync', 'async']) {
    await check(scenario(undefined, { throwAxe }), 'axe-error', 1, 32);
  }
});

test('Email axe: prazo de prontidão funciona sem frames e nos limites do relógio', async () => {
  await check(scenario(undefined, { frameInterval: Infinity }), 'readiness-timeout', 0, 10_000);
  await check(scenario(t => ({ targetOpacity: t < 9968 ? '.613' : '1' })), 'scan-pass', 1, 9984);
  await check(scenario(t => ({ targetOpacity: t < 9990 ? '.613' : '1' })), 'readiness-timeout', 0, 10_000);
});

test('Email axe: análise que nunca retorna conserva o teto global e não repete scan', async () => {
  await check(scenario(undefined, { axeNeverResolves: true }), 'test-timeout', 1, 90_000);
});

test('Email axe: tema que nunca fica aplicado falha no teto global existente', async () => {
  await check(scenario(() => ({ htmlTransition: true })), 'theme-timeout', 0, 90_000);
});
