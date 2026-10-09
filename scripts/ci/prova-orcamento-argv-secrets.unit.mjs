import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Prova do item 358 (R2-INF-011): a prova de orcamento nao pode deixar senha,
// anon key nem tokens em argv de processo, e a resposta do Auth nao pode ficar
// no diretorio de saida. Este teste EXECUTA o script de verdade com um curl e
// um jq falsos que gravam o proprio argv — sem rede e sem producao.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = process.env.PROVA_SCRIPT
  ? resolve(process.env.PROVA_SCRIPT)
  : join(REPO_ROOT, 'scripts/qa/prova-orcamento-rate-limit.sh');

const EMAIL = 'conta-sintetica@exemplo.invalid';
const SEGREDOS = {
  senha: 'SENHA-SINTETICA-f3a9c1d7',
  anonKey: 'ANON-KEY-SINTETICA-7b2d40e9',
  accessToken: 'ACCESS-TOKEN-SINTETICO-9e41b6c2',
  refreshToken: 'REFRESH-TOKEN-SINTETICO-5c08a3f1',
};
// Campos que a auditoria proibe no diretorio de saida (criterio f do cartao).
const CAMPOS_PROIBIDOS_NO_OUT = ['"access_token"', '"refresh_token"', '"user"'];

const CURL_FALSO = `#!/usr/bin/env bash
# curl falso da prova: nunca toca a rede. Grava o proprio argv (um por linha),
# captura o stdin recebido e devolve respostas sinteticas conforme a URL.
set -u
{
  printf '== curl ==\\n'
  printf '%s\\n' "$@"
} >> "\${ARGV_LOG:?ARGV_LOG ausente}"

stdin_recebido="$(cat || true)"
{
  printf '== curl stdin ==\\n'
  printf '%s\\n' "$stdin_recebido"
} >> "\${CURL_STDIN_LOG:?CURL_STDIN_LOG ausente}"

out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w|-X|-H|--config|--data|--data-binary|--data-raw|--data-ascii) shift 2 ;;
    http://*|https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done

if [[ -z "$out" ]]; then
  printf 'curl falso: chamada sem -o\\n' >&2
  exit 97
fi

if [[ "$url" == *"/auth/v1/token"* ]]; then
  if [[ "\${PROVA_FALHA_LOGIN:-}" == "1" ]]; then
    printf '%s' '{"error":"invalid_grant","error_description":"credencial sintetica recusada"}' > "$out"
    printf '400'
  else
    printf '%s' '{"access_token":"${SEGREDOS.accessToken}","refresh_token":"${SEGREDOS.refreshToken}","token_type":"bearer","expires_in":3600,"user":{"id":"usuario-sintetico"}}' > "$out"
    printf '200'
  fi
elif [[ "$url" == *"/functions/v1/"* ]]; then
  printf '%s' '{"category":"meme","confidence":0.99}' > "$out"
  printf '200'
elif [[ "$url" == *"/rest/v1/ai_usage_logs"* ]]; then
  printf '%s' '[{"request_id":"run-sintetico","status":"success","model":"fake"},{"request_id":"run-sintetico","status":"success","model":"fake"},{"request_id":"run-sintetico","status":"success","model":"fake"}]' > "$out"
  printf '200'
else
  printf '%s' '{"ok":true}' > "$out"
  printf '200'
fi
`;

const JQ_FALSO = `#!/usr/bin/env bash
# wrapper do jq real: registra o proprio argv (para auditar --arg com senha)
# e delega ao jq de verdade, resolvido antes de prepender o fakebin ao PATH.
set -u
{
  printf '== jq ==\\n'
  printf '%s\\n' "$@"
} >> "\${ARGV_LOG:?ARGV_LOG ausente}"
exec "\${JQ_REAL:?JQ_REAL ausente}" "$@"
`;

function cenario(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'prova-argv-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  chmodSync(raiz, 0o700);

  const fakebin = join(raiz, 'fakebin');
  const tmppriv = join(raiz, 'tmppriv'); // TMPDIR visto pelo script sob teste
  const outdir = join(raiz, 'out');
  mkdirSync(fakebin);
  mkdirSync(tmppriv);
  chmodSync(tmppriv, 0o755);

  const argvLog = join(raiz, 'argv.log');
  const stdinLog = join(raiz, 'stdin.log');
  writeFileSync(argvLog, '');
  writeFileSync(stdinLog, '');

  const jqReal = execFileSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).trim();
  assert.ok(jqReal, 'jq real nao encontrado no PATH (o script sob teste exige jq)');

  const curlFalso = join(fakebin, 'curl');
  const jqFalso = join(fakebin, 'jq');
  writeFileSync(curlFalso, CURL_FALSO);
  writeFileSync(jqFalso, JQ_FALSO);
  chmodSync(curlFalso, 0o755);
  chmodSync(jqFalso, 0o755);

  const tmpprivModeInicial = statSync(tmppriv).mode & 0o7777;

  return { raiz, fakebin, tmppriv, tmpprivModeInicial, outdir, argvLog, stdinLog, jqReal };
}

