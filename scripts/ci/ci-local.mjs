#!/usr/bin/env node
// CI local: roda na máquina os MESMOS passos dos workflows do GitHub, lendo os
// próprios .github/workflows/*.yml (nada de cópia de comandos que envelhece).
//
// Uso:
//   npm run ci:local                       # ci.yml + db-guard.yml completos
//   npm run ci:local -- --rapido           # testes unitários só dos arquivos mudados
//   npm run ci:local -- --job typecheck,build
//   npm run ci:local -- --workflow ci      # só ci.yml (aceita: ci, db-guard, e2e-talkx ...)
//   npm run ci:local -- --listar           # mostra workflows/jobs/passos e o que será pulado
//
// Segredos (ex.: VITE_SUPABASE_URL do build, credenciais do E2E logado) vêm do
// ambiente ou de `.env.ci.local` (fora do git). Sem eles o passo roda com vazio
// e o resumo avisa.
//
// O que NÃO dá para reproduzir aqui fica explícito no resumo (prévia da Vercel,
// steps `uses:` de infraestrutura do runner). Detalhes: docs/ci/CI_LOCAL.md.

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  avaliarCondicao,
  interpolar,
  expandirMatriz,
  ordenarJobs,
  lerArquivoEnv,
  comandoShell,
  separarOpcoesDocker,
  arquivosParaVitestRelated,
  ExpressaoNaoSuportada,
} from './ci-local-lib.mjs';

const RAIZ = resolve(
  spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || '.'
);
const PADRAO_WORKFLOWS = ['ci', 'db-guard'];

// ---------------------------------------------------------------- argumentos
function lerArgs(argv) {
  const a = { workflows: null, jobs: null, rapido: false, listar: false, base: 'origin/main' };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--rapido') a.rapido = true;
    else if (x === '--listar') a.listar = true;
    else if (x === '--workflow') a.workflows = argv[++i].split(',');
    else if (x === '--job') a.jobs = argv[++i].split(',');
    else if (x === '--base') a.base = argv[++i];
    else if (x === '-h' || x === '--help') {
      console.log(
        readFileSync(new URL(import.meta.url))
          .toString()
          .split('\n')
          .slice(1, 18)
          .join('\n')
      );
      process.exit(0);
    } else {
      console.error(`argumento desconhecido: ${x}`);
      process.exit(2);
    }
  }
  return a;
}

