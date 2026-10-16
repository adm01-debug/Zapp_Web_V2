// N217 — Régua de cobertura de linhas dos helpers de autorização das Edge Functions.
//
// O que esta régua trava: a cobertura de linhas AGREGADA dos 5 helpers de
// autorização em `supabase/functions/_shared/` não pode ficar abaixo de 50%.
// É agregado (soma de LH / soma de LF), não mínimo por arquivo: `ai-auth.ts`
// está hoje em ~45% e a régua é um piso contra queda, não um teto por arquivo.
//
// Como mede (do zero, via deno, sem reaproveitar perfil antigo):
// 1. cria um diretório fresco de cobertura (mkdtemp, nunca /tmp fixo);
// 2. roda `deno test --coverage=<dir-fresco>` SÓ nos 5 testes listados em
//    TEST_FILES, com as MESMAS permissões da CI (--allow-env --allow-read
//    --allow-net=127.0.0.1). O exit code dos testes É propagado: teste
//    vermelho torna a medição INVÁLIDA e a guarda falha (nunca engole falha);
// 3. lê `deno coverage <dir> --lcov` e soma LF/LH só dos 5 HELPERS, casando
//    o caminho COMPLETO terminando em `/_shared/<helper>` (basename repetido
//    em outro diretório é ignorado — não há mistura de arquivos).
// O teste `ai-auth-service-path.test.ts` exercita `ai-auth.ts` e fica FORA
// da medição de propósito: incluí-lo infla o número sem provar a régua.
// Qualquer arquivo novo `*auth*.test.ts` que apareça em `__tests__` quebra o
// teste de classificação abaixo até ser listado em TEST_FILES ou em
// TESTES_AUTH_FORA_DA_MEDICAO — decisão explícita, nunca inclusão silenciosa.
//
// Reproduzível: o relatório `docs/audits/edge-functions-authz-coverage.md`
// não tem data, PID nem caminho temporário; duas medições seguidas geram
// bytes idênticos (o teste "bate com medição fresca" prova isso).
// Para regenerar o relatório depois de mudar os helpers ou os testes:
//   REGENERAR_EDGE_AUTHZ_COV=1 node scripts/ci/edge-coverage-authz.unit.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ESTE_ARQUIVO = fileURLToPath(import.meta.url);
const DIR_CI = path.dirname(ESTE_ARQUIVO);
const RAIZ = path.resolve(DIR_CI, '..', '..');

/** Piso da régua: cobertura de linhas agregada dos 5 helpers. */
export const MIN_LINE_COVERAGE_PCT = 50;

/** Os 5 helpers de autorização medidos (basenames em `_shared/`). */
export const HELPERS = [
  'ai-auth.ts',
  'ai-audio-authz.ts',
  'cron-secret-auth.ts',
  'evolution-control-authz.ts',
  'voice-copilot-authz.ts',
];

/** Os 5 testes que exercitam os helpers — e SÓ eles entram no `deno test`. */
export const TEST_FILES = [
  'supabase/functions/_shared/__tests__/ai-auth.test.ts',
  'supabase/functions/_shared/__tests__/ai-audio-authz.test.ts',
  'supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts',
  'supabase/functions/_shared/__tests__/evolution-control-authz.test.ts',
  'supabase/functions/_shared/__tests__/voice-copilot-authz.test.ts',
];

/**
 * Testes `*auth*` que existem no disco e ficam FORA da medição de propósito.
 * `ai-auth-service-path.test.ts` exercita o mesmo `ai-auth.ts` da régua e
 * contaminaria a conta; os demais cobrem outros módulos (webhook, runtime).
 */
export const TESTES_AUTH_FORA_DA_MEDICAO = [
  'ai-auth-service-path.test.ts',
  'gmail-reauth-required.test.ts', // reautorização OAuth Gmail, não helper de authz da régua
  'require-auth-profile-active.test.ts', // requireAuth em validation.ts, fora dos cinco helpers medidos
  'ai-audio-authz-runtime.test.ts',
  'webhook-auth-gates.test.ts',
  'webhook-auth-shadow.test.ts',
];