function rodar(c, { falhaLogin = false } = {}) {
  const env = {
    ...process.env,
    PROVA_PRODUCAO: 'sim',
    ZAPP_SUPABASE_URL: 'https://supabase-sintetico.exemplo.invalid',
    SUPABASE_ANON_KEY: SEGREDOS.anonKey,
    ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL: EMAIL,
    ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD: SEGREDOS.senha,
    TMPDIR: c.tmppriv,
    PATH: `${c.fakebin}:${process.env.PATH}`,
    ARGV_LOG: c.argvLog,
    CURL_STDIN_LOG: c.stdinLog,
    JQ_REAL: c.jqReal,
  };
  if (falhaLogin) env.PROVA_FALHA_LOGIN = '1';
  return spawnSync('bash', [SCRIPT, c.outdir], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Varre o diretorio de saida recursivamente e devolve a lista de violacoes:
// segredo sintetico ou campo proibido encontrado em arquivo publicavel.
function vazamentosNoOut(outdir) {
  const achados = [];
  const varrer = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        varrer(caminho);
        continue;
      }
      const texto = readFileSync(caminho, 'utf8');
      for (const [rotulo, valor] of Object.entries(SEGREDOS)) {
        if (texto.includes(valor)) achados.push(`${caminho} contem ${rotulo}`);
      }
      for (const campo of CAMPOS_PROIBIDOS_NO_OUT) {
        if (texto.includes(campo)) achados.push(`${caminho} contem campo proibido ${campo}`);
      }
    }
  };
  if (existsSync(outdir)) varrer(outdir);
  return achados;
}

test('sucesso: nenhum segredo em argv, corpo do login por stdin, saida redigida e exit 0', (t) => {
  const c = cenario(t);
  const r = rodar(c);

  assert.equal(
    r.status,
    0,
    `o script deveria terminar com codigo 0 no caminho de sucesso.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  );

  const argv = readFileSync(c.argvLog, 'utf8');
  for (const [rotulo, valor] of Object.entries(SEGREDOS)) {
    assert.ok(
      !argv.includes(valor),
      `argv de processo contem ${rotulo}: credencial vazou para a linha de comando (visivel em /proc e ps)`,
    );
  }

  const stdin = readFileSync(c.stdinLog, 'utf8');
  assert.ok(
    stdin.includes(SEGREDOS.senha),
    'o corpo do login (senha) nao chegou ao curl por stdin; deveria ir por --data-binary @-',
  );
  assert.ok(
    stdin.includes(EMAIL),
    'o corpo do login (email) nao chegou ao curl por stdin; deveria ir por --data-binary @-',
  );

  assert.deepEqual(
    vazamentosNoOut(c.outdir),
    [],
    'o diretorio de saida tem que ser publicavel: sem senha, anon key, tokens nem sessao Auth',
  );

  const console_ = r.stdout + r.stderr;
  for (const [rotulo, valor] of Object.entries(SEGREDOS)) {
    assert.ok(!console_.includes(valor), `o console vazou ${rotulo}`);
  }

  assert.equal(
    statSync(c.tmppriv).mode & 0o7777,
    c.tmpprivModeInicial,
    'o script nao pode alterar permissoes do TMPDIR fornecido pelo chamador',
  );

  assert.deepEqual(
    readdirSync(c.tmppriv),
    [],
    'o diretorio privado de trabalho deveria ter sido removido ao terminar (nada com token sobrevive)',
  );
});

test('falha de login: exit != 0, saida sem segredos e diretorio privado varrido', (t) => {
  const c = cenario(t);
  const r = rodar(c, { falhaLogin: true });

  assert.notEqual(
    r.status,
    0,
    `o script deveria falhar quando o login nao devolve access_token.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  );

  const argv = readFileSync(c.argvLog, 'utf8');
  for (const [rotulo, valor] of Object.entries(SEGREDOS)) {
    assert.ok(
      !argv.includes(valor),
      `argv de processo contem ${rotulo} mesmo no caminho de falha`,
    );
  }

  assert.deepEqual(
    vazamentosNoOut(c.outdir),
    [],
    'mesmo em falha o diretorio de saida nao pode conter senha, anon key nem tokens',
  );

  assert.equal(
    statSync(c.tmppriv).mode & 0o7777,
    c.tmpprivModeInicial,
    'o script nao pode alterar permissoes do TMPDIR fornecido pelo chamador mesmo em falha',
  );

  assert.deepEqual(
    readdirSync(c.tmppriv),
    [],
    'em falha tambem nada pode sobrar no diretorio privado (trap de limpeza em EXIT)',
  );
});
