/**
 * E20 (plano de 2026-10-08, item CI/DevOps): o passo "Registrar falha dos gates"
 * do types-sync.yml comentava na issue `[types-sync] Falha ao propor
 * sincronizacao` a CADA run em que um gate falhava. Com um gate vermelho por
 * dias (o job roda semanalmente e a cada push na main), a issue enchia de
 * comentarios repetidos e deixava de ser lida -- exatamente o que o
 * db-live-guard.yml ja resolvia com marcador de causa + janela de 6h
 * (E05/E06/E44) e o e2e-logado.yml com marcadorDe (E83).
 *
 * Este teste NAO reimplementa o script: ele extrai o bloco REAL `script: |` do
 * passo em .github/workflows/types-sync.yml, substitui apenas as interpolacoes
 * `${{ ... }}` por valores de fixture e executa o codigo contra um `github`,
 * um `context` e um `core` falsos -- do mesmo jeito que o github-script monta o
 * ambiente do passo. Assim o que passa aqui e o que roda no Actions.
 *
 * Casos: issue nova ganha o marcador; mesma causa <6h suprime; mesma causa
 * >6h comenta; causa diferente comenta; a paginacao de comentarios e respeitada
 * (issue com 150 comentarios nao le so a primeira pagina); causa por gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/types-sync.yml');
const PASSOS = 'Registrar falha dos gates';

const yml = fs.readFileSync(WORKFLOW, 'utf8');

/** Bloco `script: |` real do passo, sem reindentar (o YAML ja o entrega assim ao github-script). */
function extrairBloco(nome) {
  const inicio = yml.indexOf(`- name: ${nome}`);
  assert.ok(inicio > -1, `passo "${nome}" nao encontrado em types-sync.yml`);
  const resto = yml.slice(inicio + 1);
  const proximo = resto.search(/\n {6}- /); // proximo passo do mesmo job
  const bloco = proximo > -1 ? resto.slice(0, proximo) : resto;
  const m = /\n\s*script:\s*\|\s*\n([\s\S]*)$/.exec(bloco);
  assert.ok(m, `passo "${nome}" sem bloco \`script: |\``);
  return m[1];
}

/** Interpolacao `${{ }}` -> valor de fixture (o Actions faz o mesmo antes de avaliar o JS). */
function interpolar(codigo, gates) {
  return codigo.replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_todo, expr) => {
    const e = expr.trim();
    const gate = /^steps\.gate([123])\.outputs\.passed$/.exec(e);
    if (gate) return gates[`gate${gate[1]}`] ?? '';
    if (e === 'github.sha') return 'abc1234def';
    if (e === 'github.server_url') return 'https://github.test';
    if (e === 'github.repository') return 'org/repo';
    if (e === 'github.run_id') return '987654';
    return '';
  });
}

const codigo = interpolar(extrairBloco(PASSOS), {});
const TITULO = /const title = '([^']+)'/.exec(codigo)?.[1];
const CAUSA_NO_CODIGO = /<!-- causa:/.test(codigo);

/** Sobe o passo real contra `github`/`context`/`core` falsos e devolve as chamadas. */
async function executar({ gates = {}, abertas = [], comentarios = [] }) {
  const chamadas = { criadas: [], comentadas: [], labels: [], infos: [] };
  assert.ok(TITULO, 'nao consegui ler o titulo da issue do bloco real do passo');

  const paginar = ({ per_page = 30, page = 1 } = {}) => {
    const inicio = (page - 1) * per_page;
    const data = comentarios.slice(inicio, inicio + per_page);
    const ultima = Math.ceil(comentarios.length / per_page);
    const link = page < ultima
      ? `<https://api.github.test/repos/org/repo/issues/42/comments?per_page=${per_page}&page=${ultima}>; rel="last"`
      : '';
    return { data, headers: { link } };
  };

  const github = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: abertas }),
        // Paginacao fiel: per_page 1 devolve 1 comentario + Link rel="last";
        // per_page 100 devolve os 100 PRIMEIROS (nao o ultimo) -- quem so olha
        // a primeira pagina erra a causa numa issue longa.
        listComments: async (params) => paginar(params),
        createComment: async (p) => { chamadas.comentadas.push(p); return { data: {} }; },
        create: async (p) => { chamadas.criadas.push(p); return { data: {} }; },
        createLabel: async (p) => { chamadas.labels.push(p); return { data: {} }; },
      },
    },
  };
  const context = { repo: { owner: 'org', repo: 'repo' }, sha: 'abc1234def', runId: 987654 };
  const core = { info: (m) => chamadas.infos.push(m), warning: (m) => chamadas.infos.push(m), setFailed: () => {} };

  const rodar = new Function(
    'github',
    'context',
    'core',
    'require',
    `return (async () => {\n${interpolar(extrairBloco(PASSOS), gates)}\n})();`,
  );
  await rodar(github, context, core, createRequire(import.meta.url));
  return chamadas;
}

