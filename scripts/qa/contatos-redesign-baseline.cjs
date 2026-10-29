#!/usr/bin/env node
/**
 * RD-001 — Linha de base visual e de medida do módulo Contatos (ANTES do redesign).
 *
 * Grava, para 4 larguras (390, 768, 1280, 1672 px) x 2 temas (escuro e claro), uma
 * captura PNG e um conjunto de números de ANTES:
 *   - altura em px da primeira linha de cards;
 *   - quantos cards cabem sem rolar;
 *   - peso do módulo Contatos (soma do responseBodySize das requisições JS/CSS do módulo);
 *   - total de requisições e requisições falhas;
 *   - erros de console e exceções de página.
 *
 * Reutiliza a receita das specs de Contatos: sessão FALSA
 * (`installFakeSession`), backend 100% mockado (`mockAppShell` + rotas de Contatos) e
 * guarda de rede (`bloquearRedeReal`) — NADA sai para o Supabase real. Reutiliza também
 * `gotoContacts`/`contactCards` de `e2e/fixtures/contacts-page.ts`, sem reimplementar
 * login nem espera de carga.
 *
 * Uso (um comando):
 *   npx tsx scripts/qa/contatos-redesign-baseline.cjs
 *
 * Env:
 *   BASELINE_BASE_URL  — reaproveita um servidor já no ar (SEM valor padrão: sem
 *     ele, a ferramenta SOBE o `vite` a partir da porta 5500, na primeira livre).
 *   BASELINE_NAO_SUBE  — 1 = não sobe o `vite` (exige BASELINE_BASE_URL respondendo;
 *     com BASELINE_BASE_URL definido, só reaproveita o servidor).
 *   BASELINE_SO        — só mede estas combinações `LARGURAxTEMA` separadas por
 *     vírgula (ex.: `BASELINE_SO=1280xdark,390xlight`); com ele, o relatório NÃO
 *     é reescrito.
 *   BASELINE_DEBUG     — 1 = registra quantos recursos js/css foram medidos por rodada.
 *
 * O "peso do módulo" usa `responseBodySize` do lado do Node (`request.sizes()`),
 * não `performance.getEntriesByType('resource')` (que volta vazia com o relógio
 * congelado do `page.clock`).
 *
 * `tsx` (já em devDependencies) é usado só para carregar as fixtures .ts do e2e;
 * nenhuma dependência nova é adicionada.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const fixture = (nome) => path.join(ROOT, 'e2e', 'fixtures', nome);

const { chromium, expect } = require('@playwright/test');
const { contactCards, gotoContacts } = require(fixture('contacts-page.ts'));
const { installFakeSession } = require(fixture('talkx-demo.ts'));
const { bloquearRedeReal, json, mockAppShell, querObjetoUnico } = require(fixture('mapa-mocks.ts'));

const PORTA_BASE = 5500;
let BASE_URL = process.env.BASELINE_BASE_URL || '';
let PORTA = PORTA_BASE;
const OUT_DIR = path.join(ROOT, 'docs', 'audits', 'contatos-redesign-baseline');
const RELATORIO = path.join(ROOT, 'docs', 'audits', 'CONTATOS_REDESIGN_BASELINE_2026-10-12.md');
const LIMITE_PNG = 300 * 1024;

const LARGURAS = [390, 768, 1280, 1672];
const TEMAS = ['dark', 'light'];
const alturaDe = (w) => (w >= 768 ? 900 : 844);

const AGORA = new Date('2026-09-15T12:00:00.000Z');
const DIA = 86_400_000;

/** Mesmo conjunto sintético determinístico de `e2e/contacts-snapshots.spec.ts`. */
function contato(n, nome, tipo, extra) {
  const criado = new Date(AGORA.getTime() - extra.dias * DIA).toISOString();
  return {
    id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
    name: nome, nickname: null, surname: null,
    job_title: extra.job_title ?? null, company: extra.company ?? null,
    phone: `55119${String(80000000 + n * 1111).padStart(8, '0')}`,
    email: extra.email ?? null, contact_type: tipo,
    created_at: criado, updated_at: criado,
    deleted_at: null, is_lid_legacy: false,
    tags: extra.tags ?? [], avatar_url: null,
    address: null, address_number: null, neighborhood: null, city: null, state: null, postal_code: null,
    latitude: null, longitude: null, assigned_to: null, queue_id: null,
  };
}

