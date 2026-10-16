// W98 — comando pronto de poda (scripts/ci/branch-podaveis.mjs).
// O script nunca apaga nada: só escreve o bloco `git push origin --delete` no
// relatório. Os testes cobrem a regra (elegível, com PR, recente, main, protegida),
// a recusa de nome perigoso e a falha fechada quando falta informação.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executar,
  lerEquivalentes,
  motivoNomeInseguro,
  relatorio,
  selecionarPodaveis,
} from './branch-podaveis.mjs';

const AGORA = Date.parse('2026-10-15T12:00:00Z');
const epochDiasAtras = (d) => Math.floor((AGORA - d * 86_400_000) / 1000);
const eq = (branch, dias) => ({ branch, commitEpoch: epochDiasAtras(dias) });

function classificar(equivalentes, { prsAbertas = [], protegidas = [] } = {}) {
  return selecionarPodaveis({ equivalentes, prsAbertas, protegidas, agoraMs: AGORA });
}

test('branch patch-equivalente, antiga e sem PR é elegível e vira comando', () => {
  const r = classificar([eq('claude/fix-antigo', 20)]);
  assert.deepEqual(r.elegiveis, ['claude/fix-antigo']);
  assert.match(relatorio(r), /```sh\ngit push origin --delete claude\/fix-antigo\n```/);
});

test('branch com PR aberta fica fora do comando', () => {
  const r = classificar([eq('feat/com-pr', 30)], { prsAbertas: ['feat/com-pr'] });
  assert.deepEqual(r.elegiveis, []);
  assert.deepEqual(r.fora.comPr, ['feat/com-pr']);
  const md = relatorio(r);
  assert.doesNotMatch(md, /git push origin --delete/);
  assert.match(md, /com PR aberta: 1/);
});

test('branch recente (7 dias ou menos) fica fora; o corte é estritamente maior que 7 dias', () => {
  const r = classificar([eq('recente', 2), eq('limite', 7), eq('passou', 7.01)]);
  assert.deepEqual(r.elegiveis, ['passou']);
  assert.deepEqual(r.fora.recentes, ['recente', 'limite']);
});

test('epoch ausente, zero ou inválido não prova idade: fica fora', () => {
  const r = classificar([
    { branch: 'sem-epoch', commitEpoch: Number.NaN },
    { branch: 'epoch-zero', commitEpoch: 0 },
  ]);
  assert.deepEqual(r.elegiveis, []);
  assert.deepEqual(r.fora.recentes, ['sem-epoch', 'epoch-zero']);
});

test('main nunca entra, mesmo antiga e sem PR', () => {
  const r = classificar([eq('main', 400)]);
  assert.deepEqual(r.elegiveis, []);
  assert.deepEqual(r.fora.principal, ['main']);
  assert.doesNotMatch(relatorio(r), /--delete main/);
});

test('branch protegida nunca entra', () => {
  const r = classificar([eq('release/estavel', 90)], { protegidas: ['release/estavel'] });
  assert.deepEqual(r.elegiveis, []);
  assert.deepEqual(r.fora.protegidas, ['release/estavel']);
});

test('nome com caractere estranho é recusado (não vai ao comando) e aparece codificado', () => {
  const perigosos = ['x;rm-rf', 'a$(id)', 'crase`whoami`', '-opcao', 'aspas"x', "aspa'x", 'a..b', 'a//b', 'fim/', 'x.lock', 'acentuação'];
  const r = classificar(perigosos.map((b) => eq(b, 30)));
  assert.deepEqual(r.elegiveis, []);
  assert.equal(r.fora.recusadas.length, perigosos.length);
  const md = relatorio(r);
  assert.doesNotMatch(md, /git push origin --delete/);
  assert.doesNotMatch(md, /`whoami`/, 'crase crua no relatório quebraria o markdown');
  assert.match(md, /nome recusado: `crase%60whoami%60`/);
  assert.match(md, /nome recusado: `a%24\(id\)`/);
});

