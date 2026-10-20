// E19 (auditoria de GitHub Actions de 2026-10-01, achado TRA-008): o Gate 3 do
// types-sync contava LINHAS removidas do types.ts (>10) e admitia force_gate3.
// Linha removida nao prova remocao de objeto nem orfa call-site: renomear campo
// derruba o gate a toa e um DROP TABLE consumido passa em 2 linhas.
//
// Este contrato trava a troca: o Gate 3 passa a comparar OBJETOS do catalogo
// antigo x novo e a bloquear so a remocao AINDA consumida pelo src/. Antes desta
// etapa o arquivo do gate nao existia e o workflow contava linhas — os dois testes
// abaixo (o funcional e o de fiacao do YAML) ficavam vermelhos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const GATE = new URL('../db-audit/check-remocoes-destrutivas.mjs', import.meta.url);
const WORKFLOW = new URL('../../.github/workflows/types-sync.yml', import.meta.url);

const catalogo = (extra = {}) => JSON.stringify({
  format_version: 2,
  generated_at: '2026-09-09',
  tables: [],
  views: [],
  functions: [],
  ...extra,
});

// Roda o gate com cwd num repo minimo: o catalogo antigo em supabase/ e o novo
// (candidato do sync) num arquivo separado, como o workflow faz com /tmp.
function runGate({ antigo = {}, novo = {}, callers = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zapp-gate3-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'supabase'), { recursive: true });
    writeFileSync(join(root, 'supabase', 'schema-catalog.json'), catalogo(antigo));
    writeFileSync(join(root, 'catalog.new.json'), catalogo(novo));
    for (const [file, content] of Object.entries(callers)) {
      const destino = join(root, 'src', file);
      mkdirSync(join(destino, '..'), { recursive: true });
      writeFileSync(destino, content);
    }
    return spawnSync(process.execPath, [GATE.pathname, 'supabase/schema-catalog.json', 'catalog.new.json'], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const saida = (r) => r.stdout + r.stderr;

test('Gate 3 bloqueia remocao de tabela ainda consumida (DROP TABLE public.playbooks)', () => {
  const r = runGate({
    antigo: { tables: ['playbooks'] },
    novo: { tables: [] },
    callers: { 'admin/PlaybooksManager.tsx': "supabase.from('playbooks').select('*');\n" },
  });
  assert.equal(r.status, 1, saida(r));
  assert.match(saida(r), /playbooks/);
  assert.match(saida(r), /PlaybooksManager\.tsx:1/);
});

test('Gate 3 bloqueia remocao de funcao ainda consumida (.rpc)', () => {
  const r = runGate({
    antigo: { functions: ['kick_talkx_campaign'] },
    novo: { functions: [] },
    callers: { 'talkx/campaign.ts': "supabase.rpc('kick_talkx_campaign', { p: 1 });\n" },
  });
  assert.equal(r.status, 1, saida(r));
  assert.match(saida(r), /kick_talkx_campaign/);
});

test('Gate 3 passa troca de assinatura do mesmo nome (DROP+CREATE / CREATE OR REPLACE)', () => {
  // Caso real: 20260930390000 faz CREATE OR REPLACE FUNCTION
  // public.apply_zapp_cron_secrets_l5(); o NOME continua no catalogo -> nao e remocao.
  const r = runGate({
    antigo: {
      functions: ['apply_zapp_cron_secrets_l5', 'search_contacts'],
      function_signatures: [
        'apply_zapp_cron_secrets_l5()->void|kind=f',
        'search_contacts(term text)->jsonb|kind=f',
      ],
    },
    novo: {
      functions: ['apply_zapp_cron_secrets_l5', 'search_contacts'],
      function_signatures: [
        'apply_zapp_cron_secrets_l5()->void|kind=f',
        'search_contacts(term text, include_legacy boolean)->jsonb|kind=f',
      ],
    },
    callers: { 'contatos/search.ts': "supabase.rpc('search_contacts', { term: 'x' });\n" },
  });
  assert.equal(r.status, 0, saida(r));
  assert.match(r.stdout, /nenhum objeto do catalogo foi removido/);
});

test('Gate 3 nao bloqueia remocao sem call-site', () => {
  const r = runGate({
    antigo: { tables: ['tabela_morta'], views: ['view_morta'], functions: ['fn_morta'] },
    novo: {},
    callers: { 'vivo.ts': "supabase.from('tabela_viva').select('*');\n" },
  });
  assert.equal(r.status, 0, saida(r));
  assert.match(r.stdout, /sem call-site/);
  assert.doesNotMatch(saida(r), /BLOQUEADO/);
});

test('Gate 3 decide pelo objeto, nao pelo tamanho da remocao', () => {
  // Muitos objetos removidos, nenhum consumido -> passa (o gate antigo de >10
  // linhas bloquearia pelo volume).
  const muitas = Array.from({ length: 40 }, (_, i) => 'tabela_' + i);
  const semConsumidor = runGate({ antigo: { tables: muitas }, novo: {} });
  assert.equal(semConsumidor.status, 0, saida(semConsumidor));

  // Uma unica tabela removida, consumida -> bloqueia (poucas linhas no types.ts).
  const consumida = runGate({
    antigo: { tables: muitas.concat(['playbooks']) },
    novo: { tables: muitas },
    callers: { 'admin/PlaybooksManager.tsx': "supabase.from('playbooks').select('*');\n" },
  });
  assert.equal(consumida.status, 1, saida(consumida));
});

test('Gate 3 reclama de catalogo ausente ou invalido (exit 2, sem fail-open)', () => {
  const root = mkdtempSync(join(tmpdir(), 'zapp-gate3-bad-'));
  try {
    const ausente = spawnSync(process.execPath, [GATE.pathname, 'nao-existe.json', 'tambem-nao.json'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(ausente.status, 2, saida(ausente));

    writeFileSync(join(root, 'quebrado.json'), '{ isto nao e json');
    const invalido = spawnSync(process.execPath, [GATE.pathname, 'quebrado.json', 'quebrado.json'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(invalido.status, 2, saida(invalido));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('types-sync usa o Gate 3 de objetos e nao conta mais linhas', () => {
  const wf = fs.readFileSync(WORKFLOW, 'utf8');
  // O defeito exato desta etapa: contar linhas removidas do types.ts.
  assert.doesNotMatch(wf, /grep -c '\^<'/, 'Gate 3 voltou a contar linhas do types.ts');
  // A forca manual existia porque o gate era impreciso (TRA-008: "admite force_gate3").
  assert.doesNotMatch(wf, /force_gate3/, 'o atalho force_gate3 voltou ao Gate 3');
  // E o gate precisa ser o script comparador de objetos.
  assert.match(wf, /scripts\/db-audit\/check-remocoes-destrutivas\.mjs/);
  assert.match(wf, /catalog\.new\.json/);
});