const agora = Date.now();
const horasAtras = (h) => new Date(agora - h * 60 * 60 * 1000).toISOString();
const comentario = (causa, h) => ({
  body: `<!-- causa:${causa} -->\n\n**Gate:** x\n**Commit da main:** \`abc\``,
  created_at: horasAtras(h),
});
const issueAberta = () => ({ number: 42, title: TITULO, body: 'aberta por uma falha anterior' });

test('E20: a issue nova nasce com o marcador de causa', async () => {
  const c = await executar({ gates: { gate1: 'false' } });
  assert.equal(c.criadas.length, 1, 'sem issue aberta o passo tem de abrir a issue');
  assert.equal(c.comentadas.length, 0);
  assert.match(c.criadas[0].body, /<!-- causa:([a-z-]+) -->/, 'o corpo da issue precisa do marcador de causa');
});

test('E20: causa do alerta vem do gate que falhou', async () => {
  const gate1 = await executar({ gates: { gate1: 'false' } });
  const gate2 = await executar({ gates: { gate1: 'true', gate2: 'false' } });
  const gate3 = await executar({ gates: { gate1: 'true', gate2: 'true', gate3: 'false' } });
  const causa = (chamadas) => /<!-- causa:([a-z-]+) -->/.exec(chamadas.criadas[0].body)[1];
  assert.equal(causa(gate1), 'typescript');
  assert.equal(causa(gate2), 'usage-guard');
  assert.equal(causa(gate3), 'remocoes-destrutivas');
});

test('E20: mesma causa ha menos de 6h nao gera comentario novo', async () => {
  const c = await executar({
    gates: { gate1: 'true', gate2: 'false' },
    abertas: [issueAberta()],
    comentarios: [comentario('usage-guard', 2)],
  });
  assert.equal(c.comentadas.length, 0, 'mesma causa dentro de 6h tem de ser suprimida');
  assert.equal(c.criadas.length, 0);
  assert.ok(c.infos.some((m) => /dedupe/i.test(m)), 'o passo precisa registrar por que suprimiu');
});

test('E20: mesma causa depois de 6h comenta de novo', async () => {
  const c = await executar({
    gates: { gate1: 'true', gate2: 'false' },
    abertas: [issueAberta()],
    comentarios: [comentario('usage-guard', 7)],
  });
  assert.equal(c.comentadas.length, 1, 'passadas 6h o alerta volta a comentar');
  assert.match(c.comentadas[0].body, /<!-- causa:usage-guard -->/);
});

test('E20: causa diferente comenta mesmo dentro de 6h', async () => {
  const c = await executar({
    gates: { gate1: 'true', gate2: 'true', gate3: 'false' },
    abertas: [issueAberta()],
    comentarios: [comentario('typescript', 1)],
  });
  assert.equal(c.comentadas.length, 1, 'falha de outra causa e alerta novo');
  assert.match(c.comentadas[0].body, /<!-- causa:remocoes-destrutivas -->/);
});

test('E20: issue aberta sem causa registrada comenta', async () => {
  const c = await executar({
    gates: { gate1: 'false' },
    abertas: [issueAberta()],
    comentarios: [],
  });
  assert.equal(c.comentadas.length, 1, 'sem marcador anterior nao ha como provar mesma causa');
});

test('E20: numa issue com 150 comentarios vale o ULTIMO, nao a primeira pagina', async () => {
  const antigos = Array.from({ length: 148 }, (_v, i) => comentario('typescript', 48 + i));
  const comentarios = [comentario('typescript', 40), ...antigos, comentario('usage-guard', 2)];
  assert.equal(comentarios.length, 150);
  const c = await executar({
    gates: { gate1: 'true', gate2: 'false' },
    abertas: [issueAberta()],
    comentarios,
  });
  assert.equal(
    c.comentadas.length,
    0,
    'a causa do ULTIMO comentario (2h, igual) tem de suprimir; ler so a pagina 1 veria a causa antiga',
  );
});

test('E20: o comentario de causa diferente tambem sai com o marcador', async () => {
  const c = await executar({
    gates: { gate1: 'false' },
    abertas: [issueAberta()],
    comentarios: [comentario('usage-guard', 2)],
  });
  assert.equal(c.comentadas.length, 1);
  assert.match(c.comentadas[0].body, /^<!-- causa:typescript -->/m);
  assert.equal(c.comentadas[0].issue_number, 42);
});

test('E20: o passo do workflow tem o marcador (guarda contra remocao)', () => {
  assert.ok(CAUSA_NO_CODIGO, 'o passo "Registrar falha dos gates" perdeu o marcador de causa');
  assert.match(codigo, /6 \* 60 \* 60 \* 1000/, 'a janela de dedupe de 6h sumiu do passo');
});
