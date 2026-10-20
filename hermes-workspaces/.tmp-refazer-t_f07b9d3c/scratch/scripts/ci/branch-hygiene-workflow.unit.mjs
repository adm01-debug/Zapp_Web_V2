// E91 (auditoria de GitHub Actions, 2026-10-01): o branch-hygiene-audit.yml
// publicava o relatorio SO no Job Summary, que morre com o run. A etapa pediu que
// ele tambem mantivesse uma issue aberta (historico consultavel) e que o corte de
// PR parado passasse de 14 dias por criacao para 7 dias sem push.
//
// Por que isto virou teste: a exigencia so' no texto do plano se perde na proxima
// edicao do YAML — e este arquivo ja' e' editado por varias etapas. O `actionlint`
// (verificacao oficial) valida sintaxe, nao o invariante de negocio: ele ficaria
// verde com o corte de volta em 14 dias ou com a issue removida.
//
// O caso do caminho do relatorio e' regressao real, nao hipotese: a primeira
// versao usava `mktemp` e o passo 2 morreu com "RELATORIO: unbound variable" —
// cada `run:` e' um shell novo, entao a variavel nao atravessa, so' o arquivo.
//
// t_ff817d9f (2026-10-05): a contagem de commits unicos usava
// `git cherry origin/main "$ref" 2>/dev/null | grep -c '^+' || true`. O `|| true`
// existe para tolerar o retorno 1 legitimo do `grep -c` (zero linhas), mas com
// `set -o pipefail` ele engolia tambem o retorno nao zero do proprio `git cherry`:
// branch impossivel de comparar entrava na lista de "candidatas a poda". A correcao
// valida o status do `git cherry` ANTES de contar linhas. Os dois ultimos testes
// rodam o `run:` real com um `git` dublado e provam os dois caminhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, mkdir, chmod, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = await readFile(new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url), 'utf8');

/** Blocos `run: |` do arquivo, com o numero da linha de abertura. */
function blocos(texto) {
  const linhas = texto.split('\n');
  const saida = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const abertura = /^(\s*)run:\s*\|\s*$/.exec(linhas[i]);
    if (!abertura) continue;
    const indent = abertura[1].length + 2;
    const corpo = [];
    let j = i + 1;
    for (; j < linhas.length; j += 1) {
      const atual = linhas[j];
      const recuo = atual.length - atual.trimStart().length;
      if (atual.trim() && recuo <= indent - 2) break;
      corpo.push(atual);
    }
    saida.push({ linha: i + 1, corpo: corpo.join('\n') });
    i = j - 1;
  }
  return saida;
}

const todos = blocos(workflow);

/** O bloco `run:` que gera o relatorio (o unico que chama `git cherry`). */
const blocoRelatorio = todos.find(({ corpo }) => corpo.includes('git cherry'));

test('E91: o relatorio vai para a issue, alem do Job Summary', () => {
  assert.match(workflow, /GITHUB_STEP_SUMMARY/, 'o Job Summary sumiu — ele era o comportamento anterior e deve continuar');
  assert.match(workflow, /gh issue edit/, 'falta o ramo de ATUALIZACAO da issue');
  assert.match(workflow, /gh issue create/, 'falta o ramo de CRIACAO da issue (primeira execucao)');
  assert.match(workflow, /startswith\("\[branch-hygiene\]"\)/, 'o upsert deve achar a issue aberta pelo marcador no titulo');
});

test('E91: o upsert e idempotente (procura a aberta antes de criar)', () => {
  const edicao = workflow.indexOf('gh issue edit');
  const criacao = workflow.indexOf('gh issue create');
  assert.ok(edicao > 0 && criacao > 0, 'os dois ramos precisam existir');
  assert.ok(
    /if\s*\[\s*-n\s+"\$EXISTENTE"\s*\]/.test(workflow),
    'a criacao precisa estar atras de um teste de existencia; sem isso cada semana abre outra issue',
  );
});

test('E91: PR parado e medido por updatedAt com corte de 7 dias', () => {
  assert.match(workflow, /updatedAt/, 'o corte passou a ser por ultimo movimento, nao por criacao');
  assert.match(workflow, /7\*86400/, 'o corte de 7 dias sumiu');
  assert.doesNotMatch(workflow, /14\*86400/, 'o corte antigo de 14 dias voltou');
});