const CONTATOS = [
  contato(1, 'Ana Beatriz Souza', 'cliente', { company: 'Brindes Paulista', job_title: 'Compradora', email: 'ana@brindespaulista.com.br', tags: ['vip'], dias: 2 }),
  contato(2, 'Bruno Carvalho', 'cliente', { company: 'Grupo Horizonte', job_title: 'Gerente de marketing', dias: 5 }),
  contato(3, 'Carla Mendes', 'fornecedor', { company: 'Têxtil Aurora', email: 'carla@textilaurora.com.br', dias: 12 }),
  contato(4, 'Diego Fernandes', 'transportadora', { company: 'Rápido Sul Logística', dias: 20 }),
  contato(5, 'Eduarda Lima', 'colaborador', { job_title: 'Designer', dias: 33 }),
  contato(6, 'Felipe Rocha', 'prestador_servico', { company: 'Rocha Serigrafia', dias: 47 }),
  contato(7, 'Gabriela Nunes', 'parceiro', { company: 'Agência Nunes', tags: ['evento'], dias: 61 }),
  contato(8, 'Henrique Alves', 'cliente', { company: 'Brindes Paulista', dias: 90 }),
];

const CONTAGEM_POR_TIPO = Object.entries(
  CONTATOS.reduce((acc, c) => ({ ...acc, [c.contact_type]: (acc[c.contact_type] ?? 0) + 1 }), {}),
).map(([contact_type, count]) => ({ contact_type, count }));

async function mockBackendContatos(page) {
  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') return json(route, { message: 'blocked' }, 403);
    return json(route, querObjetoUnico(route) ? CONTATOS[0] : CONTATOS);
  });
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) =>
    json(route, CONTATOS.map((c) => ({ ...c, total_count: CONTATOS.length }))));
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) => json(route, CONTAGEM_POR_TIPO));
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) =>
    json(route, CONTATOS.slice(0, 4).map((c, i) => ({
      contact_id: c.id,
      last_message_at: new Date(AGORA.getTime() - (i + 1) * 3 * 3_600_000).toISOString(),
    }))));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, CONTATOS.map((c) => ({ contact_id: c.id, can_delete: true }))));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
}

/** Toasts globais não fazem parte da tela de Contatos (mesma regra da spec de snapshots). */
const SEM_TOASTS = '[data-sonner-toaster], [role="region"][aria-label^="Notifications"] { display: none !important; }';

async function servidorResponde(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function esperarServidor(url, timeoutMs) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await servidorResponde(url)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Primeira porta livre a partir de `inicio`. */
function portaLivre(inicio) {
  return new Promise((resolve, reject) => {
    const tentar = (porta) => {
      const srv = net.createServer();
      srv.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && porta < inicio + 50) return tentar(porta + 1);
        reject(e);
      });
      srv.once('listening', () => srv.close(() => resolve(porta)));
      srv.listen(porta, '127.0.0.1');
    };
    tentar(inicio);
  });
}

function subirVite(porta) {
  const proc = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(porta), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false,
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});
  return proc;
}

const medirNaPagina = () => {
  const cards = Array.from(document.querySelectorAll('[data-testid="contact-card"]'));
  const rects = cards.map((el) => el.getBoundingClientRect());
  const vh = window.innerHeight;
  const out = {
    cards: cards.length,
    primeiraLinhaAlturaPx: null,
    primeiraLinhaCards: 0,
    cardsSemRolar: 0,
  };
  if (rects.length > 0) {
    const topo = Math.min(...rects.map((r) => r.top));
    const linha = rects.filter((r) => Math.abs(r.top - topo) < 4);
    out.primeiraLinhaAlturaPx = Math.round(Math.max(...linha.map((r) => r.bottom)) - topo);
    out.primeiraLinhaCards = linha.length;
    out.cardsSemRolar = rects.filter((r) => r.top >= -0.5 && r.bottom <= vh + 0.5).length;
  }
  return out;
};

