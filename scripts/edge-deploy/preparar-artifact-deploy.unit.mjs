import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, copyFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// R2-INF-002: este teste EXECUTA o passo real do workflow — o shell que monta o
// diretorio publicavel do artifact de deploy (scripts/edge-deploy/
// preparar-artifact-deploy.sh), o MESMO arquivo que deploy-functions.yml chama, com
// o redigir-log.mjs real. Foi o que faltava na primeira tentativa: assertar o YAML
// nao exercita `find`/`cp`/`grep -qF`/`mv`.
const raiz = new URL('../../', import.meta.url).pathname;
const SCRIPT = new URL('./preparar-artifact-deploy.sh', import.meta.url).pathname;
// Amostra montada em tempo de execucao: nada com cara de segredo real no arquivo
// (gitleaks varre o repo e um literal com prefixo de credencial vira achado falso).
const SEGREDO = ['sbp', 'teste', 'ficticio', 'nao', 'real'].join('_');

function cenario({ log, extras = {} } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'preparar-artifact-'));
  const origem = join(base, 'edge-deployment-evidence');
  mkdirSync(origem, { recursive: true });
  writeFileSync(join(origem, 'edge-deployment-attestation.json'), '{"function_count":3}\n');
  writeFileSync(join(origem, 'edge-smoke-evidence.json'), '{"summary":{"passed":3,"total":3}}\n');
  for (const [nome, conteudo] of Object.entries(extras)) writeFileSync(join(origem, nome), conteudo);
  if (log !== undefined) writeFileSync(join(origem, 'deploy-output.log'), log);
  return { base, origem, destino: join(base, 'edge-deployment-evidence-public') };
}

/** Roda o script do workflow como o passo roda (bash, com RUNNER_TEMP da base). */
function rodar(base, env = {}) {
  return spawnSync('bash', [SCRIPT], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: base, REDIGIR_LOG_BASE: base, ...env },
  });
}

const lerSe = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

test('R2-INF-002: com a redacao OK, o diretorio publicavel tem o log redigido e as demais evidencias', () => {
  const { base, origem, destino } = cenario({
    log: `executando deploy\ncurl 'https://x.functions.supabase.co/f?access_token=${SEGREDO}&x=1'\n`,
  });

  const r = rodar(base, { SUPABASE_ACCESS_TOKEN: SEGREDO });
  assert.equal(r.status, 0, `o script tem de sair com 0 (stderr: ${r.stderr})`);

  // (a) as demais evidencias chegam ao diretorio publicavel
  assert.deepEqual(
    readdirSync(destino).sort(),
    ['deploy-output.log', 'edge-deployment-attestation.json', 'edge-smoke-evidence.json'],
    'sobra evidencia para publicar, com o log redigido',
  );

  // (b) o log publicado nao tem o valor nem a chave do token
  const publicado = lerSe(join(destino, 'deploy-output.log'));
  assert.equal(publicado.includes(SEGREDO), false, 'o valor do segredo nao pode ir para o artifact');
  assert.doesNotMatch(publicado, /access[_%-]?token/i, 'a chave access_token nao pode sobrar no artifact');
  assert.ok(publicado.includes('executando deploy'), 'o resto do log tem de sobreviver (diagnostico)');

  // (c) o valor nunca e' impresso no log do run
  assert.equal(r.stdout.includes(SEGREDO), false, 'o valor nao pode aparecer no stdout');
  assert.equal(r.stderr.includes(SEGREDO), false, 'o valor nao pode aparecer no stderr');

  // (d) o diretorio de evidencia ORIGINAL segue com o log bruto — ele nao e' o alvo do
  // upload (o alvo mudou para o -public); nada aqui e' publicado
  assert.ok(readFileSync(join(origem, 'deploy-output.log'), 'utf8').includes(SEGREDO));
});

test('R2-INF-002: falha do redator aborta e NADA do log bruto entra no diretorio publicavel', () => {
  const bruto = `curl 'https://x.functions.supabase.co/f?access_token=${SEGREDO}'\n`;
  const { base, destino } = cenario({ log: bruto });

  // Injecao real: base de confinamento apontando para OUTRO diretorio. O redigir-log.mjs
  // real recusa o caminho de staging (exit 2) e o `set -e` do script aborta antes do mv.
  const r = rodar(base, {
    SUPABASE_ACCESS_TOKEN: SEGREDO,
    REDIGIR_LOG_BASE: join(base, 'edge-deployment-evidence'),
  });

  assert.notEqual(r.status, 0, 'falha do redator tem de sair com erro: o passo do workflow publica so no exit 0');
  assert.equal(existsSync(join(destino, 'deploy-output.log')), false, 'o log bruto nao pode chegar ao diretorio publicado');
  // e o valor nao vaza para nenhum arquivo publicavel
  const publicados = existsSync(destino) ? readdirSync(destino) : [];
  for (const nome of publicados) {
    assert.equal(readFileSync(join(destino, nome), 'utf8').includes(SEGREDO), false, `${nome} nao pode conter o segredo`);
  }
});

