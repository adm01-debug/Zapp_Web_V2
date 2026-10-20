// #121B — Paridade de public.talkx_engine_window_open(uuid) com o contrato de
// deliveryWindowStatus()/parseBusinessHours() (supabase/functions/_shared/talkx-window.ts).
//
// Como rodar (a partir da raiz do repo):
//   node --test scripts/db-audit/talkx-engine-window-contract.test.mjs
//
// Sobe um Postgres descartavel (docker, postgres:17-alpine), cria a superficie
// minima (talkx_campaigns + talkx_settings), instala a forma ANTERIOR da funcao
// — recortada da migration real 20261003242707_talkx_log_saude_alertas.sql — e
// roda em tres blocos, sempre chamando a funcao como papel de aplicacao
// (authenticated/service_role), nunca como superusuario:
//   BLOCO A (vermelho): a versao anterior mede o business_hours no fuso da
//     campanha e nao valida o JSONB — o veredito diverge do contrato ou a
//     funcao derruba com excecao em entrada invalida.
//   BLOCO B (verde): aplica a migration real *_talkx_engine_window_contract.sql
//     e prova o contrato inteiro — send_window_* no fuso da campanha,
//     business_hours no tz proprio do JSONB (com vereditos divergentes entre
//     fusos), ausencia -> default 08:00-18:00 seg-sex America/Sao_Paulo, valor
//     presente invalido -> false SEM excecao, e um valor valido 15:00-17:00
//     que nao e substituido pelo default.
//   BLOCO C (rollback): extrai o bloco "-- Rollback (completo)" do proprio
//     arquivo da migration, executa e confere que o comportamento antigo
//     volta; depois reaplica a migration (idempotencia).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const DOCKER = resolverExecutavel('docker');
const CONTAINER = `zapp-v2-talkx-window-${process.pid}`;
const IMAGE = process.env.TALKX_WINDOW_TEST_POSTGRES_IMAGE || 'postgres:17-alpine';

// ── SQL dos artefatos reais ──────────────────────────────────────────────────

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /_talkx_engine_window_contract\.sql$/.test(f));
assert.equal(
  migrationFiles.length, 1,
  `esperada exatamente 1 migration *_talkx_engine_window_contract.sql, achei: ${migrationFiles.join(', ') || 'nenhuma'}`,
);
const migrationSql = readFileSync(join(MIGRATIONS_DIR, migrationFiles[0]), 'utf8');

const fonteAnterior = readFileSync(
  join(MIGRATIONS_DIR, '20261003242707_talkx_log_saude_alertas.sql'), 'utf8',
);

/** Recorta o CREATE..COMMENT da funcao numa migration (do CREATE ao banner seguinte). */
function extrairBlocoFuncao(fonte) {
  const inicio = fonte.indexOf('CREATE OR REPLACE FUNCTION public.talkx_engine_window_open');
  assert.notEqual(inicio, -1, 'CREATE da funcao nao encontrado na fonte');
  const fim = fonte.indexOf('-- =====', inicio);
  assert.notEqual(fim, -1, 'banner de secao apos a funcao nao encontrado');
  return fonte.slice(inicio, fim);
}

/** Extrai o SQL do bloco "-- Rollback (completo)" (linhas "-- > ") da migration. */
function extrairRollback(fonte) {
  const inicio = fonte.indexOf('-- Rollback (completo');
  const fim = fonte.indexOf('-- Fim do rollback.');
  assert.notEqual(inicio, -1, 'cabecalho do rollback nao encontrado na migration');
  assert.notEqual(fim, -1, 'marcador "-- Fim do rollback." nao encontrado');
  const linhas = fonte.slice(inicio, fim).split('\n')
    .filter((l) => l.startsWith('-- >'))
    .map((l) => l.slice(4));
  assert.ok(linhas.length > 10, 'rollback extraido ficou vazio — o bloco nao e executavel');
  return linhas.join('\n');
}

// ── Postgres descartavel ─────────────────────────────────────────────────────