async function medir(width, tema, browser, baseURL) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width, height: alturaDe(width) },
    colorScheme: tema,
    deviceScaleFactor: 1,
  });
  // try/finally sem re-recuo do corpo: se qualquer etapa falhar, o contexto do
  // Playwright é sempre fechado (antes, uma exceção no meio de medir() vazava
  // o contexto e acumulava browsers na máquina compartilhada).
  try {
  const page = await context.newPage();
  const registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  const requisicoes = [];
  const falhas = [];
  const errosConsole = [];
  const errosPagina = [];
  page.on('request', (r) => requisicoes.push(r.url()));
  page.on('requestfailed', (r) => falhas.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? '?'}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errosConsole.push(msg.text()); });
  page.on('pageerror', (e) => errosPagina.push(String(e && e.message ? e.message : e)));
  // Peso (CJS): `performance.getEntriesByType('resource')` fica VAZIA porque o relógio
  // congelado (`page.clock`) troca o objeto `performance`; então o tamanho de corpo vem
  // do lado do Node, pela própria rede (`request.sizes()`), independente do relógio.
  const tamanhos = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!/(\.tsx?|\.jsx?|\.mjs|\.css)(\?|$)/.test(url)) return;
    tamanhos.push(
      res.request().sizes().then((s) => ({ url, bytes: s.responseBodySize })).catch(() => null),
    );
  });

  if (page.clock?.setFixedTime) await page.clock.setFixedTime(AGORA);
  await bloquearRedeReal(page, registro);
  await mockAppShell(page, registro);
  await mockBackendContatos(page);
  await installFakeSession(page);
  // Depois de installFakeSession, que grava o tema escuro.
  await page.addInitScript((t) => window.localStorage.setItem('theme', t), tema);

  await gotoContacts(page);
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${tema}\\b`));
  await expect(page.getByTestId('kpi-value').first()).toHaveText(String(CONTATOS.length));
  await page.addStyleTag({ content: SEM_TOASTS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const dados = await page.evaluate(medirNaPagina);

  const medidos = (await Promise.all(tamanhos)).filter(Boolean);
  const pesoTotalJsCssBytes = medidos.reduce((s, t) => s + t.bytes, 0);
  const doModulo = medidos.filter((t) => /\/src\/(components|hooks|views)\/contacts\//.test(t.url));

  const arquivo = path.join(OUT_DIR, `contatos-${width}-${tema}.png`);
  await page.screenshot({ path: arquivo, fullPage: false, animations: 'disabled' });
  const tamanhoPng = fs.statSync(arquivo).size;

  const resultado = {
    largura: width,
    altura: alturaDe(width),
    tema,
    ...dados,
    pesoTotalJsCssBytes,
    recursosJsCss: medidos.length,
    pesoModuloBytes: doModulo.reduce((s, t) => s + t.bytes, 0),
    recursosModulo: doModulo.length,
    png: path.basename(arquivo),
    pngBytes: tamanhoPng,
    requisicoes: requisicoes.length,
    requisicoesFalhas: falhas.length,
    falhasExemplos: falhas.slice(0, 5),
    errosConsole: errosConsole.length,
    errosConsoleExemplos: [...new Set(errosConsole)].slice(0, 5),
    errosPagina: errosPagina.length,
    redeBarrada: (registro.redeBarrada ?? []).length,
  };

  return resultado;
  } finally {
    await context.close();
  }
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function relatorioMarkdown(resultados, meta) {
  const linhas = [];
  linhas.push('# Linha de base do módulo Contatos — ANTES do redesign (RD-001)');
  linhas.push('');
  linhas.push('> Fotografia visual e de medida do módulo **Contatos** como ele estava em 12/10/2026,');
  linhas.push('> antes do redesign. Serve para provar, depois, que ficou melhor e mais rápido.');
  linhas.push('');
  linhas.push('Especialista: worker (testes) (area-testes-do-produto)');
  linhas.push('');
  linhas.push(`- Comando: \`npx tsx scripts/qa/contatos-redesign-baseline.cjs\``);
  linhas.push(`- Servidor: ${meta.baseUrl} (${meta.baseUrlSobSubiu ? 'subido pela própria ferramenta' : 'reaproveitado'}), modo dev do Vite`);
  linhas.push(`- Sessão: falsa (\`installFakeSession\`), backend 100% mockado e \`bloquearRedeReal\` ativo — nenhum dado real de cliente e nenhuma chamada ao Supabase de produção.`);
  linhas.push(`- Larguras: ${LARGURAS.join(', ')} px · Temas: escuro e claro · deviceScaleFactor 1`);
  linhas.push(`- Capturas em: \`docs/audits/contatos-redesign-baseline/\``);
  linhas.push('');
  linhas.push('## Como cada número foi medido');
  linhas.push('');
  linhas.push('- **Altura da 1ª linha de cards**: `getBoundingClientRect` dos `[data-testid="contact-card"]`; a 1ª linha são os cards com o mesmo topo (±4 px); altura = maior base − topo.');
  linhas.push('- **Cards sem rolar**: cards inteiramente dentro da altura útil da janela (`top >= 0` e `bottom <= window.innerHeight`).');
  linhas.push('- **Peso do módulo**: soma de `responseBodySize` (lado do Node, `request.sizes()`) das requisições JS/CSS sob `src/(components|hooks|views)/contacts/`. No dev o Vite serve cada módulo como `.ts/.tsx`; no build viram o chunk que contém os módulos de Contatos. (Não dá para usar `performance.getEntriesByType("resource")` aqui: o relógio congelado `page.clock` substitui o objeto `performance` e a lista volta vazia.)');
  linhas.push('- **Requisições / falhas / erros**: contadas por `page.on("request"|"requestfailed"|"console"|"pageerror")` durante a abertura e a medição da tela.');
  linhas.push('');
  linhas.push('## Erros de console observados (esperados nesta linha de base)');
  linhas.push('');
  const mensagens = [...new Set(resultados.flatMap((r) => r.errosConsoleExemplos))];
  for (const m of mensagens) {
    const primeiraLinha = String(m).split('\n')[0].slice(0, 160);
    linhas.push(`- \`${primeiraLinha}\``);
  }
  linhas.push('');
  linhas.push('Motivo dos esperados: os mocks DEVOLVEM 403 para escritas (`agent-presence` upsert) e 401 para `\/auth\/v1\/user` (JWT falso não assinado) — é o comportamento desenhado das fixtures. Os avisos de HTML inválido (`<li>` dentro de `<li>`, do breadcrumb do `PageHeader`) são PRÉ-EXISTENTES do módulo e ficam registrados aqui como parte do "antes".');
  linhas.push('');
  linhas.push('## Números de ANTES');
  linhas.push('');
  linhas.push('| largura | tema | altura 1ª linha (px) | cards sem rolar | peso módulo | req. | falhas | erros console | PNG |');
  linhas.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of resultados) {
    linhas.push(
      `| ${r.largura} px | ${r.tema === 'dark' ? 'escuro' : 'claro'} | ${r.primeiraLinhaAlturaPx ?? '—'} | ` +
      `${r.cardsSemRolar}/${r.cards} | ${kb(r.pesoModuloBytes)} (${r.recursosModulo} arquivos) | ${r.requisicoes} | ` +
      `${r.requisicoesFalhas} | ${r.errosConsole} | ${r.png} (${kb(r.pngBytes)}) |`,
    );
  }
  linhas.push('');
  linhas.push('Detalhe por largura/tema (JSON bruto dos campos acima):');
  linhas.push('');
  linhas.push('```json');
  linhas.push(JSON.stringify(resultados, null, 2));
  linhas.push('```');
  linhas.push('');
  const grandes = resultados.filter((r) => r.pngBytes > LIMITE_PNG);
  linhas.push('## Notas de honestidade');
  linhas.push('');
  linhas.push('- Os PNGs têm no máximo 300 KB cada.' + (grandes.length ? ` FORA DA REGRA: ${grandes.map((r) => `${r.png} = ${kb(r.pngBytes)}`).join(', ')}.` : ''));
  linhas.push(`- Cada combinação largura/tema é medida até 3 vezes se a rodada vier instável (requisição falha ou exceção de página), porque a máquina é compartilhada e o dev serve ~800 módulos; a rodada publicada é sempre a LIMPA. Instáveis após 3 tentativas: ${resultados.filter((r) => r.requisicoesFalhas > 0 || r.errosPagina > 0).length}.`);
  linhas.push('- O banco local do produto tem POUCOS contatos. Para a linha de base ser reproduzível e comparável entre rodadas, a tela roda com um conjunto sintético fixo de 8 contatos (o mesmo de `e2e/contacts-snapshots.spec.ts`), não com o banco da tarefa. Isso muda a quantidade de cards — não a geometria de 1 card, que é o alvo do redesign.');
  linhas.push(`- Guarda de rede: ${resultados.every((r) => r.redeBarrada === 0) ? 'nenhuma requisição escapou para o Supabase/Mapbox reais (redeBarrada = 0 em todas as rodadas).' : 'ATENÇÃO: houve requisição barrada — ver JSON.'}`);
  linhas.push('- O "peso do módulo" em modo dev não é o tamanho do chunk final; é a soma dos módulos do diretório de Contatos servidos pelo Vite. Para comparar depois, use o MESMO comando.');
  linhas.push('');
  return linhas.join('\n');
}