// ------------------------------------------------------------------- contexto
function git(...args) {
  const r = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function carregarSegredos() {
  const arq = join(RAIZ, '.env.ci.local');
  const doArquivo = existsSync(arq)
    ? lerArquivoEnv(readFileSync(arq, 'utf8').replace(/^\s*#.*$/gm, ''))
    : {};
  return new Proxy(
    {},
    {
      get: (_, k) => (typeof k === 'string' ? (process.env[k] ?? doArquivo[k]) : undefined),
    }
  );
}

function contextoGithub(base) {
  const head = git('rev-parse', 'HEAD');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const baseSha = git('merge-base', base, 'HEAD') || git('rev-parse', base);
  return {
    event_name: 'pull_request',
    sha: head,
    ref: `refs/heads/${branch}`,
    head_ref: branch,
    base_ref: 'main',
    workspace: RAIZ,
    repository: 'adm01-debug/Zapp_Web_V2',
    token: '',
    run_id: 'local',
    event: {
      pull_request: {
        draft: false,
        base: { sha: baseSha, ref: 'main' },
        head: { sha: head, ref: branch },
      },
    },
  };
}

// --------------------------------------------------- equivalentes de `uses:`
// Steps `uses:` que fazem VERIFICAÇÃO ganham equivalente local; os de
// infraestrutura (checkout, setup-*, cache, upload) não se aplicam à máquina.
function equivalenteLocal(uses, step, gh) {
  const acao = uses.split('@')[0];
  if (acao === 'gitleaks/gitleaks-action') {
    return {
      desc: 'gitleaks (equivalente local)',
      cmd: `gitleaks git --no-banner --log-opts="${gh.event.pull_request.base.sha}..HEAD"`,
    };
  }
  if (acao === 'actions/github-script' && /Rejeitar edicao de migration/i.test(step.name ?? '')) {
    // Mesmo critério do workflow: só 'modified' em supabase/migrations/*.sql.
    return {
      desc: 'migration existente editada? (equivalente local)',
      cmd:
        `m=$(git diff --diff-filter=M --name-only "${gh.event.pull_request.base.sha}"...HEAD -- 'supabase/migrations/*.sql'); ` +
        `if [ -n "$m" ]; then echo "::error::migration já existente editada:"; echo "$m"; exit 1; fi; echo "nenhuma migration existente editada"`,
    };
  }
  return null;
}

// ------------------------------------------------------------------- docker
async function subirServicos(job, jobId, ctx, logLinha) {
  const nomes = [];
  for (const [svc, def] of Object.entries(job.services ?? {})) {
    const nome = `ci-local-${jobId}-${svc}-${process.pid}`;
    const env = Object.entries(def.env ?? {}).flatMap(([k, v]) => [
      '-e',
      `${k}=${interpolar(v, ctx).texto}`,
    ]);
    const portas = (def.ports ?? []).flatMap((p) => ['-p', String(p)]);
    const opcoes = separarOpcoesDocker(interpolar(def.options ?? '', ctx).texto);
    const r = spawnSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        nome,
        '--label',
        'ci-local=1',
        ...env,
        ...portas,
        ...opcoes,
        interpolar(def.image, ctx).texto,
      ],
      { encoding: 'utf8' }
    );
    if (r.status !== 0)
      throw new Error(`docker run do serviço ${svc} falhou: ${r.stderr.trim().split('\n').pop()}`);
    nomes.push(nome);
    logLinha(`   🐳 serviço ${svc} (${def.image.split('@')[0]}) subindo...`);
    for (let t = 0; t < 60; t++) {
      const s = spawnSync(
        'docker',
        [
          'inspect',
          '--format',
          '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
          nome,
        ],
        { encoding: 'utf8' }
      ).stdout.trim();
      if (s === 'healthy' || s === 'running') break;
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
  return nomes;
}

function derrubarServicos(nomes) {
  for (const n of nomes) spawnSync('docker', ['rm', '-f', n], { stdio: 'ignore' });
}

// ------------------------------------------------------------------- passos
function rodarPasso({ script, shell, cwd, env, timeoutMin, arquivoLog }) {
  return new Promise((ok) => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-local-step-'));
    const arq = join(dir, shell === 'python' ? 'step.py' : 'step.sh');
    writeFileSync(arq, script);
    const [bin, args] = comandoShell(shell);
    const filho = spawn(
      bin,
      args.map((a) => a.replace('{0}', arq)),
      { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const inicio = Date.now();
    const timer = timeoutMin ? setTimeout(() => filho.kill('SIGKILL'), timeoutMin * 60_000) : null;
    filho.stdout.on('data', (d) => appendFileSync(arquivoLog, d));
    filho.stderr.on('data', (d) => appendFileSync(arquivoLog, d));
    filho.on('close', (code, sinal) => {
      if (timer) clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      ok({ code: sinal ? 124 : code, segundos: Math.round((Date.now() - inicio) / 1000) });
    });
  });
}

function ultimasLinhas(arquivo, n = 15) {
  if (!existsSync(arquivo)) return '';
  return readFileSync(arquivo, 'utf8')
    .trimEnd()
    .split('\n')
    .slice(-n)
    .map((l) => `      │ ${l}`)
    .join('\n');
}

// --------------------------------------------------------------------- main
async function main() {
  const args = lerArgs(process.argv.slice(2));
  const workflows = args.workflows ?? PADRAO_WORKFLOWS;
  const segredos = carregarSegredos();
  const gh = contextoGithub(args.base);
  const runnerTemp = mkdtempSync(join(tmpdir(), 'ci-local-runner-'));
  const execucao = new Date().toISOString().replace(/[:.]/g, '-');
  const dirLogs = join(RAIZ, '.ci-local', execucao);
  mkdirSync(dirLogs, { recursive: true });
  const log = (l) => {
    console.log(l);
    appendFileSync(join(dirLogs, 'resumo.txt'), `${l}\n`);
  };

  const resultados = []; // {wf, job, status, falhas[], avisos[]}
  log(
    `CI local — base ${args.base} (${gh.event.pull_request.base.sha.slice(0, 9)}) → HEAD ${gh.sha.slice(0, 9)} [${gh.head_ref}]`
  );
  log(`logs: ${dirLogs}\n`);

  for (const wfNome of workflows) {
    const arqWf = join(RAIZ, '.github/workflows', `${wfNome.replace(/\.ya?ml$/, '')}.yml`);
    if (!existsSync(arqWf)) {
      log(`⚠️  workflow ${wfNome} não encontrado`);
      continue;
    }
    const wf = parseYaml(readFileSync(arqWf, 'utf8'));
    const needsResult = {};
    log(`════ ${wf.name ?? wfNome} (${wfNome}.yml)`);

    for (const jobId of ordenarJobs(wf.jobs)) {
      const job = wf.jobs[jobId];
      if (args.jobs && !args.jobs.includes(jobId)) {
        needsResult[jobId] = { result: 'skipped' };
        continue;
      }
      const combos = args.rapido && jobId === 'unit-tests' ? [{}] : expandirMatriz(job);

      for (const matrix of combos) {
        const rotulo = Object.keys(matrix).length
          ? `${jobId} (${Object.values(matrix).join(', ')})`
          : jobId;
        const res = { wf: wfNome, job: rotulo, status: 'success', falhas: [], avisos: [] };
        const envBase = {
          ...process.env,
          CI: 'true',
          GITHUB_WORKSPACE: RAIZ,
          RUNNER_TEMP: runnerTemp,
        };
        let env = { ...envBase };
        const ctxDe = (extra = {}) => ({
          env: { ...env },
          matrix,
          secrets: segredos,
          github: gh,
          runner: { temp: runnerTemp, os: 'Linux' },
          needs: needsResult,
          steps: {},
          ...extra,
        });
        let ctx = ctxDe();

        // if: do job
        try {
          if (!avaliarCondicao(job.if, ctx)) {
            res.status = 'skipped';
            log(`── ⏭️  ${rotulo}: pulado (if: ${job.if})`);
            resultados.push(res);
            needsResult[jobId] = { result: 'skipped' };
            continue;
          }
        } catch (e) {
          if (e instanceof ExpressaoNaoSuportada)
            res.avisos.push(`if do job não avaliável (${e.message}); rodando assim mesmo`);
          else throw e;
        }
        for (const [k, v] of Object.entries({ ...(wf.env ?? {}), ...(job.env ?? {}) }))
          env[k] = interpolar(v, ctxDe()).texto;
        ctx = ctxDe();
        log(`── ▶️  ${rotulo}${job.name ? ` — ${interpolar(job.name, ctx).texto}` : ''}`);

        if (args.listar) {
          for (const s of job.steps ?? [])
            log(
              `   · ${s.uses ? `[uses ${s.uses.split('@')[0]}]` : '[run]'} ${s.name ?? (s.run ?? '').split('\n')[0].slice(0, 80)}`
            );
          continue;
        }

        let servicos = [];
        try {
          servicos = await subirServicos(job, jobId, ctx, log);
        } catch (e) {
          res.status = 'failure';
          res.falhas.push(e.message);
        }

        const outputs = {};
        let n = 0;
        for (const step of job.steps ?? []) {
          n++;
          if (res.status === 'failure' && !String(step.if ?? '').match(/always\(\)|failure\(\)/))
            continue;
          const nome = step.name ?? (step.run ?? step.uses ?? '').split('\n')[0].slice(0, 70);
          const ctxStep = ctxDe({ steps: outputs, estadoJob: res.status });
          try {
            if (!avaliarCondicao(step.if, ctxStep)) {
              log(`   ⏭️  ${nome} (if)`);
              continue;
            }
          } catch (e) {
            if (!(e instanceof ExpressaoNaoSuportada)) throw e;
            res.avisos.push(`"${nome}": if não avaliável (${e.message}); rodado`);
          }
          let script = step.run;
          let descricao = nome;
          if (args.rapido && jobId === 'unit-tests' && /vitest\s+run/.test(script ?? '')) {
            // Modo rápido: só os testes ligados ao que a branch mudou (o GitHub roda tudo).
            const arquivos = arquivosParaVitestRelated(
              git('diff', '--name-only', `${gh.event.pull_request.base.sha}...HEAD`)
            );
            if (!arquivos.length) {
              log(`   ⏭️  ${nome} (rápido: nenhum arquivo de código mudou)`);
              continue;
            }
            script = `bun vitest related --run ${arquivos.map((f) => `'${f}'`).join(' ')}`;
            descricao = `${nome} [rápido: ${arquivos.length} arquivo(s) mudado(s)]`;
          }
          if (step.uses) {
            const eq = equivalenteLocal(step.uses, step, gh);
            if (!eq) {
              log(
                `   ·  ${nome} — infraestrutura do runner (${step.uses.split('@')[0]}), não se aplica`
              );
              continue;
            }
            script = eq.cmd;
            descricao = eq.desc;
          }
          const envStep = { ...env };
          const faltas = [];
          for (const [k, v] of Object.entries(step.env ?? {})) {
            const r = interpolar(v, ctxStep);
            envStep[k] = r.texto;
            faltas.push(...r.faltando);
          }
          const corpo = interpolar(script, ctxStep);
          faltas.push(...corpo.faltando);
          if (faltas.length)
            res.avisos.push(`"${nome}": sem valor local para ${[...new Set(faltas)].join(', ')}`);
          const arqs = {
            GITHUB_ENV: join(runnerTemp, `env-${n}`),
            GITHUB_PATH: join(runnerTemp, `path-${n}`),
            GITHUB_OUTPUT: join(runnerTemp, `out-${n}`),
            GITHUB_STEP_SUMMARY: join(runnerTemp, `summary-${n}`),
          };
          for (const f of Object.values(arqs)) writeFileSync(f, '');
          const arquivoLog = join(
            dirLogs,
            `${rotulo.replace(/[^\w.-]+/g, '_')}--${String(n).padStart(2, '0')}.log`
          );
          const cwd = step['working-directory']
            ? join(RAIZ, interpolar(step['working-directory'], ctxStep).texto)
            : RAIZ;
          const { code, segundos } = await rodarPasso({
            script: corpo.texto,
            shell: step.shell ?? job.defaults?.run?.shell ?? wf.defaults?.run?.shell,
            cwd,
            env: { ...envStep, ...arqs },
            timeoutMin: step['timeout-minutes'] ?? job['timeout-minutes'],
            arquivoLog,
          });
          Object.assign(env, lerArquivoEnv(readFileSync(arqs.GITHUB_ENV, 'utf8')));
          const novosPath = readFileSync(arqs.GITHUB_PATH, 'utf8').split('\n').filter(Boolean);
          if (novosPath.length) env.PATH = [...novosPath.reverse(), env.PATH].join(':');
          if (step.id)
            outputs[step.id] = {
              outputs: lerArquivoEnv(readFileSync(arqs.GITHUB_OUTPUT, 'utf8')),
              outcome: code === 0 ? 'success' : 'failure',
              conclusion: code === 0 || step['continue-on-error'] ? 'success' : 'failure',
            };
          if (code === 0) log(`   ✅ ${descricao} (${segundos}s)`);
          else if (step['continue-on-error'])
            log(`   ⚠️  ${descricao} — falhou, mas continue-on-error (${segundos}s)`);
          else {
            log(`   ❌ ${descricao} — código ${code} (${segundos}s)\n${ultimasLinhas(arquivoLog)}`);
            res.status = 'failure';
            res.falhas.push(`${descricao} → ${arquivoLog}`);
          }
        }
        derrubarServicos(servicos);
        resultados.push(res);
        // needs.<job>.result agrega a matriz: qualquer falha => failure.
        const anterior = needsResult[jobId]?.result;
        needsResult[jobId] = {
          result: anterior === 'failure' || res.status === 'failure' ? 'failure' : res.status,
        };
      }
    }
    log('');
  }
  rmSync(runnerTemp, { recursive: true, force: true });

  if (args.listar) return;
  log('════ RESUMO');
  for (const r of resultados) {
    const icone = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️ ' : '❌';
    log(`${icone} ${r.wf} / ${r.job}`);
    for (const f of r.falhas) log(`     ❌ ${f}`);
    for (const a of r.avisos) log(`     ⚠️  ${a}`);
  }
  log(
    '\nSó no GitHub (não reproduzível aqui): prévia da Vercel; steps de infraestrutura do runner (checkout, setup-*, cache, upload de artefatos).'
  );
  if (args.rapido)
    log(
      'Modo --rapido: unit-tests rodou só os testes relacionados aos arquivos mudados — o GitHub roda a suíte inteira.'
    );
  const falhou = resultados.some((r) => r.status === 'failure');
  log(
    falhou
      ? '\nRESULTADO: ❌ algum job falharia no GitHub'
      : '\nRESULTADO: ✅ tudo o que roda localmente passou'
  );
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
