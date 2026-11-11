#!/usr/bin/env node
// CI local: roda na máquina os MESMOS passos dos workflows do GitHub, lendo os
// próprios .github/workflows/*.yml (nada de cópia de comandos que envelhece).
//
// Uso:
//   npm run ci:local                          # ci.yml + db-guard.yml completos
//   npm run ci:local -- --rapido              # unit-tests só dos arquivos mudados nos commits
//   npm run ci:local -- --job typecheck,build # só esses jobs
//   npm run ci:local -- --workflow ci         # só ci.yml (aceita: ci, db-guard, e2e-talkx ...)
//   npm run ci:local -- --listar              # mostra workflows/jobs/passos sem rodar
//   npm run ci:local -- --incluir-nao-commitado  # testa também o que não foi commitado
//   npm run ci:local -- --evento workflow_dispatch [--input chave=valor]
//   npm run ci:local -- --base origin/main    # base de comparação (padrão)
//
// Cada execução roda num CLONE DESCARTÁVEL do HEAD commitado (nada escreve no
// .git real) e cada job tem HOME, TMPDIR e RUNNER_TEMP próprios. Ctrl-C limpa
// containers, processos e temporários. Detalhes: docs/ci/CI_LOCAL.md.
//
// Saída: 0 = tudo o que rodou passou; 1 = algum job falharia no GitHub;
//        2 = uso inválido ou ambiente sem base; 3 = nenhum job rodou.

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  mkdtempSync,
  rmSync,
  cpSync,
  copyFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  avaliarCondicao,
  avaliarBooleano,
  avaliarMinutos,
  avaliarValor,
  interpolar,
  expandirMatriz,
  ordenarJobs,
  lerArquivoEnv,
  comandoShell,
  extensaoShell,
  separarOpcoesDocker,
  portaLocal,
  arquivosDoDiffZ,
  arquivosParaVitestRelated,
  comandosComSudo,
  mascarar,
  ExpressaoNaoSuportada,
  planoHomeIsolado,
  paraTexto,
} from './ci-local-lib.mjs';

class ErroUso extends Error {}

const ORIGEM = resolve(
  spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || '.'
);
const PADRAO_WORKFLOWS = ['ci', 'db-guard'];
const EVENTOS = ['pull_request', 'push', 'workflow_dispatch'];
const TIMEOUT_JOB_PADRAO_MIN = 360; // padrão do GitHub

// ------------------------------------------------------------- limpeza global
// Tudo o que a execução cria fica registrado aqui; SIGINT/SIGTERM e o finally
// do main derrubam containers, matam os grupos de processos e apagam os temporários.
const limpeza = { grupos: new Set(), containers: new Set(), dirs: new Set(), marca: null };

function matarGrupo(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* grupo já terminou */
  }
}

/**
 * Mata todo processo que herdou a marca `chave=valor` no ambiente (órfãos em
 * segundo plano, inclusive os que mudaram de grupo). Usa a marca, e não o PGID,
 * para nunca acertar um processo alheio que reaproveitou o número.
 */
function matarMarcados(chave, valor) {
  const marca = `${chave}=${valor}`;
  let pids = [];
  try {
    pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  } catch {
    return;
  }
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    let environ;
    try {
      environ = readFileSync(`/proc/${pid}/environ`, 'latin1');
    } catch {
      continue;
    }
    if (environ.split('\0').includes(marca)) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        /* já saiu */
      }
    }
  }
}

function derrubarContainer(nome) {
  spawnSync('docker', ['rm', '-f', nome], { stdio: 'ignore' });
  limpeza.containers.delete(nome);
}

function limparTudo() {
  for (const g of limpeza.grupos) matarGrupo(g);
  limpeza.grupos.clear();
  if (limpeza.marca) matarMarcados('CI_LOCAL_RUN', limpeza.marca);
  for (const c of [...limpeza.containers]) derrubarContainer(c);
  for (const d of limpeza.dirs) rmSync(d, { recursive: true, force: true });
  limpeza.dirs.clear();
}

let interrompido = false;
for (const [sinal, codigo] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
]) {
  process.on(sinal, () => {
    if (interrompido) return;
    interrompido = true;
    console.error(`\n${sinal}: interrompido — limpando containers, processos e temporários...`);
    limparTudo();
    process.exit(codigo);
  });
}