function docker(args, opts = {}) {
  return spawnSync(DOCKER, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}

/** Roda SQL via stdin; role faz SET ROLE antes (papel de aplicacao, nao superusuario). */
function psql(sql, role) {
  const entrada = role ? `SET ROLE ${role};\n${sql}` : sql;
  return docker(
    ['exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: entrada },
  );
}

function psqlOk(sql, role) {
  const r = psql(sql, role);
  assert.equal(r.status, 0, `psql falhou (role=${role ?? 'postgres'}): ${r.stderr || r.stdout}`);
  return (r.stdout.trim().split('\n').pop() ?? '').trim();
}

function dormir(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const PRE_SQL = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false
);
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
`;

let containerOk = false;

before(() => {
  const info = docker(['info']);
  assert.equal(info.status, 0, 'daemon docker inacessivel: a prova em Postgres descartavel nao pode rodar');
  const run = docker([
    'run', '--rm', '-d', '--name', CONTAINER,
    '-e', 'POSTGRES_PASSWORD=test_only', IMAGE,
  ]);
  assert.equal(run.status, 0, `docker run falhou: ${run.stderr}`);
  containerOk = true;
  let pronto = 0;
  for (let i = 0; i < 90 && pronto < 2; i += 1) {
    if (psql('SELECT 1').status === 0) pronto += 1;
    else { pronto = 0; dormir(1000); }
  }
  assert.ok(pronto >= 2, 'postgres descartavel nao ficou pronto de forma estavel');
  psqlOk(PRE_SQL);
  // estado ANTERIOR: a funcao como ela existe hoje, recortada da migration real.
  psqlOk(extrairBlocoFuncao(fonteAnterior));
});

after(() => {
  if (containerOk) docker(['rm', '-f', CONTAINER]);
});

// ── relogio local por fuso (espelha localClockInTimezone do edge) ────────────

const DIA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const FUSOS = [
  // Cobertura completa dos offsets inteiros (sinal POSIX invertido em Etc/GMT):
  // evita lacunas como UTC-1/-2 e UTC+6/+7, que deixavam B5 dependente da hora do CI.
  'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10',
  'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5',
  'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT',
  'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5',
  'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10',
  'Etc/GMT+11', 'Etc/GMT+12',
  'Pacific/Auckland', 'Pacific/Chatham', 'Australia/Sydney', 'Asia/Tokyo',
  'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/Moscow', 'Europe/Berlin',
  'Europe/London', 'UTC', 'Atlantic/Azores', 'America/Sao_Paulo',
  'America/Santiago', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'Pacific/Pago_Pago',
];

function agora() {
  return new Date(Number(psqlOk('SELECT extract(epoch from now())::bigint')) * 1000);
}

function relogioEm(tz, quando) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(quando).map((p) => [p.type, p.value]),
  );
  // en-US pode devolver "24" a meia-noite (h24): normaliza para o relogio de parede.
  const hora = Number(partes.hour) % 24;
  return { dia: DIA[partes.weekday], min: hora * 60 + Number(partes.minute) };
}

function hhmm(totalMin) {
  const m = ((totalMin % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function minDeHhmm(texto) {
  const [h, m] = texto.split(':').map(Number);
  return h * 60 + m;
}

function minDentroDaJanela(min, janela) {
  const inicio = minDeHhmm(janela.inicio);
  const fim = minDeHhmm(janela.fim);
  if (inicio < fim) return min >= inicio && min < fim;
  if (inicio > fim) return min >= inicio || min < fim;
  return false;
}

/** Janela nao-ambigua (inicio<fim) que CONTEM min com ~2h de margem. */
function janelaQueContem(min) {
  const inicio = Math.max(0, Math.min(min - 120, 1439 - 240));
  return { inicio: hhmm(inicio), fim: hhmm(inicio + 240) };
}

function diasComProximos(...dias) {
  return [...new Set(dias.flatMap((dia) => [dia, (dia + 1) % 7]))];
}

/**
 * Le um relogio cujo minuto cabe na janela gerada e ainda tem pelo menos 2 min
 * antes do fim exclusivo. Na fronteira 23:59 (e no minuto anterior), espera a
 * virada e rele o instante para nao criar janela que ja fechou antes da chamada.
 */
function relogioSeguroParaJanela(tz) {
  for (let tentativa = 0; tentativa < 125; tentativa += 1) {
    const quando = agora();
    const relogio = relogioEm(tz, quando);
    const janela = janelaQueContem(relogio.min);
    const margemAteFim = minDeHhmm(janela.fim) - relogio.min;
    if (minDentroDaJanela(relogio.min, janela) && margemAteFim >= 2) {
      return { quando, ...relogio, janela };
    }
    dormir(1000);
  }
  throw new Error(`relogio ${tz} ficou preso na fronteira 23:59/23:58 por mais de 2 minutos`);
}

/** Janela nao-ambigua que NAO contem min, com >= 2h de distancia. */
function janelaQueEvita(min) {
  return min > 360
    ? { inicio: '00:00', fim: hhmm(min - 180) }
    : { inicio: hhmm(min + 180), fim: '23:59' };
}

/** Fuso cuja hora local cai dentro de [lo, hi) minutos; falha se nenhum servir. */
function fusoComLocalEm(lo, hi) {
  const quando = agora();
  const achados = FUSOS.filter((tz) => {
    const { min } = relogioEm(tz, quando);
    return min >= lo && min < hi;
  });
  assert.ok(achados.length > 0, `nenhum fuso da lista cai em [${lo},${hi}) agora`);
  return { tz: achados[0], quando };
}

// ── dados e chamada da funcao sob teste ──────────────────────────────────────

function sqlText(v) { return `'${String(v).replace(/'/g, "''")}'`; }

