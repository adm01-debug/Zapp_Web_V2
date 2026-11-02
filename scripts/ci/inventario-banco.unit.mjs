// Contrato de scripts/inventario/gerar-banco.mjs: le a resposta do banco.sql (psql ou MCP),
// cruza com o uso no codigo e grava inventario/estado/banco.json com orfas e alertas
// calculados — nada escrito a mao. Aqui so as funcoes puras; o SQL e validado contra o
// banco real por quem roda o script (CI semanal ou agente com MCP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extrairInventario, contarUsoNoCodigo, montarInventario, LIMIARES } from '../inventario/gerar-banco.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const tabela = (nome, extra = {}) => ({
  nome, rls: true, rls_forcado: false, policies: 1, triggers: 0, linhas: 0, linhas_exatas: true, bytes: 8192, citada_no_banco: false, ...extra,
});
const job = (nome, extra = {}) => ({
  nome, agenda: '* * * * *', ativo: true, chama: [], execucoes_24h: 0, falhas_24h: 0, execucoes_7d: 100, falhas_7d: 0,
  startup_timeout_7d: 0, taxa_falha_7d_pct: 0, ultima_falha: null, duracao_max_s_7d: 1, ...extra,
});
const base = () => ({
  format_version: 1,
  medido_em: '2026-11-02T00:00:00Z',
  resumo: { tabelas_public: 3 },
  tabelas: [tabela('orfa'), tabela('citada', { citada_no_banco: true }), tabela('com_linhas', { linhas: 5 }), tabela('usada_no_front')],
  cron: { config: {}, jobs: [job('ok')], horas_paradas_7d: [], historico: { linhas: 10, mais_de_7_dias: 0, mais_antigo: null, bytes: 1 } },
  whatsapp: { conexoes: [{ nome: 'P', instance_id: 'PRINCIPAL', padrao: true, status: 'connected' }], mensagens_7d: 1 },
});

test('extrairInventario aceita a resposta crua do MCP, o objeto direto e a linha do psql', () => {
  const dado = base();
  assert.equal(extrairInventario({ rows: [{ inventario: dado }] }).medido_em, dado.medido_em);
  assert.equal(extrairInventario(JSON.stringify({ rows: [{ inventario: dado }] })).tabelas.length, 4);
  assert.equal(extrairInventario(JSON.stringify(dado) + '\n').tabelas.length, 4);
  assert.equal(extrairInventario({ rows: [{ inventario: JSON.stringify(dado) }] }).tabelas.length, 4);
});

test('extrairInventario recusa entrada incompleta, vazia ou de outra versao', () => {
  assert.throws(() => extrairInventario({ rows: [{ inventario: { format_version: 1 } }] }), /sem as chaves/);
  assert.throws(() => extrairInventario({ ...base(), format_version: 2 }), /format_version 2/);
  assert.throws(() => extrairInventario({ ...base(), tabelas: [] }), /sem tabelas/);
  assert.throws(() => extrairInventario('nao e json'));
});

test('orfa = 0 linhas, nao citada no banco e sem .from() no codigo', () => {
  const uso = { usada_no_front: { src: 2, edges: 0 } };
  const inv = montarInventario(base(), uso);
  assert.deepEqual(inv.tabelas_orfas.lista, ['orfa']);
  assert.deepEqual(inv.tabelas.find((t) => t.nome === 'usada_no_front').uso_no_codigo, { src: 2, edges: 0 });
  assert.deepEqual(inv.tabelas.find((t) => t.nome === 'orfa').uso_no_codigo, { src: 0, edges: 0 });
});

test('sem problema nenhum, nenhum alerta', () => {
  assert.deepEqual(montarInventario(base(), {}).alertas, []);
});

test('alertas: sem RLS, cron falhando, cron parado, historico sem limpeza, WhatsApp desconectado', () => {
  const dado = base();
  dado.tabelas[2].rls = false;
  dado.cron.jobs.push(job('ruim', { taxa_falha_7d_pct: LIMIARES.taxaFalhaCronPct }));
  dado.cron.jobs.push(job('ruim-mas-inativo', { ativo: false, taxa_falha_7d_pct: 90 }));
  dado.cron.horas_paradas_7d = [{ hora: '2026-10-31T04:00Z', execucoes: 10, falhas: 9 }];
  dado.cron.historico.mais_de_7_dias = LIMIARES.historicoCronMaisDe7Dias + 1;
  dado.whatsapp.conexoes[0].status = 'disconnected';
  const tipos = Object.fromEntries(montarInventario(dado, {}).alertas.map((a) => [a.tipo, a.detalhe]));
  assert.deepEqual(tipos.tabela_sem_rls, ['com_linhas']);
  assert.deepEqual(tipos.cron_falhando, [`ruim (${LIMIARES.taxaFalhaCronPct}% em 7d)`]);
  assert.deepEqual(tipos.cron_parado, ['2026-10-31T04:00Z']);
  assert.match(tipos.historico_cron_sem_limpeza[0], /linhas com mais de 7 dias/);
  assert.deepEqual(tipos.whatsapp_desconectado, ['PRINCIPAL: disconnected']);
});

test('sem conexao padrao vira alerta proprio', () => {
  const dado = base();
  dado.whatsapp.conexoes[0].padrao = false;
  assert.ok(montarInventario(dado, {}).alertas.some((a) => a.tipo === 'whatsapp_sem_conexao_padrao'));
});

test('saida tem chaves ordenadas (diff estavel entre execucoes)', () => {
  const inv = montarInventario(base(), {});
  assert.deepEqual(Object.keys(inv), [...Object.keys(inv)].sort());
  assert.deepEqual(Object.keys(inv.tabelas[0]), [...Object.keys(inv.tabelas[0])].sort());
});

test('contarUsoNoCodigo conta .from() em src e edges e ignora testes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-banco-'));
  fs.mkdirSync(path.join(dir, 'src/hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/__tests__'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'supabase/functions/x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/hooks/a.ts'), "supabase.from('contatos').select(); db.from(\"contatos\")\n.from(`outra`)");
  fs.writeFileSync(path.join(dir, 'src/__tests__/a.test.ts'), "supabase.from('contatos')");
  fs.writeFileSync(path.join(dir, 'src/hooks/b.test.tsx'), "supabase.from('contatos')");
  fs.writeFileSync(path.join(dir, 'supabase/functions/x/index.ts'), "admin.from( 'contatos' )");
  const uso = contarUsoNoCodigo(dir, ['contatos', 'nada']);
  assert.deepEqual(uso, { contatos: { src: 2, edges: 1 }, nada: { src: 0, edges: 0 } });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('banco.sql so le: nenhum comando de escrita e nada de command/telefone/QR/token', () => {
  const sql = fs.readFileSync(path.join(raiz, 'scripts/inventario/banco.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(sql, /'command'|phone_number|qr_code|instance_token/);
  assert.match(sql, /regexp_matches\(j\.command/, 'de cron.job sai so o nome das funcoes chamadas');
});