test('E91: o passo que publica recalcula o caminho do relatorio', () => {
  // Cada `run:` e' um shell novo: se o passo 2 nao redefinir o caminho, ele morre
  // com "unbound variable" (regressao observada). Precisa haver a atribuicao nos
  // DOIS passos, e o passo de publicacao tem que falhar alto se o arquivo faltar.
  const atribuicoes = (workflow.match(/RELATORIO="\$RUNNER_TEMP\//g) ?? []).length;
  assert.ok(atribuicoes >= 2, `o caminho do relatorio deve ser definido nos 2 passos, achei ${atribuicoes}`);
  assert.match(workflow, /if\s*\[\s*!\s*-s\s+"\$RELATORIO"\s*\]/, 'sem a checagem, um relatorio ausente viraria issue vazia em silencio');
  assert.doesNotMatch(workflow, /RELATORIO="\$\(mktemp\)"/, 'mktemp nao sobrevive ao fim do shell do passo');
});

test('E91: o ref simbolico `origin` nao entra na lista de branches', () => {
  // `git branch -r` lista `origin` (o proprio remote) alem de `origin/<branch>`.
  // Ele apareceu como "patch-equivalente a main" na primeira execucao real.
  for (const { linha, corpo } of todos) {
    if (!corpo.includes('git branch -r')) continue;
    assert.match(
      corpo,
      /grep -v '\^origin\$'/,
      `linha ${linha}: o loop de branches nao filtra o ref simbolico \`origin\``,
    );
  }
});

test('t_ff817d9f: a contagem de commits unicos nao engole falha do git cherry', () => {
  // Invariante estatico: o `|| true` colado no `grep -c` era o mascaramento.
  // Comentarios citam a expressao antiga de proposito, entao so' as linhas que
  // executam entram na checagem.
  assert.ok(blocoRelatorio, 'nao achei o bloco `run:` que gera o relatorio');
  const executaveis = blocoRelatorio.corpo
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(
    executaveis,
    /git cherry[^\n]*\|\s*grep -c[^\n]*\|\|\s*true/,
    'o `|| true` depois do `grep -c` mascara falha real do git cherry (bug t_ff817d9f)',
  );
  assert.match(
    executaveis,
    /git cherry origin\/main "\$ref"/,
    'o git cherry tem de continuar comparando origin/main com o ref do loop',
  );
});

// ---------------------------------------------------------------------------
// Regressao comportamental: roda o `run:` real do passo "Gerar relatorio" com um
// `git` dublado, provando que (a) zero linhas `+` mantem a branch como equivalente
// e (b) retorno nao zero do git cherry derruba a auditoria em vez de classificar.
// ---------------------------------------------------------------------------

function executar(caminhoScript, env) {
  return new Promise((resolve) => {
    execFile('bash', [caminhoScript], { env, encoding: 'utf8' }, (erro, stdout, stderr) => {
      resolve({ status: erro ? (typeof erro.code === 'number' ? erro.code : 1) : 0, stdout, stderr });
    });
  });
}

/**
 * Executa o corpo do passo com `git`/`gh` dublados.
 * `cherryMode`: 'ok' (sempre sucesso) ou 'falha' (origin/feature-quebrada devolve 128).
 */
async function rodarPassoRelatorio(cherryMode) {
  const raiz = await mkdtemp(join(tmpdir(), 'branch-hygiene-'));
  const bin = join(raiz, 'bin');
  await mkdir(bin, { recursive: true });

  const gitDublado = join(bin, 'git');
  await writeFile(gitDublado, `#!/usr/bin/env bash
case "$1" in
  fetch) exit 0 ;;
  branch) printf 'origin/HEAD\\norigin/main\\norigin/feature-equiv\\norigin/feature-quebrada\\n' ;;
  cherry)
    if [ "$CHERRY_MODE" = "falha" ] && [ "$3" = "origin/feature-quebrada" ]; then
      echo "fatal: cherry: nao foi possivel comparar $2 e $3" >&2
      exit 128
    fi
    exit 0 ;;
  log) printf '0\\n' ;;
  *) exit 0 ;;
esac
`);
  await chmod(gitDublado, 0o755);

  const ghDublado = join(bin, 'gh');
  await writeFile(ghDublado, '#!/usr/bin/env bash\nexit 0\n');
  await chmod(ghDublado, 0o755);

  const script = join(raiz, 'passo.sh');
  await writeFile(script, blocoRelatorio.corpo);

  const resumo = join(raiz, 'summary.md');
  await writeFile(resumo, '');
  const tmp = join(raiz, 'tmp');
  await mkdir(tmp, { recursive: true });

  const resultado = await executar(script, {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    RUNNER_TEMP: raiz,
    GITHUB_STEP_SUMMARY: resumo,
    REPO: 'Promo-Brindes/Zapp_Web_V2',
    GH_TOKEN: 'token-de-teste',
    CHERRY_MODE: cherryMode,
    TMPDIR: tmp,
  });

  return { ...resultado, raiz, resumo: await readFile(resumo, 'utf8') };
}

test('t_ff817d9f: git cherry sem commits unicos mantem a branch como equivalente', async () => {
  const r = await rodarPassoRelatorio('ok');
  try {
    assert.equal(r.status, 0, `o passo deveria terminar verde com git cherry OK\nstderr: ${r.stderr}`);
    const equivalentes = r.resumo.split('### Sem commit ha mais de 30 dias')[0];
    assert.match(
      equivalentes,
      /feature-equiv/,
      'zero commits unicos e equivalencia valida: a branch tem de continuar na lista de candidatas a poda',
    );
  } finally {
    await rm(r.raiz, { recursive: true, force: true });
  }
});

test('t_ff817d9f: falha do git cherry derruba a auditoria em vez de classificar como equivalente', async () => {
  const r = await rodarPassoRelatorio('falha');
  try {
    assert.notEqual(r.status, 0, 'git cherry com retorno nao zero tem de encerrar o passo com status != 0');
    assert.match(r.stderr, /origin\/feature-quebrada/, 'o erro precisa citar o ref que nao pode ser comparado');
    assert.doesNotMatch(
      r.resumo,
      /feature-quebrada/,
      'branch impossivel de comparar nao pode ser publicada como patch-equivalente',
    );
  } finally {
    await rm(r.raiz, { recursive: true, force: true });
  }
});