async function principal() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let proc = null;
  let subiu = false;
  if (BASE_URL) {
    if (!(await servidorResponde(BASE_URL))) {
      throw new Error(`BASELINE_BASE_URL=${BASE_URL} não responde.`);
    }
    console.log(`[rd-001] reaproveitando servidor em ${BASE_URL}`);
  } else {
    if (process.env.BASELINE_NAO_SUBE === '1') {
      throw new Error('BASELINE_NAO_SUBE=1 exige BASELINE_BASE_URL apontando para um servidor no ar.');
    }
    PORTA = await portaLivre(PORTA_BASE);
    BASE_URL = `http://127.0.0.1:${PORTA}`;
    proc = subirVite(PORTA);
    subiu = true;
    const ok = await esperarServidor(BASE_URL, 90_000);
    if (!ok) {
      proc.kill('SIGTERM');
      throw new Error(`servidor do Vite não respondeu em ${BASE_URL} em 90s.`);
    }
    console.log(`[rd-001] servidor do Vite subido em ${BASE_URL}`);
  }

  const browser = await chromium.launch();
  const resultados = [];
  const so = (process.env.BASELINE_SO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const quer = (largura, tema) => so.length === 0 || so.includes(`${largura}x${tema}`);
  try {
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        if (!quer(largura, tema)) continue;
        // A máquina é compartilhada e o Vite serve ~800 módulos em dev: uma rajada de
        // `ERR_NETWORK_CHANGED` pode deixar a tela incompleta (o boot não acha o
        // cabeçalho) ou falhar requisição. Uma rodada só conta como boa se não houve
        // requisição falha nem exceção de página; senão, refaz (até 3x).
        let r = null;
        let ultimoErro = null;
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
          try {
            r = await medir(largura, tema, browser, BASE_URL);
            if (r.requisicoesFalhas === 0 && r.errosPagina === 0) { ultimoErro = null; break; }
            ultimoErro = `${r.requisicoesFalhas} falhas, ${r.errosPagina} erros de página`;
          } catch (erro) {
            r = null;
            ultimoErro = String(erro && erro.message ? erro.message : erro).split('\n')[0];
          }
          console.warn(`[rd-001] ${largura}px ${tema}: rodada ${tentativa} instável (${ultimoErro}) — refazendo`);
        }
        if (!r) throw new Error(`${largura}px ${tema}: 3 tentativas sem rodada limpa (${ultimoErro})`);
        resultados.push(r);
        console.log(
          `[rd-001] ${largura}px ${tema}: 1a linha ${r.primeiraLinhaAlturaPx ?? '—'}px, ` +
          `${r.cardsSemRolar}/${r.cards} cards visíveis, módulo ${kb(r.pesoModuloBytes)}, ` +
          `${r.requisicoes} req, ${r.requisicoesFalhas} falhas, ${r.errosConsole} erros console, ` +
          `png ${kb(r.pngBytes)}`,
        );
        if (process.env.BASELINE_DEBUG) {
          console.log(`[rd-001][debug] recursos js/css medidos: ${r.recursosJsCss} (módulo: ${r.recursosModulo})`);
        }
      }
    }
  } finally {
    await browser.close();
    if (proc) proc.kill('SIGTERM');
  }

  if (so.length > 0) {
    console.log(`[rd-001] BASELINE_SO ativo (${so.join(', ')}): relatório NÃO foi reescrito.`);
    return;
  }
  fs.writeFileSync(RELATORIO, relatorioMarkdown(resultados, { baseUrl: BASE_URL, baseUrlSobSubiu: subiu }), 'utf8');

  const barradas = resultados.reduce((s, r) => s + r.redeBarrada, 0);
  const pesadas = resultados.filter((r) => r.pngBytes > LIMITE_PNG);
  const instaveis = resultados.filter((r) => r.requisicoesFalhas > 0 || r.errosPagina > 0);
  console.log(`[rd-001] relatório escrito em ${path.relative(ROOT, RELATORIO)}`);
  if (barradas > 0) {
    console.error(`[rd-001] FALHA: ${barradas} requisição(ões) caíram na guarda de rede real.`);
    process.exitCode = 1;
  }
  if (pesadas.length > 0) {
    console.error(`[rd-001] FALHA: PNG acima de 300 KB: ${pesadas.map((r) => r.png).join(', ')}`);
    process.exitCode = 1;
  }
  if (instaveis.length > 0) {
    console.error(
      `[rd-001] FALHA: rodada(s) instável(is) após 3 tentativas: ` +
      instaveis.map((r) => `${r.largura}/${r.tema}`).join(', '),
    );
    process.exitCode = 1;
  }
}

principal().catch((erro) => {
  console.error(`[rd-001] erro: ${erro && erro.stack ? erro.stack : erro}`);
  process.exitCode = 1;
});