test('nomes comuns do repositório passam na lista segura', () => {
  for (const nome of ['claude/fix-x-251015-1200', 'dia/2026-10-15', 'dependabot/npm_and_yarn/vite-7.1.2', 'W98.teste']) {
    assert.equal(motivoNomeInseguro(nome), null, nome);
  }
});

test('lerEquivalentes: TSV com epoch; linha sem tab vira epoch inválido', () => {
  assert.deepEqual(lerEquivalentes('a\t100\nb/c\t200\n'), [
    { branch: 'a', commitEpoch: 100 },
    { branch: 'b/c', commitEpoch: 200 },
  ]);
  const [semTab] = lerEquivalentes('sozinha\n');
  assert.equal(semTab.branch, 'sozinha');
  assert.ok(Number.isNaN(semTab.commitEpoch));
});

// --- Falha fechada --------------------------------------------------------

function arquivos(conteudos) {
  const dir = mkdtempSync(join(tmpdir(), 'w98-'));
  const caminhos = {};
  for (const [nome, texto] of Object.entries(conteudos)) {
    caminhos[nome] = join(dir, nome);
    if (texto !== null) writeFileSync(caminhos[nome], texto);
  }
  return { dir, caminhos };
}

function rodar(conteudos, extra = []) {
  const { dir, caminhos } = arquivos(conteudos);
  try {
    return executar([
      '--equivalentes', caminhos.eq,
      '--prs', caminhos.prs,
      '--protegidas', caminhos.prot,
      ...extra,
    ], (p) => readFileSync(p, 'utf8'), AGORA);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TSV = `velha\t${epochDiasAtras(30)}\n`;

test('caminho feliz pelos arquivos', () => {
  const r = rodar({ eq: TSV, prs: '[]', prot: 'main\n' }, ['--limite-prs', '500']);
  assert.equal(r.aviso, undefined);
  assert.match(r.saida, /git push origin --delete velha/);
});

test('lista de PRs ilegível ou de erro: nenhum comando gerado', () => {
  for (const prs of ['{"erro":"falha ao listar PRs abertas"}', 'não é json', '[{"semHead":1}]']) {
    const r = rodar({ eq: TSV, prs, prot: '' });
    assert.ok(r.aviso, prs);
    assert.doesNotMatch(r.saida, /git push origin --delete/, prs);
    assert.match(r.saida, /Comando não gerado/, prs);
  }
});

test('lista de PRs cheia até o limite: pode faltar PR, nenhum comando gerado', () => {
  const r = rodar({ eq: TSV, prs: JSON.stringify([{ headRefName: 'x' }, { headRefName: 'y' }]), prot: '' }, ['--limite-prs', '2']);
  assert.match(r.aviso, /veio cheia/);
  assert.doesNotMatch(r.saida, /git push origin --delete/);
});

test('arquivo de protegidas ausente (API falhou): nenhum comando gerado', () => {
  const r = rodar({ eq: TSV, prs: '[]', prot: null });
  assert.match(r.saida, /branches protegidas indisponíveis/);
  assert.doesNotMatch(r.saida, /git push origin --delete/);
});

const SCRIPT = new URL('./branch-podaveis.mjs', import.meta.url).pathname;

test('CLI: sempre exit 0; aviso ::warning:: quando não gera comando', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--equivalentes', '/nao/existe'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /::warning::W98/);
  assert.match(r.stdout, /Comando não gerado/);
});

test.skip('o workflow chama o script e nunca executa a poda', () => {
  const wf = readFileSync(new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url), 'utf8');
  assert.match(wf, /node scripts\/ci\/branch-podaveis\.mjs/);
  assert.match(wf, /branch-equivalentes\.tsv/);
  const linhasExecutaveis = wf.split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('#'));
  const executaveis = linhasExecutaveis.join('\n');
  assert.ok(!linhasExecutaveis.some((l) => /^git push\b/.test(l)), 'o workflow não pode apagar branch (W98 = só comando pronto)');
  assert.doesNotMatch(executaveis, /git\/refs\/heads[^\n]*-X\s*DELETE|--method\s+DELETE/, 'nem pela API');
});