export const SHARED_DIR_REL = 'supabase/functions/_shared';
export const TESTS_DIR_REL = 'supabase/functions/_shared/__tests__';
export const DOCS_REL = 'docs/audits/edge-functions-authz-coverage.md';
export const DENO_CONFIG_REL = 'scripts/ci/deno.json';

/**
 * Só casa um `SF:` cujo caminho COMPLETO termina em `/_shared/<helper>` (o que
 * cobre `/supabase/functions/_shared/<helper>`). Devolve o basename do helper
 * medido ou `null` para qualquer outro arquivo — inclusive um basename
 * repetido em outro diretório, que NÃO pode somar no mesmo balde.
 */
export function chaveHelper(sfPath, helpers = HELPERS) {
  const p = String(sfPath).replace(/\\/g, '/');
  for (const h of helpers) if (p.endsWith(`/_shared/${h}`)) return h;
  return null;
}

/** Extrai LF/LH por helper medido, casando o caminho completo do LCOV. */
export function parseLcov(lcov, helpers = HELPERS) {
  const porArquivo = new Map();
  let helper = null;
  let lf = 0;
  let lh = 0;
  const descarrega = () => {
    if (helper === null) return;
    const anterior = porArquivo.get(helper) ?? { lf: 0, lh: 0 };
    porArquivo.set(helper, { lf: anterior.lf + lf, lh: anterior.lh + lh });
    helper = null;
    lf = 0;
    lh = 0;
  };
  for (const linha of lcov.split('\n')) {
    if (linha.startsWith('SF:')) {
      descarrega();
      helper = chaveHelper(linha.slice(3).trim(), helpers);
    } else if (linha.startsWith('LF:')) {
      lf = Number(linha.slice(3).trim());
    } else if (linha.startsWith('LH:')) {
      lh = Number(linha.slice(3).trim());
    } else if (linha.trim() === 'end_of_record') {
      descarrega();
    }
  }
  descarrega();
  return porArquivo;
}

/** Agrega LF/LH dos helpers: tabela por arquivo + total ponderado por linhas. */
export function resumirCobertura(porArquivo, helpers = HELPERS) {
  const porHelper = helpers.map((file) => {
    const { lf = 0, lh = 0 } = porArquivo.get(file) ?? {};
    return { file, lf, lh, pct: lf > 0 ? (lh / lf) * 100 : 0 };
  });
  const lf = porHelper.reduce((soma, h) => soma + h.lf, 0);
  const lh = porHelper.reduce((soma, h) => soma + h.lh, 0);
  return { porHelper, total: { lf, lh, pct: lf > 0 ? (lh / lf) * 100 : 0 } };
}

export function formatarPct(n) {
  return `${n.toFixed(1)}%`;
}

/** A régua: lista vazia = passou; com mensagem = falhou (pode falhar de verdade). */
export function avaliarRégua(totalPct, minimo = MIN_LINE_COVERAGE_PCT) {
  if (totalPct >= minimo) return [];
  return [
    `cobertura de linhas agregada dos helpers de authz: ${formatarPct(totalPct)} < mínimo ${formatarPct(minimo)}`,
  ];
}

export function montarArgsDenoTest(dirCobertura, repoRoot = RAIZ) {
  return [
    'test',
    '--config',
    path.join(repoRoot, DENO_CONFIG_REL),
    '--frozen',
    // Mesmas permissões que a CI (`.github/workflows/ci.yml`) dá aos testes
    // das Edge Functions. Faltar `--allow-read` deixa teste que lê o handler
    // do disco vermelho — e a guarda abaixo passa a reprovar por isso.
    '--allow-env',
    '--allow-read',
    '--allow-net=127.0.0.1',
    `--coverage=${dirCobertura}`,
    ...TEST_FILES.map((rel) => path.join(repoRoot, rel)),
  ];
}