// ---------------------------------------------------------------- argumentos
function lerArgs(argv) {
  const a = {
    workflows: null,
    jobs: null,
    rapido: false,
    listar: false,
    incluirNaoCommitado: false,
    base: 'origin/main',
    evento: 'pull_request',
    inputs: {},
  };
  const valor = (i, nome) => {
    const v = argv[i];
    if (v === undefined || v === '' || v.startsWith('--'))
      throw new ErroUso(`${nome} precisa de um valor`);
    return v;
  };
  const lista = (s, nome) => {
    const l = s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!l.length) throw new ErroUso(`${nome} precisa de um valor`);
    return l;
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--rapido') a.rapido = true;
    else if (x === '--listar') a.listar = true;
    else if (x === '--incluir-nao-commitado') a.incluirNaoCommitado = true;
    else if (x === '--workflow') a.workflows = lista(valor(++i, x), x);
    else if (x === '--job') a.jobs = lista(valor(++i, x), x);
    else if (x === '--base') a.base = valor(++i, x);
    else if (x === '--evento') {
      a.evento = valor(++i, x);
      if (!EVENTOS.includes(a.evento))
        throw new ErroUso(`--evento aceita: ${EVENTOS.join(', ')} (recebi "${a.evento}")`);
    } else if (x === '--input') {
      const kv = valor(++i, x);
      const eq = kv.indexOf('=');
      if (eq <= 0) throw new ErroUso(`--input espera chave=valor (recebi "${kv}")`);
      a.inputs[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (x === '-h' || x === '--help') {
      const linhas = readFileSync(new URL(import.meta.url), 'utf8').split('\n');
      const fim = linhas.findIndex((l, k) => k > 0 && !l.startsWith('//'));
      console.log(
        linhas
          .slice(1, fim)
          .map((l) => l.replace(/^\/\/ ?/, ''))
          .join('\n')
      );
      process.exit(0);
    } else throw new ErroUso(`argumento desconhecido: ${x} (use --help)`);
  }
  return a;
}

// ------------------------------------------------------------------- contexto
function git(...args) {
  const r = spawnSync('git', args, { cwd: ORIGEM, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function executar(cmd, args, opcoes = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...opcoes });
  if (r.status !== 0) {
    const msg = (r.stderr || r.error?.message || '').toString().trim().split('\n').slice(-3);
    throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} falhou: ${msg.join(' | ')}`);
  }
  return r.stdout;
}

function carregarSegredos() {
  const arq = join(ORIGEM, '.env.ci.local');
  let doArquivo = {};
  if (existsSync(arq)) {
    try {
      doArquivo = lerArquivoEnv(readFileSync(arq, 'utf8').replace(/^\s*#.*$/gm, ''));
    } catch (e) {
      throw new ErroUso(`.env.ci.local inválido: ${e.message}`);
    }
  }
  const usados = new Set(Object.values(doArquivo).filter(Boolean));
  const proxy = new Proxy(
    {},
    {
      get: (_, k) => {
        if (typeof k !== 'string') return undefined;
        const v = process.env[k] ?? doArquivo[k];
        if (v) usados.add(v);
        return v;
      },
    }
  );
  return { proxy, valores: () => [...usados] };
}

function contextoGithub(args, ws) {
  const head = git('rev-parse', 'HEAD').out;
  const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').out;
  const branch = ramo && ramo !== 'HEAD' ? ramo : '';
  const mb = git('merge-base', args.base, 'HEAD');
  if (!mb.ok || !mb.out) {
    if (!args.listar)
      throw new ErroUso(
        `sem merge-base entre ${args.base} e HEAD (base inexistente ou repositório raso?). ` +
          'Rode `git fetch origin` (ou `git fetch --unshallow origin`) e tente de novo.'
      );
  }
  const baseSha = mb.out;
  const evento =
    args.evento === 'pull_request'
      ? {
          pull_request: {
            draft: false,
            base: { sha: baseSha, ref: 'main' },
            head: { sha: head, ref: branch },
          },
        }
      : { inputs: args.inputs };
  return {
    event_name: args.evento,
    sha: head,
    ref: `refs/heads/${branch || 'HEAD'}`,
    head_ref: args.evento === 'pull_request' ? branch : '',
    base_ref: args.evento === 'pull_request' ? 'main' : '',
    workspace: ws,
    repository: 'adm01-debug/Zapp_Web_V2',
    repository_owner: 'adm01-debug',
    token: '',
    run_id: 'local',
    run_attempt: '1',
    event: evento,
  };
}

/** Clone descartável do HEAD: os passos (git fetch --depth, git config...) não tocam o .git real. */
function prepararWorkspace(runRoot, gh, args, avisos, log) {
  const ws = join(runRoot, 'workspace');
  const comum = resolve(ORIGEM, git('rev-parse', '--git-common-dir').out);
  executar('git', ['clone', '--quiet', '--shared', '--no-checkout', comum, ws]);
  executar('git', [
    '-C',
    ws,
    'fetch',
    '--quiet',
    '--no-tags',
    comum,
    '+refs/remotes/origin/*:refs/remotes/origin/*',
  ]);
  executar('git', ['-C', ws, 'checkout', '--quiet', '--detach', gh.sha]);
  const url = git('config', '--get', 'remote.origin.url');
  if (url.ok && url.out) executar('git', ['-C', ws, 'remote', 'set-url', 'origin', url.out]);

  // .ci-local/ (logs desta execução) nunca conta como mudança do working tree.
  const sujo = git('status', '--porcelain', '--untracked-files=all', '--', '.', ':!.ci-local').out;
  if (sujo) {
    const n = sujo.split('\n').length;
    if (args.incluirNaoCommitado) {
      const diff = spawnSync('git', ['-C', ORIGEM, 'diff', '--binary', 'HEAD'], {
        maxBuffer: 1 << 30,
      });
      if (diff.status !== 0) throw new Error('git diff do working tree falhou');
      if (diff.stdout.length)
        executar('git', ['-C', ws, 'apply', '--binary', '--whitespace=nowarn'], {
          input: diff.stdout,
          encoding: undefined,
        });
      const novos = arquivosDoDiffZ(
        executar('git', ['-C', ORIGEM, 'ls-files', '-z', '--others', '--exclude-standard', '--', '.', ':!.ci-local'])
      );
      for (const f of novos) {
        mkdirSync(dirname(join(ws, f)), { recursive: true });
        copyFileSync(join(ORIGEM, f), join(ws, f));
      }
      avisos.add(`--incluir-nao-commitado: ${n} arquivo(s) do working tree entraram no teste`);
    } else {
      avisos.add(
        `testado o HEAD commitado (${gh.sha.slice(0, 9)}); ${n} arquivo(s) modificado(s)/novo(s) ` +
          'NÃO entraram — use --incluir-nao-commitado para incluí-los'
      );
    }
  }
  if (existsSync(join(ws, 'bun.lock')) || existsSync(join(ws, 'bun.lockb'))) {
    log('📦 bun install --frozen-lockfile no clone descartável...');
    executar('bun', ['install', '--frozen-lockfile', '--ignore-scripts', '--silent'], { cwd: ws });
  }
  return ws;
}

function sitePackagesDoUsuario() {
  const r = spawnSync('python3', ['-c', 'import site; print(site.getusersitepackages())'], {
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

function prepararHome(homeJob, plano) {
  mkdirSync(join(homeJob, '.local', 'bin'), { recursive: true });
  for (const c of plano.copias) {
    mkdirSync(dirname(c.destino), { recursive: true });
    const ligar = new Set(c.ligar ?? []);
    cpSync(c.origem, c.destino, {
      recursive: true,
      dereference: false,
      filter: (src) => !ligar.has(src.slice(c.origem.length + 1).split('/')[0]),
    });
    for (const nome of ligar) {
      const alvo = join(c.origem, nome);
      if (existsSync(alvo)) symlinkSync(alvo, join(c.destino, nome));
    }
  }
}

// --------------------------------------------------- equivalentes de `uses:`
// Steps `uses:` que fazem VERIFICAÇÃO ganham equivalente local; os de
// infraestrutura (checkout, setup-*, cache, upload) não se aplicam à máquina.
function equivalenteLocal(uses, step, gh) {
  const acao = uses.split('@')[0];
  const base = gh.event.pull_request?.base?.sha;
  if (acao === 'gitleaks/gitleaks-action' && base) {
    return {
      desc: 'gitleaks (equivalente local)',
      cmd: `gitleaks git --no-banner --log-opts="${base}..HEAD"`,
    };
  }
  if (acao === 'actions/github-script' && /Rejeitar edicao de migration/i.test(step.name ?? '') && base) {
    // Mesmo critério do workflow: só 'modified' em supabase/migrations/*.sql.
    return {
      desc: 'migration existente editada? (equivalente local)',
      cmd:
        `m=$(git diff --diff-filter=M --name-only "${base}"...HEAD -- 'supabase/migrations/*.sql'); ` +
        `if [ -n "$m" ]; then echo "::error::migration já existente editada:"; echo "$m"; exit 1; fi; echo "nenhuma migration existente editada"`,
    };
  }
  return null;
}

// ------------------------------------------------------------------- docker
async function subirServicos(job, jobId, ctx, log, res, containersJob) {
  for (const [svc, def] of Object.entries(job.services ?? {})) {
    const nome = `ci-local-${jobId}-${svc}-${process.pid}`;
    const env = [];
    for (const [k, v] of Object.entries(def.env ?? {})) {
      const r = interpolar(v, ctx);
      if (r.erros.length) throw new Error(`env ${k} do serviço ${svc}: ${r.erros.join('; ')}`);
      env.push('-e', `${k}=${r.texto}`);
    }
    const portas = (def.ports ?? []).flatMap((p) => {
      const local = portaLocal(interpolar(p, ctx).texto);
      res.avisos.add(`serviço ${svc}: porta publicada no host (${local})`);
      return ['-p', local];
    });
    const opcoes = separarOpcoesDocker(interpolar(def.options ?? '', ctx).texto);
    const imagem = interpolar(def.image, ctx).texto;
    const r = spawnSync(
      'docker',
      ['run', '-d', '--rm', '--name', nome, '--label', 'ci-local=1', ...env, ...portas, ...opcoes, imagem],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) {
      spawnSync('docker', ['rm', '-f', nome], { stdio: 'ignore' });
      const msg = (r.stderr || r.error?.message || '').trim().split('\n').filter(Boolean);
      throw new Error(`docker run do serviço ${svc} falhou: ${msg.slice(-3).join(' | ')}`);
    }
    containersJob.add(nome);
    limpeza.containers.add(nome);
    log(`   🐳 serviço ${svc} (${imagem.split('@')[0]}) subindo...`);
    let estado = '';
    for (let t = 0; t < 60; t++) {
      estado = spawnSync(
        'docker',
        [
          'inspect',
          '--format',
          '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
          nome,
        ],
        { encoding: 'utf8' }
      ).stdout.trim();
      if (estado === 'healthy' || estado === 'running') break;
      if (estado === 'unhealthy' || estado === 'exited' || estado === 'dead' || estado === '')
        throw new Error(`serviço ${svc} não ficou de pé (estado: ${estado || 'removido'})`);
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    if (estado !== 'healthy' && estado !== 'running')
      throw new Error(`serviço ${svc} não ficou pronto em 120 s (estado: ${estado})`);
  }
}

// ------------------------------------------------------------------- passos
function escritorMascarado(arquivoLog, segredos) {
  const buf = { out: '', err: '' };
  const gravar = (texto) => appendFileSync(arquivoLog, mascarar(texto, segredos()));
  const receber = (canal) => (d) => {
    buf[canal] += d.toString();
    const k = buf[canal].lastIndexOf('\n');
    if (k >= 0) {
      gravar(buf[canal].slice(0, k + 1));
      buf[canal] = buf[canal].slice(k + 1);
    }
  };
  return {
    out: receber('out'),
    err: receber('err'),
    linha: (l) => gravar(`${l}\n`),
    fechar: () => {
      for (const c of ['out', 'err']) if (buf[c]) gravar(`${buf[c]}\n`);
      buf.out = buf.err = '';
    },
  };
}

/**
 * Roda um processo num grupo próprio (detached): o timeout e o Ctrl-C matam o
 * grupo inteiro (netos inclusive). Não espera processo em segundo plano que
 * herdou o pipe — como o runner, que só recolhe órfãos no fim do job.
 */
function rodarProcesso({ bin, args, cwd, env, timeoutMs, arquivoLog, segredos }) {
  return new Promise((ok) => {
    const inicio = Date.now();
    const escrita = escritorMascarado(arquivoLog, segredos);
    writeFileSync(arquivoLog, '', { flag: 'a' });
    let terminou = false;
    let estourou = false;
    let timer = null;
    let saida = null;
    const fim = (r) => {
      if (terminou) return;
      terminou = true;
      if (timer) clearTimeout(timer);
      escrita.fechar();
      ok({ ...r, segundos: Math.round((Date.now() - inicio) / 1000) });
    };
    let filho;
    try {
      filho = spawn(bin, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      escrita.linha(`[ci-local] não consegui iniciar "${bin}": ${e.message}`);
      fim({ code: 127, erro: `não consegui iniciar "${bin}" (${e.message})` });
      return;
    }
    filho.on('error', (e) => {
      escrita.linha(`[ci-local] não consegui iniciar "${bin}": ${e.code ?? e.message}`);
      fim({ code: 127, erro: `"${bin}" não encontrado ou não executável (${e.code ?? e.message})` });
    });
    if (filho.pid) limpeza.grupos.add(filho.pid);
    if (Number.isFinite(timeoutMs))
      timer = setTimeout(
        () => {
          estourou = true;
          matarGrupo(filho.pid);
        },
        Math.max(1, Math.min(timeoutMs, 2 ** 31 - 1))
      );
    filho.stdout.on('data', escrita.out);
    filho.stderr.on('data', escrita.err);
    let fechou = false;
    filho.on('exit', (code, sinal) => {
      limpeza.grupos.delete(filho.pid); // líder saiu: o PGID pode ser reaproveitado
      saida = estourou
        ? { code: 124, timeout: true }
        : { code: code ?? 128 + (osConstants.signals[sinal] ?? 0) };
      if (fechou) fim(saida);
      else setTimeout(() => fim(saida), 1000);
    });
    filho.on('close', () => {
      fechou = true;
      if (saida) fim(saida);
    });
  });
}

function rodarScript({ script, shell, dirPassos, n, ...resto }) {
  const arq = join(dirPassos, `step-${n}${extensaoShell(shell)}`);
  writeFileSync(arq, script);
  const [bin, args] = comandoShell(shell);
  return rodarProcesso({ bin, args: args.map((a) => a.replace('{0}', arq)), ...resto });
}

function ultimasLinhas(arquivo, n = 15) {
  if (!existsSync(arquivo)) return '';
  const texto = readFileSync(arquivo, 'utf8').trimEnd();
  if (!texto) return '      │ (passo sem saída)';
  return texto
    .split('\n')
    .slice(-n)
    .map((l) => `      │ ${l}`)
    .join('\n');
}

// ------------------------------------------------------------------ workflows
function carregarWorkflows(nomes) {
  const dir = join(ORIGEM, '.github/workflows');
  const disponiveis = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => f.replace(/\.ya?ml$/, ''))
    : [];
  return nomes.map((nome) => {
    const limpo = nome.replace(/\.ya?ml$/, '');
    const arq = ['.yml', '.yaml'].map((e) => join(dir, `${limpo}${e}`)).find((p) => existsSync(p));
    if (!arq)
      throw new ErroUso(`workflow "${nome}" não existe. Disponíveis: ${disponiveis.join(', ')}`);
    const wf = parseYaml(readFileSync(arq, 'utf8'));
    if (!wf?.jobs || typeof wf.jobs !== 'object') throw new ErroUso(`${arq}: sem jobs`);
    return { nome: limpo, arquivo: arq.slice(dir.length + 1), wf };
  });
}

function inputsDoDispatch(wf, args) {
  const on = wf.on ?? wf[true];
  const def = on && typeof on === 'object' && !Array.isArray(on) ? on.workflow_dispatch?.inputs : null;
  const inputs = {};
  for (const [k, v] of Object.entries(def ?? {})) if (v?.default !== undefined) inputs[k] = v.default;
  return { ...inputs, ...args.inputs };
}

// --------------------------------------------------------------------- job
async function rodarJob(p) {
  const { wfNome, wf, jobId, job, matrix, rotuloBase, gh, ws, runRoot, args, segredos, log } = p;
  const { needsResult, naoSelecionados, arquivosRapido, siteUsuario } = p;
  const res = {
    wf: wfNome,
    job: rotuloBase,
    status: 'success',
    falhas: [],
    avisos: new Set(),
    naoBloqueia: false,
    outputs: {},
  };
  const needs = [].concat(job.needs ?? []);
  const consideradas = needs.filter((n) => !naoSelecionados.has(n));
  for (const n of needs)
    if (naoSelecionados.has(n))
      res.avisos.add(`needs ${n} não rodou (fora do --job); tratado como satisfeito`);
  const statusNeeds = {
    success: consideradas.every((n) => needsResult[n]?.result === 'success'),
    failure: consideradas.some((n) => needsResult[n]?.result === 'failure'),
    cancelled: false,
  };
  const inputs = inputsDoDispatch(wf, args);
  let env = {};
  const ctxDe = (extra = {}) => ({
    env: { ...env },
    matrix,
    secrets: segredos.proxy,
    vars: {},
    inputs,
    github: gh,
    runner: { temp: '', os: 'Linux', arch: 'X64' },
    needs: needsResult,
    steps: {},
    job: { status: res.status },
    strategy: {},
    ...extra,
  });

  // if: do job (status implícito = todos os needs com sucesso)
  try {
    if (!avaliarCondicao(job.if, ctxDe({ status: statusNeeds }))) {
      res.status = 'skipped';
      const motivo =
        statusNeeds.success || job.if !== undefined
          ? `if: ${paraTexto(job.if ?? 'success()').replace(/\s+/g, ' ')}`
          : `needs sem sucesso: ${consideradas.filter((n) => needsResult[n]?.result !== 'success').join(', ')}`;
      log(`── ⏭️  ${rotuloBase}: pulado (${motivo})`);
      return res;
    }
  } catch (e) {
    if (!(e instanceof ExpressaoNaoSuportada)) throw e;
    res.status = 'failure';
    res.falhas.push(`if do job não avaliável localmente — job NÃO rodou (${e.message})`);
    log(`── ❌ ${rotuloBase}: if não avaliável (${e.message})`);
    return res;
  }

  let timeoutJobMin;
  try {
    res.naoBloqueia = avaliarBooleano(job['continue-on-error'], ctxDe());
    timeoutJobMin = avaliarMinutos(job['timeout-minutes'], ctxDe()) ?? TIMEOUT_JOB_PADRAO_MIN;
  } catch (e) {
    if (!(e instanceof ExpressaoNaoSuportada)) throw e;
    res.status = 'failure';
    res.falhas.push(`campo do job não avaliável: ${e.message}`);
    return res;
  }

  const homeJob = mkdtempSync(join(runRoot, `home-${jobId}-`));
  const dirJob = mkdtempSync(join(runRoot, `job-${jobId}-`));
  const runnerTemp = join(dirJob, 'runner-temp');
  const tmpJob = join(dirJob, 'tmp');
  const dirPassos = join(dirJob, 'passos');
  for (const d of [runnerTemp, tmpJob, dirPassos]) mkdirSync(d, { recursive: true });
  const containersJob = new Set();

  try {
    const plano = planoHomeIsolado(homeJob, process.env, existsSync, {
      pythonUserSite: siteUsuario,
      tmpdir: tmpJob,
    });
    prepararHome(homeJob, plano);
    const eventoArq = join(dirJob, 'event.json');
    writeFileSync(eventoArq, JSON.stringify(gh.event));
    env = {
      ...process.env,
      ...plano.env,
      CI: 'true',
      GITHUB_WORKSPACE: ws,
      GITHUB_EVENT_NAME: gh.event_name,
      GITHUB_EVENT_PATH: eventoArq,
      GITHUB_SHA: gh.sha,
      GITHUB_REF: gh.ref,
      GITHUB_HEAD_REF: gh.head_ref,
      GITHUB_BASE_REF: gh.base_ref,
      GITHUB_REPOSITORY: gh.repository,
      GITHUB_RUN_ID: 'local',
      RUNNER_TEMP: runnerTemp,
      RUNNER_OS: 'Linux',
      // Marcas para recolher órfãos no fim do job e no Ctrl-C (ver matarMarcados).
      CI_LOCAL_RUN: runRoot,
      CI_LOCAL_JOB: dirJob,
    };
    const ctxEnv = () => ctxDe({ runner: { temp: runnerTemp, os: 'Linux', arch: 'X64' } });
    for (const [k, v] of Object.entries({ ...(wf.env ?? {}), ...(job.env ?? {}) })) {
      const r = interpolar(v, ctxEnv());
      if (r.erros.length) throw new ExpressaoNaoSuportada(`env ${k}: ${r.erros.join('; ')}`);
      env[k] = r.texto;
    }
    const redirecionarShim = (alvo) => {
      if (alvo.DOCKER_SHIM_STATE_DIR !== undefined) {
        alvo.DOCKER_SHIM_STATE_DIR = join(dirJob, 'docker-shim-state');
        res.avisos.add('DOCKER_SHIM_STATE_DIR redirecionado para o temporário da execução');
      }
    };
    redirecionarShim(env);

    const nomeJob = job.name ? interpolar(job.name, ctxEnv()).texto : '';
    log(`── ▶️  ${rotuloBase}${nomeJob ? ` — ${nomeJob}` : ''}`);

    await subirServicos(job, jobId, ctxEnv(), log, res, containersJob);

    const outputs = {};
    const inicioJob = Date.now();
    const orcamentoMs = timeoutJobMin * 60_000;
    const dirLogs = p.dirLogs;
    const usamTmp = [];
    let n = 0;
    for (const step of job.steps ?? []) {
      n++;
      const ctxStep = ctxDe({
        steps: outputs,
        runner: { temp: runnerTemp, os: 'Linux', arch: 'X64' },
        job: { status: res.status },
        status: { success: res.status === 'success', failure: res.status === 'failure', cancelled: false },
      });
      const nome = step.name
        ? interpolar(step.name, ctxStep).texto
        : (step.run ?? step.uses ?? '').split('\n')[0].slice(0, 70);
      const marcarPulado = () => {
        if (step.id) outputs[step.id] = { outputs: {}, outcome: 'skipped', conclusion: 'skipped' };
      };
      const falhar = (msg) => {
        res.status = 'failure';
        res.falhas.push(msg);
        log(`   ❌ ${msg}`);
        if (step.id) outputs[step.id] = { outputs: {}, outcome: 'failure', conclusion: 'failure' };
      };

      let roda;
      try {
        roda = avaliarCondicao(step.if, ctxStep);
      } catch (e) {
        if (!(e instanceof ExpressaoNaoSuportada)) throw e;
        falhar(`"${nome}": if não avaliável localmente — passo NÃO rodou (${e.message})`);
        continue;
      }
      if (!roda) {
        log(`   ⏭️  ${nome} (${res.status === 'failure' && !step.if ? 'pulado: job já falhou' : 'if'})`);
        marcarPulado();
        continue;
      }
      const restanteMs = orcamentoMs - (Date.now() - inicioJob);
      if (restanteMs <= 0) {
        falhar(`timeout do job (${timeoutJobMin} min) estourado antes de "${nome}"`);
        break;
      }

      let script = step.run;
      let descricao = nome;
      let processo = null;
      if (args.rapido && jobId === 'unit-tests' && /vitest\s+run/.test(script ?? '')) {
        // Modo rápido: só os testes ligados ao que a branch mudou (o GitHub roda tudo).
        if (!arquivosRapido.length) {
          log(`   ⏭️  ${nome} (rápido: nenhum arquivo de código mudou nos commits da branch)`);
          marcarPulado();
          continue;
        }
        processo = {
          bin: 'bun',
          args: ['vitest', 'related', '--run', ...arquivosRapido.map((f) => (f.startsWith('-') ? `./${f}` : f))],
        };
        descricao = `${nome} [rápido: ${arquivosRapido.length} arquivo(s) mudado(s)]`;
      }
      if (step.uses) {
        const eq = equivalenteLocal(step.uses, step, gh);
        if (!eq) {
          log(`   ·  ${nome} — infraestrutura do runner (${step.uses.split('@')[0]}), não se aplica`);
          marcarPulado();
          continue;
        }
        script = eq.cmd;
        descricao = eq.desc;
      }
      if (script === undefined && !processo) {
        marcarPulado();
        continue;
      }

      const envStep = { ...env };
      const faltas = [];
      const erros = [];
      for (const [k, v] of Object.entries(step.env ?? {})) {
        const r = interpolar(v, ctxStep);
        envStep[k] = r.texto;
        faltas.push(...r.faltando);
        erros.push(...r.erros);
      }
      redirecionarShim(envStep);
      let corpo = '';
      if (!processo) {
        const r = interpolar(script, ctxStep);
        corpo = r.texto;
        faltas.push(...r.faltando);
        erros.push(...r.erros);
      }
      if (erros.length) {
        falhar(`"${nome}": expressão não avaliável localmente — passo NÃO rodou (${erros.join('; ')})`);
        continue;
      }
      if (faltas.length)
        res.avisos.add(`"${nome}": sem valor local para ${[...new Set(faltas)].join(', ')}`);

      if (!processo) {
        const sudo = comandosComSudo(corpo);
        if (sudo.length) {
          log(`   ⏭️  ${nome} — requer sudo — pulado (só no GitHub)`);
          res.avisos.add(`"${nome}": requer sudo — pulado (só no GitHub): ${sudo.join(' ; ')}`);
          marcarPulado();
          continue;
        }
        for (const l of corpo.split('\n'))
          if (/\bdocker\s+tag\b/.test(l))
            res.avisos.add(`"${nome}": reetiqueta imagem no docker da máquina: ${l.trim()}`);
        if (/(?:^|[\s"'=(])\/tmp\//m.test(corpo)) usamTmp.push(nome);
      }

      let continua;
      let timeoutStepMin;
      let cwd = ws;
      try {
        continua = avaliarBooleano(step['continue-on-error'], ctxStep);
        timeoutStepMin = avaliarMinutos(step['timeout-minutes'], ctxStep);
        const wd =
          step['working-directory'] ??
          job.defaults?.run?.['working-directory'] ??
          wf.defaults?.run?.['working-directory'];
        if (wd !== undefined) {
          const dir = paraTexto(avaliarValor(wd, ctxStep));
          cwd = isAbsolute(dir) ? dir : join(ws, dir);
        }
      } catch (e) {
        if (!(e instanceof ExpressaoNaoSuportada)) throw e;
        falhar(`"${nome}": campo não avaliável localmente — passo NÃO rodou (${e.message})`);
        continue;
      }
      if (!existsSync(cwd)) {
        falhar(`"${nome}": working-directory não existe (${cwd})`);
        continue;
      }

      const arqs = {
        GITHUB_ENV: join(runnerTemp, `_env-${n}`),
        GITHUB_PATH: join(runnerTemp, `_path-${n}`),
        GITHUB_OUTPUT: join(runnerTemp, `_out-${n}`),
        GITHUB_STEP_SUMMARY: join(runnerTemp, `_summary-${n}`),
      };
      for (const f of Object.values(arqs)) writeFileSync(f, '');
      const arquivoLog = join(
        dirLogs,
        `${rotuloBase.replace(/[^\w.-]+/g, '_')}--${String(n).padStart(2, '0')}.log`
      );
      const timeoutStepMs = timeoutStepMin !== undefined ? timeoutStepMin * 60_000 : Infinity;
      const limiteMs = Math.min(timeoutStepMs, restanteMs);
      const comum = {
        cwd,
        env: { ...envStep, ...arqs },
        timeoutMs: limiteMs,
        arquivoLog,
        segredos: segredos.valores,
      };
      const shell = step.shell ?? job.defaults?.run?.shell ?? wf.defaults?.run?.shell;
      const r = processo
        ? await rodarProcesso({ ...processo, ...comum })
        : await rodarScript({ script: corpo, shell, dirPassos, n, ...comum });
      if (interrompido) return res;

      let erroArquivos = null;
      try {
        Object.assign(env, lerArquivoEnv(readFileSync(arqs.GITHUB_ENV, 'utf8')));
        const novosPath = readFileSync(arqs.GITHUB_PATH, 'utf8').split('\n').filter(Boolean);
        if (novosPath.length) env.PATH = [...novosPath.reverse(), env.PATH].join(':');
        const saidas = lerArquivoEnv(readFileSync(arqs.GITHUB_OUTPUT, 'utf8'));
        if (step.id) outputs[step.id] = { outputs: saidas };
      } catch (e) {
        erroArquivos = e.message;
      }
      const code = erroArquivos ? r.code || 1 : r.code;
      if (step.id)
        outputs[step.id] = {
          outputs: outputs[step.id]?.outputs ?? {},
          outcome: code === 0 ? 'success' : 'failure',
          conclusion: code === 0 || continua ? 'success' : 'failure',
        };
      const porque = r.timeout
        ? limiteMs === restanteMs && limiteMs < timeoutStepMs
          ? `timeout do job (${timeoutJobMin} min)`
          : `timeout do passo (${timeoutStepMin} min)`
        : (r.erro ?? erroArquivos ?? `código ${code}`);
      if (code === 0) log(`   ✅ ${descricao} (${r.segundos}s)`);
      else if (continua)
        log(`   ⚠️  ${descricao} — falhou (${porque}), mas continue-on-error (${r.segundos}s)`);
      else {
        log(`   ❌ ${descricao} — ${porque} (${r.segundos}s)\n${ultimasLinhas(arquivoLog)}`);
        res.status = 'failure';
        res.falhas.push(`${descricao}: ${porque} → ${arquivoLog}`);
        if (r.timeout && limiteMs === restanteMs) break; // job cancelado pelo timeout
      }
    }
    if (usamTmp.length)
      res.avisos.add(
        `caminho fixo em /tmp (compartilhado com outras execuções) em: ${usamTmp.join('; ')}`
      );
    for (const [k, v] of Object.entries(job.outputs ?? {}))
      res.outputs[k] = interpolar(v, ctxDe({ steps: outputs })).texto;
  } catch (e) {
    if (!(e instanceof ExpressaoNaoSuportada) && !(e instanceof Error)) throw e;
    res.status = 'failure';
    res.falhas.push(e instanceof ExpressaoNaoSuportada ? `expressão não avaliável: ${e.message}` : e.message);
    log(`   ❌ ${e.message}`);
  } finally {
    // Como o runner: órfãos do job são recolhidos no fim dele.
    matarMarcados('CI_LOCAL_JOB', dirJob);
    for (const c of containersJob) derrubarContainer(c);
    rmSync(homeJob, { recursive: true, force: true });
    rmSync(dirJob, { recursive: true, force: true });
  }
  return res;
}

// --------------------------------------------------------------------- main
async function main() {
  const args = lerArgs(process.argv.slice(2));
  const workflows = carregarWorkflows(args.workflows ?? PADRAO_WORKFLOWS);
  if (args.jobs) {
    const existentes = new Set(workflows.flatMap((w) => Object.keys(w.wf.jobs)));
    const faltam = args.jobs.filter((j) => !existentes.has(j));
    if (faltam.length)
      throw new ErroUso(
        `job(s) inexistente(s) em ${workflows.map((w) => w.nome).join(', ')}: ${faltam.join(', ')}. ` +
          `Disponíveis: ${[...existentes].join(', ')}`
      );
  }
  const segredos = carregarSegredos();
  const runRoot = mkdtempSync(join(tmpdir(), 'ci-local-'));
  limpeza.dirs.add(runRoot);
  limpeza.marca = runRoot;
  const avisosGerais = new Set();
  const execucao = new Date().toISOString().replace(/[:.]/g, '-');
  const dirLogs = join(ORIGEM, '.ci-local', execucao);
  mkdirSync(dirLogs, { recursive: true });
  const log = (l) => {
    const t = mascarar(l, segredos.valores());
    console.log(t);
    appendFileSync(join(dirLogs, 'resumo.txt'), `${t}\n`);
  };

  const gh = contextoGithub(args, join(runRoot, 'workspace'));
  let arquivosRapido = [];
  if (args.rapido) {
    const mb = git('merge-base', args.base, 'HEAD');
    if (!mb.ok || !mb.out) throw new ErroUso(`--rapido: sem merge-base entre ${args.base} e HEAD`);
    const r = spawnSync(
      'git',
      ['diff', '-z', '--name-only', '--diff-filter=d', mb.out, 'HEAD'],
      { cwd: ORIGEM, encoding: 'utf8', maxBuffer: 1 << 30 }
    );
    if (r.status !== 0)
      throw new ErroUso(`--rapido: git diff da branch falhou: ${(r.stderr ?? '').trim()}`);
    let lista = arquivosDoDiffZ(r.stdout);
    if (args.incluirNaoCommitado) {
      const wt = spawnSync('git', ['diff', '-z', '--name-only', '--diff-filter=d', 'HEAD'], {
        cwd: ORIGEM,
        encoding: 'utf8',
      });
      const novos = spawnSync('git', ['ls-files', '-z', '--others', '--exclude-standard', '--', '.', ':!.ci-local'], {
        cwd: ORIGEM,
        encoding: 'utf8',
      });
      if (wt.status !== 0 || novos.status !== 0)
        throw new ErroUso('--rapido: git diff do working tree falhou');
      lista = [...lista, ...arquivosDoDiffZ(wt.stdout), ...arquivosDoDiffZ(novos.stdout)];
    }
    arquivosRapido = arquivosParaVitestRelated(lista);
  }

  log(
    `CI local — evento ${gh.event_name}, base ${args.base} (${(gh.event.pull_request?.base?.sha ?? '').slice(0, 9) || '—'}) → HEAD ${gh.sha.slice(0, 9)} [${gh.head_ref || 'HEAD destacado'}]`
  );
  log(`logs: ${dirLogs}`);
  log(`temporários: ${runRoot}\n`);

  let ws = gh.workspace;
  if (!args.listar) {
    try {
      ws = prepararWorkspace(runRoot, gh, args, avisosGerais, log);
    } catch (e) {
      throw new ErroUso(`não consegui preparar o clone descartável: ${e.message}`);
    }
    for (const a of avisosGerais) log(`⚠️  ${a}`);
  }
  const siteUsuario = sitePackagesDoUsuario();

  const resultados = [];
  for (const { nome: wfNome, arquivo, wf } of workflows) {
    const needsResult = {};
    const naoSelecionados = new Set();
    log(`════ ${wf.name ?? wfNome} (${arquivo})`);

    for (const jobId of ordenarJobs(wf.jobs)) {
      const job = wf.jobs[jobId];
      if (args.jobs && !args.jobs.includes(jobId)) {
        needsResult[jobId] = { result: 'skipped', outputs: {} };
        naoSelecionados.add(jobId);
        continue;
      }
      let combos;
      try {
        combos = expandirMatriz(job, {
          github: gh,
          needs: needsResult,
          inputs: inputsDoDispatch(wf, args),
          vars: {},
        });
      } catch (e) {
        if (!(e instanceof ExpressaoNaoSuportada)) throw e;
        resultados.push({
          wf: wfNome,
          job: jobId,
          status: 'failure',
          falhas: [`matriz não avaliável localmente — job NÃO rodou (${e.message})`],
          avisos: new Set(),
        });
        needsResult[jobId] = { result: 'failure', outputs: {} };
        log(`── ❌ ${jobId}: matriz não avaliável (${e.message})`);
        continue;
      }
      const rapidoUnit = args.rapido && jobId === 'unit-tests';
      if (rapidoUnit) combos = [combos[0]];

      if (args.listar) {
        for (const matrix of combos) {
          const rotulo = rapidoUnit
            ? `${jobId} (rápido)`
            : Object.keys(matrix).length
              ? `${jobId} (${Object.values(matrix).map(paraTexto).join(', ')})`
              : jobId;
          const ctx = { github: gh, matrix, env: {}, inputs: inputsDoDispatch(wf, args) };
          log(`── ▶️  ${rotulo}${job.name ? ` — ${interpolar(job.name, ctx).texto}` : ''}`);
          for (const s of job.steps ?? []) {
            const sudo = s.run && comandosComSudo(s.run).length ? ' [requer sudo: pulado]' : '';
            log(
              `   · ${s.uses ? `[uses ${s.uses.split('@')[0]}]` : '[run]'} ${s.name ? interpolar(s.name, ctx).texto : (s.run ?? '').split('\n')[0].slice(0, 80)}${sudo}`
            );
          }
        }
        continue;
      }

      const parciais = [];
      for (const matrix of combos) {
        const rotuloBase = rapidoUnit
          ? `${jobId} (rápido)`
          : Object.keys(matrix).length
            ? `${jobId} (${Object.values(matrix).map(paraTexto).join(', ')})`
            : jobId;
        const res = await rodarJob({
          wfNome,
          wf,
          jobId,
          job,
          matrix,
          rotuloBase,
          gh,
          ws,
          runRoot,
          args,
          segredos,
          log,
          needsResult,
          naoSelecionados,
          arquivosRapido,
          siteUsuario,
          dirLogs,
        });
        resultados.push(res);
        parciais.push(res);
      }
      // needs.<job>.result agrega a matriz. continue-on-error de job conta como
      // conclusão de sucesso para quem depende dele (como no step).
      const efetivos = parciais.map((r) =>
        r.status === 'failure' && r.naoBloqueia ? 'success' : r.status
      );
      needsResult[jobId] = {
        result: efetivos.includes('failure')
          ? 'failure'
          : efetivos.includes('success')
            ? 'success'
            : 'skipped',
        outputs: Object.assign({}, ...parciais.map((r) => r.outputs ?? {})),
      };
    }
    log('');
  }

  if (args.listar) return 0;
  log('════ RESUMO');
  for (const a of avisosGerais) log(`⚠️  ${a}`);
  for (const r of resultados) {
    const icone =
      r.status === 'success'
        ? '✅'
        : r.status === 'skipped'
          ? '⏭️ '
          : r.naoBloqueia
            ? '⚠️ '
            : '❌';
    log(`${icone} ${r.wf} / ${r.job}${r.status === 'failure' && r.naoBloqueia ? ' (falhou, mas continue-on-error: não bloqueia)' : ''}`);
    for (const f of r.falhas) log(`     ❌ ${f}`);
    for (const a of r.avisos) log(`     ⚠️  ${a}`);
  }
  log(
    '\nSó no GitHub (não reproduzível aqui): prévia da Vercel; steps de infraestrutura do runner (checkout, setup-*, cache, upload de artefatos); passos com sudo/apt.'
  );
  if (args.rapido)
    log(
      'Modo --rapido: unit-tests rodou só os testes relacionados aos arquivos mudados nos commits — o GitHub roda a suíte inteira.'
    );
  const rodaram = resultados.filter((r) => r.status !== 'skipped');
  if (!rodaram.length) {
    log(
      '\nRESULTADO: ⚠️  NENHUM job rodou (todos pulados pelo if:/needs) — nada foi verificado. ' +
        'Veja o evento (--evento) e o filtro (--job).'
    );
    return 3;
  }
  const falhou = resultados.some((r) => r.status === 'failure' && !r.naoBloqueia);
  log(
    falhou
      ? '\nRESULTADO: ❌ algum job falharia no GitHub'
      : '\nRESULTADO: ✅ tudo o que rodou localmente passou'
  );
  return falhou ? 1 : 0;
}

main()
  .then((codigo) => {
    limparTudo();
    process.exit(codigo);
  })
  .catch((e) => {
    limparTudo();
    if (e instanceof ErroUso) {
      console.error(`ci-local: ${e.message}`);
      process.exit(2);
    }
    console.error(e);
    process.exit(2);
  });