test('R2-INF-002: sobra do valor do segredo no log redigido bloqueia o artifact (fail-closed)', () => {
  // O redator nao toca valor com menos de 8 caracteres (trocar texto comum seria pior).
  // Se o segredo configurado for curto e aparecer SEM a chave, ele sobrevive a redacao —
  // e' exatamente o caso que o gate de residuo por VALOR tem de barrar.
  const curto = 'k9x2';
  const { base, destino } = cenario({ log: `curl -H 'Authorization: Bearer ${curto}' https://x/y\n` });

  const r = rodar(base, { SUPABASE_ACCESS_TOKEN: curto });

  assert.notEqual(r.status, 0, 'residuo do valor tem de abortar o passo');
  assert.equal(existsSync(join(destino, 'deploy-output.log')), false, 'log com residuo nao pode ser publicado');
  assert.equal(
    (r.stdout + r.stderr).includes(curto),
    false,
    'a checagem de residuo nao pode imprimir o valor (grep -qF)',
  );
});

test('R2-INF-002: contornos — sem log e sem diretorio de evidencia nao quebram o passo', () => {
  // Deploy que falhou antes de gerar o log: as demais evidencias ainda vao, sem log.
  const semLog = cenario({});
  const r1 = rodar(semLog.base, { SUPABASE_ACCESS_TOKEN: SEGREDO });
  assert.equal(r1.status, 0, `sem log o passo tem de sair com 0 (stderr: ${r1.stderr})`);
  assert.equal(existsSync(join(semLog.destino, 'deploy-output.log')), false);
  assert.ok(existsSync(join(semLog.destino, 'edge-deployment-attestation.json')));

  // Nada coletado: o diretorio publicavel fica vazio (o upload sai com warn) e o passo nao falha.
  const base = mkdtempSync(join(tmpdir(), 'preparar-artifact-vazio-'));
  const r2 = rodar(base, { SUPABASE_ACCESS_TOKEN: SEGREDO });
  assert.equal(r2.status, 0, `sem evidencia o passo tem de sair com 0 (stderr: ${r2.stderr})`);
  assert.equal(readdirSync(join(base, 'edge-deployment-evidence-public')).length, 0);
});

/** Shell do passo, lido do proprio YAML (e' ele que roda no runner). */
function shellDoPasso() {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-functions.yml', import.meta.url), 'utf8');
  const inicio = workflow.indexOf('- name: Limpar segredos do log de deploy');
  const fim = workflow.indexOf('- name: Arquivar manifesto, atestado e smokes');
  assert.ok(inicio > 0 && fim > inicio, 'o passo de limpeza tem de existir antes do upload');
  const bloco = workflow.slice(inicio, fim);
  const marca = '        run: |\n';
  const pos = bloco.indexOf(marca);
  assert.ok(pos > 0, 'o passo de limpeza tem de ter um run: |');
  const corpo = [];
  for (const linha of bloco.slice(pos + marca.length).split('\n')) {
    if (!linha.startsWith('          ')) break;
    corpo.push(linha.slice(10));
  }
  return corpo.join('\n');
}

test('R2-INF-002: o shell REAL do passo (extraido do YAML) so publica o log redigido', () => {
  // ELO: nao basta o script estar certo — o passo do workflow tem de executa-lo.
  // Aqui o shell e' lido do YAML e rodado com bash, no layout do runner
  // ($RUNNER_TEMP/edge-tooling/scripts/edge-deploy) e com os scripts reais.
  const shell = shellDoPasso();
  const base = mkdtempSync(join(tmpdir(), 'preparar-artifact-passo-'));
  const tooling = join(base, 'edge-tooling', 'scripts', 'edge-deploy');
  mkdirSync(tooling, { recursive: true });
  for (const nome of ['preparar-artifact-deploy.sh', 'redigir-log.mjs']) {
    copyFileSync(new URL(`./${nome}`, import.meta.url), join(tooling, nome));
  }
  const origem = join(base, 'edge-deployment-evidence');
  const destino = join(base, 'edge-deployment-evidence-public');
  mkdirSync(origem, { recursive: true });
  writeFileSync(join(origem, 'deploy-output.log'), `curl 'https://x.functions.supabase.co/f?access_token=${SEGREDO}'\n`);
  writeFileSync(join(origem, 'edge-smoke-evidence.json'), '{"summary":{"passed":1,"total":1}}\n');

  const rodarPasso = (env) =>
    spawnSync('bash', ['-c', shell], {
      cwd: raiz,
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: base, REDIGIR_LOG_BASE: base, ...env },
    });

  // caminho padrao: o passo termina com 0 e o diretorio publicavel fica redigido
  const ok = rodarPasso({ SUPABASE_ACCESS_TOKEN: SEGREDO });
  assert.equal(ok.status, 0, `o shell do passo tem de sair com 0 (stderr: ${ok.stderr})`);
  const publicado = readFileSync(join(destino, 'deploy-output.log'), 'utf8');
  assert.equal(publicado.includes(SEGREDO), false, 'o artifact publicado nao pode conter o valor do segredo');

  // mesma falha do redator, do ponto de vista do passo: base de confinamento errada
  rmSync(join(destino, 'deploy-output.log'));
  const falha = rodarPasso({ SUPABASE_ACCESS_TOKEN: SEGREDO, REDIGIR_LOG_BASE: origem });
  assert.notEqual(falha.status, 0, 'o passo tem de falhar (e o upload, que exige outcome success, nao publica)');
  assert.equal(existsSync(join(destino, 'deploy-output.log')), false, 'nada do log bruto pode ficar no diretorio publicado');
});