/** Nomes de arquivos de teste vermelhos extraídos da saída do `deno test`. */
export function testesVermelhos(saida) {
  const nomes = new Set();
  for (const linha of String(saida).split('\n')) {
    const m = linha.match(/=>\s+(\S*\.test\.ts)/);
    if (m) nomes.add(m[1]);
  }
  return [...nomes].sort();
}

/** Vazio = testes verdes; mensagem = medição INVÁLIDA (torna a guarda vermelha). */
export function avaliarStatusTestes(status, saida = '') {
  if (status === 0) return [];
  const vermelhos = testesVermelhos(saida);
  const lista = vermelhos.length ? vermelhos.join(', ') : 'nenhum arquivo .test.ts na saída do deno';
  return [`deno test saiu com status ${status} — medição de cobertura inválida. Testes vermelhos: ${lista}`];
}

/**
 * Mede do zero: diretório fresco de cobertura, `deno test` só nos 5 testes,
 * `deno coverage --lcov`, soma só dos 5 helpers. Não reaproveita perfil.
 * Devolve também o status dos testes: teste vermelho invalida a medição e
 * quem chama tem de reprovar (não existe mais "número válido com teste quebrado").
 */
export function medirDoZero(repoRoot = RAIZ) {
  const dir = mkdtempSync(path.join(tmpdir(), 'edge-authz-cov-'));
  try {
    const teste = spawnSync('deno', montarArgsDenoTest(dir, repoRoot), {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
    });
    if (teste.error) throw new Error(`deno não executou: ${teste.error.message}`);
    const statusTestes = teste.status;
    // `deno test` detalha os vermelhos no stdout e o resumo no stderr: junto os dois.
    const saidaTestes = `${teste.stdout ?? ''}\n${teste.stderr ?? ''}`;
    const cobertura = spawnSync('deno', ['coverage', dir, '--lcov'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (cobertura.error) throw new Error(`deno coverage não executou: ${cobertura.error.message}`);
    if (cobertura.status !== 0) throw new Error(`deno test status ${statusTestes}: ${saidaTestes}\ndeno coverage falhou: ${cobertura.stderr}`);
    return {
      resumo: resumirCobertura(parseLcov(cobertura.stdout)),
      statusTestes,
      saidaTestes,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Relatório determinístico: sem data, sem PID, sem caminho temporário. */
export function renderRelatorio(resumo) {
  const linhas = [
    '# Cobertura de linhas — helpers de autorização das Edge Functions',
    '',
    `Régua N217: a cobertura de linhas agregada dos 5 helpers abaixo não pode ficar abaixo de ${formatarPct(MIN_LINE_COVERAGE_PCT)} (guarda em \`scripts/ci/edge-coverage-authz.unit.mjs\`, roda no \`node --test\`). Medição do zero via deno, sem reaproveitar perfil antigo.`,
    '',
    '| Arquivo | Linhas cobertas | Total de linhas | Cobertura |',
    '|---|---|---|---|',
  ];
  for (const h of resumo.porHelper) {
    linhas.push(`| ${h.file} | ${h.lh} | ${h.lf} | ${formatarPct(h.pct)} |`);
  }
  linhas.push(`| **Total** | **${resumo.total.lh}** | **${resumo.total.lf}** | **${formatarPct(resumo.total.pct)}** |`);
  linhas.push('');
  linhas.push('Testes medidos (só estes entram no `deno test` da régua):');
  linhas.push('');
  for (const t of TEST_FILES) linhas.push(`- \`${t}\``);
  linhas.push('');
  linhas.push(
    'Fora da medição de propósito: `supabase/functions/_shared/__tests__/ai-auth-service-path.test.ts` exercita o mesmo `ai-auth.ts` da régua e contaminaria a conta.',
  );
  linhas.push('');
  linhas.push('Como reproduzir:');
  linhas.push('');
  linhas.push('```');
  linhas.push('deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 --coverage=<dir-fresco> \\');
  for (const t of TEST_FILES) linhas.push(`  ${t} \\`);
  linhas.push('deno coverage <dir-fresco> --lcov');
  linhas.push('```');
  linhas.push('');
  return linhas.join('\n');
}

export function regenerarDocs(repoRoot = RAIZ) {
  const { resumo, statusTestes, saidaTestes } = medirDoZero(repoRoot);
  const falhas = avaliarStatusTestes(statusTestes, saidaTestes);
  if (falhas.length) throw new Error(`não gero docs com teste vermelho: ${falhas.join('; ')}`);
  writeFileSync(path.join(repoRoot, DOCS_REL), renderRelatorio(resumo));
  return resumo;
}

if (process.env.REGENERAR_EDGE_AUTHZ_COV === '1') {
  const resumo = regenerarDocs();
  console.log(`docs regenerado: total ${formatarPct(resumo.total.pct)}`);
  process.exit(0);
}

// ─── Testes da régua ────────────────────────────────────────────────────────

test('N217: parseLcov soma LF/LH e o agregado pondera por linhas', () => {
  const lcov = [
    'SF:/repo/supabase/functions/_shared/ai-auth.ts',
    'LF:59',
    'LH:27',
    'end_of_record',
    'SF:/repo/supabase/functions/_shared/voice-copilot-authz.ts',
    'LF:25',
    'LH:25',
    'end_of_record',
  ].join('\n');
  const resumo = resumirCobertura(parseLcov(lcov), ['ai-auth.ts', 'voice-copilot-authz.ts']);
  assert.equal(resumo.porHelper[0].pct.toFixed(1), '45.8');
  assert.equal(resumo.porHelper[1].pct.toFixed(1), '100.0');
  assert.equal(resumo.total.lf, 84);
  assert.equal(resumo.total.lh, 52);
  assert.equal(resumo.total.pct.toFixed(1), '61.9');
});

test('N217: parseLcov casa o caminho completo e ignora basename repetido fora de _shared', () => {
  const lcov = [
    // Mesmo basename, outro diretório: NÃO pode somar no balde do helper.
    'SF:/tmp/outro/dir/ai-auth.ts',
    'LF:999',
    'LH:999',
    'end_of_record',
    // Caminho cheio de _shared: entra.
    'SF:/repo/supabase/functions/_shared/ai-auth.ts',
    'LF:59',
    'LH:27',
    'end_of_record',
    // Forma alternativa `/_shared/<helper>` (sem o prefixo supabase/functions): entra.
    'SF:/repo/build/_shared/voice-copilot-authz.ts',
    'LF:25',
    'LH:25',
    'end_of_record',
  ].join('\n');
  const mapa = parseLcov(lcov);
  assert.deepEqual([...mapa.keys()].sort(), ['ai-auth.ts', 'voice-copilot-authz.ts']);
  const resumo = resumirCobertura(mapa, ['ai-auth.ts', 'voice-copilot-authz.ts']);
  assert.equal(resumo.porHelper[0].lf, 59, 'balde de ai-auth.ts contaminado por outro diretório');
  assert.equal(resumo.porHelper[0].lh, 27);
  assert.equal(resumo.total.lf, 84);
  assert.equal(chaveHelper('C:\\repo\\supabase\\functions\\_shared\\ai-auth.ts'), 'ai-auth.ts');
  assert.equal(chaveHelper('/tmp/outro/dir/ai-auth.ts'), null);
});

test('N217: status de teste vermelho invalida a medição (nunca engole falha)', () => {
  assert.deepEqual(avaliarStatusTestes(0, ''), []);
  const stderr = [
    ' ERRORS ',
    '',
    'matriz é exaustiva => ./supabase/functions/_shared/__tests__/evolution-control-authz.test.ts:93:6',
    '',
    'FAILED | 42 passed | 1 failed',
  ].join('\n');
  const falhas = avaliarStatusTestes(1, stderr);
  assert.equal(falhas.length, 1);
  assert.match(falhas[0], /status 1/);
  assert.match(falhas[0], /evolution-control-authz\.test\.ts/);
  assert.deepEqual(avaliarStatusTestes(1, 'sem arquivo aqui'), [
    'deno test saiu com status 1 — medição de cobertura inválida. Testes vermelhos: nenhum arquivo .test.ts na saída do deno',
  ]);
});

test('N217: a régua reprova abaixo de 50 e aprova no limite e acima', () => {
  assert.equal(avaliarRégua(49.9).length, 1);
  assert.match(avaliarRégua(49.9)[0], /< mínimo/);
  assert.deepEqual(avaliarRégua(50), []);
  assert.deepEqual(avaliarRégua(83.6), []);
});

test('N217: só os 5 testes da régua entram na medição; *auth* novo precisa de classificação', () => {
  const bases = TEST_FILES.map((t) => t.slice(t.lastIndexOf('/') + 1)).sort();
  assert.deepEqual(bases, [
    'ai-audio-authz.test.ts',
    'ai-auth.test.ts',
    'cron-secret-authz-l5.test.ts',
    'evolution-control-authz.test.ts',
    'voice-copilot-authz.test.ts',
  ]);
  for (const negado of TESTES_AUTH_FORA_DA_MEDICAO) {
    assert.ok(!TEST_FILES.some((t) => t.endsWith(`/${negado}`)), `${negado} não pode entrar na medição`);
  }
  // Varredura real do disco: todo teste *auth* tem de estar classificado.
  const emDisco = readdirSync(path.join(RAIZ, TESTS_DIR_REL)).filter((f) => /auth/i.test(f));
  const classificados = new Set([...bases, ...TESTES_AUTH_FORA_DA_MEDICAO]);
  for (const f of emDisco) {
    assert.ok(classificados.has(f), `teste *auth* sem classificação na régua: ${f}`);
  }
});

test('N217: HELPERS cobre exatamente os *auth*.ts de _shared', () => {
  const emDisco = readdirSync(path.join(RAIZ, SHARED_DIR_REL))
    .filter((f) => /^[^.].*auth.*\.ts$/.test(f))
    .sort();
  assert.deepEqual(emDisco, [...HELPERS].sort());
});

let medicaoCompartilhada = null;
function medicaoUmaVez() {
  if (medicaoCompartilhada === null) medicaoCompartilhada = medirDoZero();
  return medicaoCompartilhada;
}

test('N217: medição do zero via deno agrega >= 50% e inclui os 5 helpers', () => {
  const { resumo, statusTestes, saidaTestes } = medicaoUmaVez();
  const falhasStatus = avaliarStatusTestes(statusTestes, saidaTestes);
  assert.deepEqual(falhasStatus, [], `teste vermelho invalida a medição: ${falhasStatus.join('; ')}`);
  const falhas = avaliarRégua(resumo.total.pct);
  assert.deepEqual(falhas, [], `régua vermelha no código real: ${falhas.join('; ')}`);
  for (const file of HELPERS) {
    const linha = resumo.porHelper.find((h) => h.file === file);
    assert.ok(linha && linha.lf > 0, `${file} sem linhas medidas no LCOV`);
  }
});

test('N217: docs bate com medição fresca e segunda execução é idêntica', () => {
  const fresca = medirDoZero();
  const relatorio = renderRelatorio(fresca.resumo);
  assert.equal(
    renderRelatorio(medicaoUmaVez().resumo) === relatorio,
    true,
    'duas medições seguidas geram o mesmo relatório',
  );
  const emDisco = readFileSync(path.join(RAIZ, DOCS_REL), 'utf8');
  assert.equal(emDisco, relatorio, 'docs/audits/edge-functions-authz-coverage.md desatualizado: regenere com REGENERAR_EDGE_AUTHZ_COV=1');
  assert.ok(!emDisco.includes('/tmp/'), 'relatório não pode citar caminho temporário');
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(emDisco), 'relatório não pode ter carimbo de data/hora');
});