function criarCampanha({ tz = 'UTC', inicio = null, fim = null, bhOnly = false } = {}) {
  return psqlOk(
    `INSERT INTO public.talkx_campaigns
       (schedule_timezone, send_window_start, send_window_end, business_hours_only)
     VALUES (${tz === null ? 'NULL' : sqlText(tz)},
             ${inicio === null ? 'NULL' : `${sqlText(inicio)}::time`},
             ${fim === null ? 'NULL' : `${sqlText(fim)}::time`},
             ${bhOnly ? 'true' : 'false'})
     RETURNING id`,
  );
}

function definirBusinessHours(valor) {
  if (valor === undefined) {
    psqlOk("DELETE FROM public.talkx_settings WHERE key = 'business_hours'");
    return;
  }
  psqlOk(
    `INSERT INTO public.talkx_settings (key, value)
     VALUES ('business_hours', ${sqlText(JSON.stringify(valor))}::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
}

function janela(id, role = 'authenticated') {
  return psqlOk(`SELECT public.talkx_engine_window_open('${id}'::uuid)`, role);
}

/**
 * Espera `esperado`('t'/'f') numa chamada; se o relogio virar de minuto entre a
 * leitura e a chamada (fronteira de janela), reavalia com o novo instante.
 */
function esperarJanela(id, calcularEsperado, papel = 'authenticated') {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const antes = agora();
    const esperado = calcularEsperado(antes);
    const obtido = janela(id, papel);
    if (calcularEsperado(agora()) === esperado) {
      assert.equal(obtido, esperado, `veredito divergente para campanha ${id}`);
      return obtido;
    }
  }
  throw new Error('relogio instavel na fronteira da janela (3 tentativas)');
}

// ── BLOCO A — vermelho: a funcao ANTERIOR diverge do contrato ────────────────

test('A1: versao anterior mede business_hours no fuso da CAMPANHA (defeito do cartao)', () => {
  const utc = relogioSeguroParaJanela('UTC');
  const akl = relogioEm('Pacific/Auckland', utc.quando);
  const janelaUtc = utc.janela;
  assert.ok(
    !minDentroDaJanela(akl.min, janelaUtc),
    'pre-condicao: Auckland fora da janela UTC realmente gerada',
  );
  // bh valido com janela ao redor da hora UTC e tz proprio Auckland:
  // contrato (relogio Auckland, ~12h adiante) => 'f'; versao anterior (relogio
  // UTC, da campanha) => 't'.
  definirBusinessHours({
    start: janelaUtc.inicio, end: janelaUtc.fim,
    tz: 'Pacific/Auckland', days: diasComProximos(utc.dia, akl.dia),
  });
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });
  assert.equal(janela(id), 't',
    'a versao anterior tinha de responder ABERTA medindo no fuso errado — o defeito sumiu?');
});

test('A2: versao anterior ignora tz invalido do business_hours e abre a janela', () => {
  const utc = relogioSeguroParaJanela('UTC');
  const janelaUtc = utc.janela;
  definirBusinessHours({
    start: janelaUtc.inicio, end: janelaUtc.fim, tz: 'Marte/Olympus', days: diasComProximos(utc.dia),
  });
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });
  assert.equal(janela(id), 't',
    'a versao anterior tinha de ignorar o tz invalido e responder ABERTA');
});

test('A3: versao anterior DERRUBA com excecao em business_hours invalido (falha, nao recusa)', () => {
  definirBusinessHours({ start: 'abc', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] });
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });
  const r = psql(`SELECT public.talkx_engine_window_open('${id}'::uuid)`, 'authenticated');
  assert.notEqual(r.status, 0,
    'a versao anterior tinha de estourar excecao (cast de "abc"), mas respondeu: ' + r.stdout);
});

// ── BLOCO B — verde: a migration alinha a saude ao contrato ─────────────────

test('B0: migration aplica e preserva assinatura, SECURITY DEFINER, search_path e GRANTs', () => {
  psqlOk(migrationSql);
  const meta = psqlOk(
    `SELECT p.prosecdef::text || '|' || p.provolatile::text || '|' || p.pronargs || '|'
            || array_to_string(p.proconfig, ',')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'talkx_engine_window_open'`,
  );
  const [secdef, volatil, nargs, config] = meta.split('|');
  assert.equal(secdef, 'true', 'SECURITY DEFINER tem de ser preservado');
  assert.equal(volatil, 's', 'STABLE tem de ser preservado');
  assert.equal(nargs, '1', 'a assinatura segue (uuid)');
  assert.match(config, /search_path=public, pg_temp/, 'search_path=public, pg_temp preservado');
  assert.equal(
    psqlOk("SELECT has_function_privilege('authenticated','public.talkx_engine_window_open(uuid)','EXECUTE')"),
    't', 'authenticated perdeu EXECUTE');
  assert.equal(
    psqlOk("SELECT has_function_privilege('service_role','public.talkx_engine_window_open(uuid)','EXECUTE')"),
    't', 'service_role perdeu EXECUTE');
  assert.equal(
    psqlOk("SELECT has_function_privilege('anon','public.talkx_engine_window_open(uuid)','EXECUTE')"),
    'f', 'anon nao pode ter EXECUTE');
  const comoAnon = psql(`SELECT public.talkx_engine_window_open('${criarCampanha({ tz: 'UTC' })}'::uuid)`, 'anon');
  assert.notEqual(comoAnon.status, 0, 'anon nao pode executar a funcao (PUBLIC revogado)');
  assert.match(comoAnon.stderr, /permission denied/i, 'o erro de anon tem de ser permission denied');
});

test('B1: send_window_* e avaliado no fuso da CAMPANHA', () => {
  definirBusinessHours(undefined);
  const utc = relogioSeguroParaJanela('UTC');

  const faixa = utc.janela;
  const dentro = criarCampanha({ tz: 'UTC', ...faixa });
  esperarJanela(dentro, () => 't');

  // mesma faixa de horario, campanha em Auckland (~12h fora): fecha.
  const mesmaFaixaOutroFuso = criarCampanha({ tz: 'Pacific/Auckland', ...faixa });
  esperarJanela(mesmaFaixaOutroFuso, (q) => {
    const a = relogioEm('Pacific/Auckland', q).min;
    return a >= minDeHhmm(faixa.inicio) && a < minDeHhmm(faixa.fim) ? 't' : 'f';
  });

  const fora = criarCampanha({ tz: 'UTC', ...janelaQueEvita(utc.min) });
  esperarJanela(fora, () => 'f');
});

test('B2: schedule_timezone invalido fecha a janela, sem excecao', () => {
  definirBusinessHours(undefined);
  for (const tz of ['Marte/Olympus', '', 'Nao e fuso']) {
    const id = criarCampanha({ tz });
    assert.equal(janela(id), 'f', `schedule_timezone ${JSON.stringify(tz)} tinha de fechar`);
  }
  assert.equal(
    janela(psqlOk("SELECT gen_random_uuid()")),
    'f', 'campanha inexistente tem de fechar');
});

test('B3: business_hours usa o tz PROPRIO do JSONB — vereditos divergentes entre fusos', () => {
  const utc = relogioSeguroParaJanela('UTC');
  const akl = relogioEm('Pacific/Auckland', utc.quando);

  // Direcao 1: janela contem a hora UTC mas NAO a de Auckland -> contrato fecha.
  const janelaUtc = utc.janela;
  const bhFecha = {
    start: janelaUtc.inicio, end: janelaUtc.fim,
    tz: 'Pacific/Auckland', days: diasComProximos(utc.dia, akl.dia),
  };
  assert.ok(
    !minDentroDaJanela(akl.min, janelaUtc),
    'pre-condicao: Auckland fora da janela UTC realmente gerada',
  );
  definirBusinessHours(bhFecha);
  const campanhaUtc = criarCampanha({ tz: 'UTC', bhOnly: true });
  assert.equal(janela(campanhaUtc), 'f',
    'business_hours tinha de fechar no relogio de Auckland mesmo com a hora UTC dentro');
  const campanhaNy = criarCampanha({ tz: 'America/New_York', bhOnly: true });
  assert.equal(janela(campanhaNy), 'f',
    'o tz da campanha nao pode mudar o veredito do business_hours');

  // Direcao 2: janela contem a hora de Auckland mas NAO a UTC -> contrato abre.
  const aklSeguro = relogioSeguroParaJanela('Pacific/Auckland');
  const janelaAkl = aklSeguro.janela;
  const bhAbre = {
    start: janelaAkl.inicio, end: janelaAkl.fim,
    tz: 'Pacific/Auckland', days: diasComProximos(utc.dia, aklSeguro.dia),
  };
  definirBusinessHours(bhAbre);
  assert.equal(janela(criarCampanha({ tz: 'UTC', bhOnly: true })), 't',
    'business_hours tinha de abrir no relogio de Auckland mesmo com a hora UTC fora');
  assert.equal(janela(criarCampanha({ tz: 'America/New_York', bhOnly: true })), 't',
    'idem, independente do fuso da campanha');
});

test('B4: ausencia usa o default 08:00-18:00 seg-sex em America/Sao_Paulo', () => {
  const esperadoDefault = (q) => {
    const sp = relogioEm('America/Sao_Paulo', q);
    return sp.dia >= 1 && sp.dia <= 5 && sp.min >= 480 && sp.min < 1080 ? 't' : 'f';
  };
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });

  definirBusinessHours(undefined); // sem linha
  esperarJanela(id, esperadoDefault);

  definirBusinessHours(null); // value = 'null'::jsonb (PostgREST entrega null)
  esperarJanela(id, esperadoDefault);

  definirBusinessHours('   '); // string vazia = ausencia, como o edge
  esperarJanela(id, esperadoDefault);
});

test('B5: business_hours presente e valido 15:00-17:00 NAO e substituido pelo default', () => {
  // banda onde o default 08:00-18:00 abriria mas 15:00-17:00 fecha (e o contrario).
  const foraDo1517 = fusoComLocalEm(480, 900); // local em 08:00-15:00
  const relogio1 = relogioEm(foraDo1517.tz, foraDo1517.quando);
  definirBusinessHours({
    start: '15:00', end: '17:00', tz: foraDo1517.tz, days: [relogio1.dia],
  });
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });
  esperarJanela(id, (q) => {
    const r = relogioEm(foraDo1517.tz, q);
    return r.dia === relogio1.dia && r.min >= 900 && r.min < 1020 ? 't' : 'f';
  });

  const dentro1517 = fusoComLocalEm(900, 1020); // local em 15:00-17:00
  const relogio2 = relogioEm(dentro1517.tz, dentro1517.quando);
  definirBusinessHours({
    start: '15:00', end: '17:00', tz: dentro1517.tz, days: [relogio2.dia],
  });
  esperarJanela(id, (q) => {
    const r = relogioEm(dentro1517.tz, q);
    return r.dia === relogio2.dia && r.min >= 900 && r.min < 1020 ? 't' : 'f';
  });
});

test('B6: business_hours presente e INVALIDO fecha a janela, sem excecao', () => {
  const invalidos = [
    {},                                                         // objeto vazio
    { start: '08:00' },                                         // faltam end/days
    { start: '25:00', end: '18:00', days: [1, 2, 3, 4, 5] },    // hora fora
    { start: '08:00', end: '18:60', days: [1, 2, 3, 4, 5] },    // minuto fora
    { start: '8:00', end: '18:00', days: [1, 2, 3, 4, 5] },     // fora de HH:MM
    { start: 8, end: '18:00', days: [1, 2, 3, 4, 5] },          // start nao-string
    { start: '08:00', end: '18:00', days: [] },                 // nenhum dia
    { start: '08:00', end: '18:00', days: [7] },                // fora de 0..6
    { start: '08:00', end: '18:00', days: [-1] },
    { start: '08:00', end: '18:00', days: [1.5] },              // nao inteiro
    { start: '08:00', end: '18:00', days: ['seg'] },            // dia nao-numero
    { start: '08:00', end: '18:00', days: 5 },                  // days nao-array
    { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 'Marte/Olympus' },
    { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: '' },
    { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 5 },
    [1, 2, 3],                                                  // array topo
    42,                                                         // numero topo
    'nao e json',                                               // string nao-JSON
    'null',                                                     // string que decodifica null
    '{"start":"08:00"',                                         // string JSON quebrada
  ];
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });
  for (const valor of invalidos) {
    definirBusinessHours(valor);
    const papel = JSON.stringify(valor) === '42' ? 'service_role' : 'authenticated';
    assert.equal(
      janela(id, papel), 'f',
      `business_hours invalido tinha de FECHAR (${papel}): ${JSON.stringify(valor)}`,
    );
  }
});

test('B7: business_hours valido abre — inclusive no formato legado string-JSON', () => {
  const sp = relogioSeguroParaJanela('America/Sao_Paulo');
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });

  // tz ausente -> fuso comercial Sao_Paulo (janela ampla ao redor da hora SP).
  const janelaSp = sp.janela;
  const diasSp = diasComProximos(sp.dia);
  const esperadoAbertoSp = (q) => {
    const atual = relogioEm('America/Sao_Paulo', q);
    return diasSp.includes(atual.dia) && minDentroDaJanela(atual.min, janelaSp) ? 't' : 'f';
  };

  definirBusinessHours({ start: janelaSp.inicio, end: janelaSp.fim, days: diasSp });
  esperarJanela(id, esperadoAbertoSp);

  // tz nulo -> mesmo default de fuso.
  definirBusinessHours({ start: janelaSp.inicio, end: janelaSp.fim, days: diasSp, tz: null });
  esperarJanela(id, esperadoAbertoSp);

  // value JSONB contendo uma STRING com JSON dentro (compat do parseBusinessHours).
  definirBusinessHours(JSON.stringify({
    start: janelaSp.inicio, end: janelaSp.fim, tz: 'America/Sao_Paulo', days: diasSp,
  }));
  esperarJanela(id, esperadoAbertoSp);
});

test('B8: business_hours invalido so e lido quando business_hours_only=true', () => {
  definirBusinessHours({ start: 'abc' }); // presente e invalido
  const semBhOnly = criarCampanha({ tz: 'UTC', bhOnly: false });
  esperarJanela(semBhOnly, () => 't', 'authenticated');
  const comBhOnly = criarCampanha({ tz: 'UTC', bhOnly: true });
  assert.equal(janela(comBhOnly), 'f');
});

// ── BLOCO C — rollback executavel restaura o comportamento anterior ─────────

test('C1: rollback restaura corpo, GRANTs e comentario; reaplicar e idempotente', () => {
  // mesmo caso discriminante de B3: no estado anterior a funcao responde 't'
  // porque mede o business_hours no fuso da campanha.
  const utc = relogioSeguroParaJanela('UTC');
  const akl = relogioEm('Pacific/Auckland', utc.quando);
  const janelaUtc = utc.janela;
  assert.ok(
    !minDentroDaJanela(akl.min, janelaUtc),
    'pre-condicao: Auckland fora da janela UTC realmente gerada',
  );
  definirBusinessHours({
    start: janelaUtc.inicio, end: janelaUtc.fim,
    tz: 'Pacific/Auckland', days: diasComProximos(utc.dia, akl.dia),
  });
  const id = criarCampanha({ tz: 'UTC', bhOnly: true });
  assert.equal(janela(id), 'f', 'pre-condicao: com a migration o veredito e fechado');

  const rollback = extrairRollback(migrationSql);
  psqlOk(rollback);
  assert.equal(janela(id), 't',
    'apos o rollback a funcao volta a medir no fuso da campanha (comportamento anterior)');
  assert.equal(
    psqlOk("SELECT has_function_privilege('authenticated','public.talkx_engine_window_open(uuid)','EXECUTE')"),
    't', 'o rollback tem de manter o GRANT para authenticated');
  assert.equal(
    psqlOk("SELECT has_function_privilege('anon','public.talkx_engine_window_open(uuid)','EXECUTE')"),
    'f', 'o rollback nao pode reabrir EXECUTE para anon');
  assert.match(
    psqlOk("SELECT obj_description('public.talkx_engine_window_open(uuid)'::regprocedure)"),
    /X033/, 'o rollback tem de restaurar o comentario anterior da funcao');

  psqlOk(migrationSql); // idempotencia: reaplicar devolve o comportamento do contrato
  assert.equal(janela(id), 'f', 'reaplicar a migration tem de voltar a fechar');
});
