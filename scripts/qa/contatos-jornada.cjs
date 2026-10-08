#!/usr/bin/env node
/**
 * CT-001 — MEDIÇÃO INICIAL DO CAMINHO ATÉ A CONVERSA (módulo Contatos)
 *
 * Plano: docs/plans/PLANO_CONTATOS_POR_JORNADA_2026-10-08.md
 *   Jornada 1 · Achar, bloco 1, item CT-001: "Antes de mudar qualquer coisa,
 *   medimos quantos cliques e segundos o vendedor gasta hoje para ir da abertura
 *   do módulo até a conversa com um cliente." A meta do módulo é 3 cliques e
 *   5 segundos (decisão Q1 do plano).
 *
 * O QUE ESTE ROTEIRO MEDE (em 390, 768 e 1672 px, no PREVIEW do build):
 *   1. cliques do usuário de "abrir Contatos" até "conversa aberta";
 *   2. segundos do mesmo caminho (e o tempo de cada etapa);
 *   3. requisições feitas no caminho (total e por caminho/rota);
 *   4. peso do chunk do módulo (bytes decodificados/transferidos no caminho,
 *      com conferência no manifesto do build: `dist/.vite/manifest.json`);
 *   5. erros de console e exceções da página;
 *   6. achados de acessibilidade da tela do módulo (o mesmo conjunto de regras
 *      que o revisor cobra: fonte < 11 px, imagem sem alt, controle sem nome
 *      acessível, campo sem rótulo, alvo de toque pequeno, contraste WCAG AA e
 *      id duplicado).
 *
 * COMO O CAMINHO É DEFINIDO (e por que é honesto):
 *   - "abrir Contatos" = o clique no item "Contatos" do menu principal
 *     (`#main-navigation`), partindo do módulo Início já carregado;
 *   - "achando um contato por busca" = digitar o termo no campo
 *     "Buscar por nome, telefone, email ou empresa…" e esperar o card do
 *     contato-alvo aparecer;
 *   - "conversa aberta" = o painel da conversa montado (`ChatPanel`, classe
 *     `bg-inbox-panel`) depois de clicar "Conversar" no card. O roteiro também
 *     registra QUAL sinal fechou a medição (ver campo `sinal` no relatório),
 *     para não dar por aberta uma conversa que não abriu.
 *
 * REGRA DURA (Arquitetura V2 / R1): nada sai para a produção. O roteiro roda o
 * app com SESSÃO FALSA (`installFakeSession` do e2e) e backend 100% mockado —
 * mesmo padrão dos projetos `chromium-contacts-visual`/`chromium-a11y` do
 * `playwright.config.ts`, que rodam em PR sem secrets. Um guarda de rede
 * (`bloquearRedeReal`) registra e barra qualquer chamada ao Supabase real; o
 * roteiro FALHA se o registro ficar não vazio. WebSocket também é bloqueado.
 *
 * LIMITES DECLARADOS (o que esta medição NÃO prova):
 *   - o banco local tem poucos contatos; a lista usada aqui é uma fixture
 *     controlada (`--contatos`, padrão 40) — é o mesmo caminho de CLIENTE, mas a
 *     latência de banco real não entra nos segundos;
 *   - as fontes do Google são barradas (medição hermética): as métricas usam a
 *     fonte de fallback e os erros de console apontados como "externo" são o
 *     efeito disso, não defeito do produto;
 *   - `navigator.webdriver` está ligado (Chromium do Playwright): os segundos
 *     são um TETO otimista de máquina ociosa, não a percepção do vendedor.
 *
 * USO (1 comando; sobe o preview do `dist` sozinho quando não há servidor):
 *   node scripts/qa/contatos-jornada.cjs --md docs/audits/CONTATOS_BASELINE_2026-10-08.md
 *
 * Opções:
 *   --base-url <url>   usa um preview já de pé (padrão http://127.0.0.1:4173)
 *   --larguras a,b,c   larguras medidas (padrão 390,768,1672)
 *   --contatos <n>     tamanho da fixture de contatos (padrão 40)
 *   --repeticoes <n>   rodadas por largura (padrão 1; a referência é a MEDIANA)
 *   --busca-sempre-vazia  AUTO-TESTE: a busca devolve nada e o roteiro tem de falhar
 *   --build            força `vite build --manifest` antes de servir
 *   --sem-servir       nunca sobe servidor; exige --base-url respondendo
 *   --md <arquivo>     grava o relatório markdown no caminho dado
 *   --json <arquivo>   grava os números crus em JSON
 *   --diagnostico      imprime o estado do DOM quando a conversa não abre
 *   --limite <s>       teto de espera por etapa (padrão 20)
 *
 * Saída: relatório em pt-BR no stdout. EXIT 0 = caminho completado nas larguras
 * pedidas E nenhuma requisição escapou para a rede real; EXIT 1 = alguma etapa
 * não fechou, algum erro de página ou escape de rede; EXIT 2 = ambiente
 * (build/servidor/Playwright) não pôde ser preparado.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const URL_PADRAO = 'http://127.0.0.1:4173';
const LARGURAS_PADRAO = [390, 768, 1672];
const ALTURAS = { 390: 844, 768: 1024, 1672: 941 };
const LIMITE_PADRAO_S = 20;
const CONTATOS_PADRAO = 40;

/**
 * Ref do projeto Supabase — descoberto em tempo de execução a partir do próprio
 * bundle servido (`dist/assets/*.js`), nunca guardado no código: o roteiro não
 * carrega host/token de produção, e a guarda de rede abaixo é por ALLOWLIST
 * (só a origem local passa), então nem precisa saber o host de fora.
 */
let REF = null; // preenchido por descobrirRefSupabase()
const HOST_REAL = () => `${REF}.supabase.co`;
const USUARIO_FAKE_ID = '00000000-0000-4000-8000-000000000001';
const CHAVE_SESSAO = () => `sb-${REF}-auth-token`;
const EXP_FAKE = 4102444800; // 2100-01-01 — nunca expira no teste

/** URLs que ficam na máquina (o resto é barrado pela guarda de rede em allowlist). */
const RE_URL_LOCAL = /^(http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/;

/**
 * Contato-alvo da jornada: o ÚLTIMO da lista — de propósito. O vendedor tem de
 * achar pelo nome (não está na primeira tela), que é o caso que o plano quer
 * medir ("achando um contato por busca"). O termo é o nome completo dele; a
 * fixture garante que esse nome casa com um contato só (conferido antes de rodar).
 */
function escolherAlvo(contatos) {
  const alvo = contatos[contatos.length - 1];
  return { alvo, termo: alvo.name };
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function lerArgs(argv) {
  const args = { larguras: LARGURAS_PADRAO, contatos: CONTATOS_PADRAO, limite: LIMITE_PADRAO_S };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => argv[++i];
    if (a === '--base-url') args.baseUrl = valor();
    else if (a === '--larguras') args.larguras = valor().split(',').map((n) => Number.parseInt(n.trim(), 10));
    else if (a === '--contatos') args.contatos = Number.parseInt(valor(), 10);
    else if (a === '--limite') args.limite = Number.parseFloat(valor());
    else if (a === '--repeticoes') args.repeticoes = Number.parseInt(valor(), 10);
    else if (a === '--busca-sempre-vazia') args.buscaSempreVazia = true;
    else if (a === '--md') args.md = valor();
    else if (a === '--json') args.json = valor();
    else if (a === '--build') args.build = true;
    else if (a === '--sem-servir') args.semServir = true;
    else if (a === '--diagnostico') args.diagnostico = true;
    else if (a === '--ajuda' || a === '-h') args.ajuda = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Fixture de contatos (mesmo shape de e2e/contacts-snapshots.spec.ts)
// ---------------------------------------------------------------------------
const EMPRESAS = [
  'Brindes Paulista', 'Grupo Horizonte', 'Têxtil Aurora', 'Rápido Sul Logística',
  'Rocha Serigrafia', 'Agência Nunes', 'Metalúrgica Ipiranga', 'Papelaria Central',
  'Casa das Canecas', 'Sublimação Total',
];
const NOMES = [
  'Ana Beatriz Souza', 'Bruno Carvalho', 'Carla Mendes', 'Diego Fernandes',
  'Eduarda Lima', 'Felipe Rocha', 'Gabriela Nunes', 'Henrique Alves',
  'Isabela Prado', 'João Vitor Ramos', 'Karen Oliveira', 'Lucas Moreira',
];
const TIPOS = ['cliente', 'fornecedor', 'transportadora', 'colaborador', 'prestador_servico', 'parceiro'];
const AGORA_FIXO = new Date('2026-09-15T12:00:00.000Z');
const DIA = 86_400_000;

function criarContatos(quantidade) {
  const lista = [];
  for (let n = 1; n <= quantidade; n++) {
    const empresa = EMPRESAS[n % EMPRESAS.length];
    const base = NOMES[(n - 1) % NOMES.length];
    const sufixo = n > NOMES.length ? ` ${Math.floor((n - 1) / NOMES.length) + 1}` : '';
    const criado = new Date(AGORA_FIXO.getTime() - (n * 3) * DIA).toISOString();
    lista.push({
      id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
      name: `${base}${sufixo}`,
      nickname: null,
      surname: null,
      job_title: n % 3 === 0 ? 'Compradora' : n % 3 === 1 ? 'Gerente de marketing' : null,
      company: empresa,
      phone: `55119${String(80000000 + n * 1111).padStart(8, '0')}`,
      email: n % 4 === 0 ? null : `contato${n}@${empresa.toLowerCase().replace(/[^a-z]+/g, '')}.com.br`,
      contact_type: TIPOS[n % TIPOS.length],
      created_at: criado,
      updated_at: criado,
      deleted_at: null,
      is_lid_legacy: false,
      tags: n % 5 === 0 ? ['vip'] : [],
      avatar_url: null,
      address: null, address_number: null, neighborhood: null, city: null, state: null, postal_code: null,
      latitude: null, longitude: null, assigned_to: null, queue_id: null,
    });
  }
  return lista;
}

/** Mesmo critério aproximado da RPC `search_contacts` (nome/empresa/e-mail/telefone). */
function filtrarContatos(lista, termo) {
  if (!termo) return lista;
  const t = String(termo).trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((c) =>
    [c.name, c.company, c.email, c.nickname, c.phone]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(t)),
  );
}
function criarMensagemDaConversaAlvo(alvo) {
  return {
    id: `00000000-0000-4000-a000-${alvo.id.slice(-12)}`,
    contact_id: alvo.id,
    sender: 'contact',
    content: `Mensagem de baseline CT-001 para ${alvo.name}`,
    message_type: 'text',
    type: 'text',
    media_url: null,
    external_id: `ct-001-${alvo.id.slice(-12)}`,
    is_read: false,
    status: 'delivered',
    status_updated_at: AGORA_FIXO.toISOString(),
    created_at: new Date(AGORA_FIXO.getTime() + DIA).toISOString(),
    updated_at: new Date(AGORA_FIXO.getTime() + DIA).toISOString(),
    metadata: null,
    is_deleted: false,
    deleted_at: null,
    reply_to_message_id: null,
    transcription: null,
    transcription_status: null,
    link_preview: null,
  };
}

// ---------------------------------------------------------------------------
// Mocks (porte de e2e/fixtures/talkx-demo.ts + e2e/fixtures/mapa-mocks.ts +
// e2e/contacts-snapshots.spec.ts — nenhum arquivo novo do produto)
// ---------------------------------------------------------------------------
// -- registro do que os mocks atenderam (para a integridade da medição) --------
// O helper `json` é usado por todos os mocks; ele anota a URL atendida no registro
// da rodada corrente, para se poder provar que NENHUMA requisição não-local ficou
// sem resposta (nem mock, nem guarda de rede).
let REG_MOCADO = null;

const json = (route, body, status = 200) => {
  REG_MOCADO?.push(route.request().url());
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

const querObjetoUnico = (route) =>
  String(route.request().headers().accept ?? '').includes('pgrst.object');

function b64url(valor) {
  return Buffer.from(JSON.stringify(valor), 'utf8').toString('base64url');
}

function jwtFalso(payload) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.ZmFrZS1zaWduYXR1cmU`;
}

const SESSAO_FALSA = {
  access_token: jwtFalso({
    sub: USUARIO_FAKE_ID,
    email: 'medicao@test.local',
    role: 'authenticated',
    aud: 'authenticated',
    exp: EXP_FAKE,
    iat: 0,
    iss: `https://${HOST_REAL()}/auth/v1`,
  }),
  refresh_token: 'fake-refresh-token',
  expires_at: EXP_FAKE,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: USUARIO_FAKE_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'medicao@test.local',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_anonymous: false,
  },
};

const PERFIL_FALSO = {
  id: USUARIO_FAKE_ID,
  user_id: USUARIO_FAKE_ID,
  name: 'Medição CT-001',
  email: 'medicao@test.local',
  role: 'admin',
};

/** Sessão falsa + contador de cliques reais do usuário (captura antes do app). */
async function prepararPagina(page) {
  await page.addInitScript(
    ({ chave, sessao, cliques }) => {
      localStorage.setItem(chave, JSON.stringify(sessao));
      localStorage.setItem('theme', 'light');
      localStorage.setItem(`onboarding_completed_${sessao.user.id}`, 'true');
      window.__qaCliques = 0;
      window.addEventListener('click', () => { window.__qaCliques++; }, true);
      // O app carrega centenas de recursos: sem aumentar o buffer, o Resource
      // Timing descarta as entradas finais (era o caso do chunk do módulo, que
      // chega por último) e a medição lê "0 KB" como se nada tivesse baixado.
      if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(5000);
    },
    { chave: CHAVE_SESSAO(), sessao: SESSAO_FALSA, cliques: 0 },
  );
}

async function registrarRotas(page, registro, contatos, opcoes = {}) {
  REG_MOCADO = registro.mocado; // anota o que os mocks atenderem (integridade)
  // Guarda de rede por ALLOWLIST, registrada PRIMEIRO (o Playwright casa na ordem
  // inversa de registro: só cai aqui o que nenhum mock abaixo atendeu). Passa só a
  // origem local — backend real, Mapbox e fontes ficam barrados. Como é allowlist,
  // o roteiro não nomeia host de fora no código: host novo no bundle já nasce barrado.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (RE_URL_LOCAL.test(url)) return route.continue();
    const doBackend = Boolean(REF) && url.includes(REF);
    (doBackend ? registro.redeBarrada : registro.externoBarrado).push(url);
    return doBackend
      ? json(route, { message: 'rede real bloqueada na medição' }, 403)
      : route.abort();
  });

  // --- app shell (porte de mockAppShell) -----------------------------------
  await page.route(/\/rest\/v1\/profiles/, (route) =>
    json(route, querObjetoUnico(route) ? PERFIL_FALSO : [PERFIL_FALSO]));
  await page.route(/\/rest\/v1\/user_roles/, (route) =>
    json(route, querObjetoUnico(route) ? { role: 'admin' } : [{ role: 'admin' }]));
  await page.route(/\/rest\/v1\/user_settings/, (route) =>
    json(route, querObjetoUnico(route) ? null : []));
  await page.route(/\/rest\/v1\/rpc\/user_has_permission/, (route) => json(route, true));
  await page.route(/\/rest\/v1\/rpc\/count_searchbox_sessions_this_month/, (route) => json(route, 0));
  await page.route(/\/rest\/v1\/rpc\/(?!user_has_permission|count_searchbox_sessions_this_month)/, (route) => json(route, null));
  await page.route(/\/functions\/v1\/get-mapbox-token/, (route) => json(route, { token: 'pk.medicao' }));
  await page.route(/\/functions\/v1\/(?!get-mapbox-token)/, (route) => json(route, {}));
  // GoTrue: o JWT da sessão falsa não é assinado; 401 é o que o app tolera.
  await page.route(/\/auth\/v1\/user/, (route) => json(route, { code: 401, msg: 'invalid JWT' }, 401));

  // --- módulo Contatos ------------------------------------------------------
  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') return json(route, { message: 'blocked' }, 403);
    const url = route.request().url();
    const porId = /id=eq\.([0-9a-f-]+)/i.exec(url);
    if (porId) {
      const achado = contatos.find((c) => c.id === porId[1]);
      return achado ? json(route, querObjetoUnico(route) ? achado : [achado]) : json(route, []);
    }
    return json(route, querObjetoUnico(route) ? contatos[0] : contatos);
  });
  // A busca real é a RPC `search_contacts` (src/services/contact.service.ts);
  // aqui ela é respondida de verdade, filtrando pelo `search_term` pedido.
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) => {
    // `--busca-sempre-vazia` é o AUTO-TESTE do roteiro: com ele a busca devolve
    // nada, o caminho não fecha e o roteiro TEM de ficar vermelho. Sem esta
    // prova, um "verde" do roteiro não significaria nada.
    if (opcoes.buscaSempreVazia) return json(route, []);
    let termo = '';
    try {
      const corpo = route.request().postDataJSON();
      termo = corpo?.search_term ?? '';
    } catch {
      /* corpo não-JSON: sem termo, devolve a lista inteira */
    }
    const filtrados = filtrarContatos(contatos, termo);
    return json(route, filtrados.map((c) => ({ ...c, total_count: filtrados.length })));
  });
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) => {
    const contagem = Object.entries(
      contatos.reduce((acc, c) => ({ ...acc, [c.contact_type]: (acc[c.contact_type] ?? 0) + 1 }), {}),
    ).map(([contact_type, count]) => ({ contact_type, count }));
    return json(route, contagem);
  });
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) =>
    json(route, contatos.slice(0, 6).map((c, i) => ({
      contact_id: c.id,
      last_message_at: new Date(AGORA_FIXO.getTime() - (i + 1) * 3_600_000).toISOString(),
    }))));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, contatos.map((c) => ({ contact_id: c.id, can_delete: true }))));
  const alvoDaConversa = opcoes.alvo ?? escolherAlvo(contatos).alvo;
  const mensagens = [criarMensagemDaConversaAlvo(alvoDaConversa)];
  await page.route(/\/rest\/v1\/messages/, (route) => {
    const metodo = route.request().method();
    if (metodo === 'PATCH') {
      // `openContactChat` seleciona a conversa e a Inbox marca mensagens como lidas.
      // Esta escrita faz parte do caminho de abrir conversa; responder 200 evita que
      // um falso 403 do mock vire erro de app sem relação com a medição.
      return json(route, []);
    }
    if (metodo !== 'GET') return json(route, { message: 'blocked' }, 403);
    const url = route.request().url();
    const porContato = /contact_id=eq\.([^&]+)/i.exec(url);
    const lista = porContato
      ? mensagens.filter((m) => m.contact_id === decodeURIComponent(porContato[1]))
      : mensagens;
    return json(route, lista);
  });

  // Catch-all das demais leituras do shell (mesma lista de exceções do e2e).
  await page.route(/\/rest\/v1\/(?!profiles|user_roles|user_settings|contacts|messages|rpc)[a-z_]+/, (route) => {
    if (route.request().method() === 'GET') return json(route, querObjetoUnico(route) ? null : []);
    return json(route, { message: 'blocked' }, 403);
  });

  // WebSocket: nenhuma conexão de tempo real sai da máquina.
  if (typeof page.routeWebSocket === 'function') {
    try {
      await page.routeWebSocket('**', (ws) => {
        registro.webSocketBloqueado.push(ws.url());
        ws.close();
      });
    } catch {
      /* versão do Playwright sem routeWebSocket: fica só o guarda de HTTP */
    }
  }
}

// ---------------------------------------------------------------------------
// Jornada
// ---------------------------------------------------------------------------
/**
 * "Abrir Contatos" como o vendedor faz: no desktop é o item do menu lateral
 * (`#main-navigation`); no celular (`< 768 px`, `MOBILE_BREAKPOINT`) não existe
 * menu lateral — é o botão "Abrir menu" do cabeçalho e o item no painel que ele
 * abre. O clique a mais do celular entra na conta (é o que o vendedor gasta).
 */
async function abrirModuloContatos(page, limite) {
  const menuLateral = page.locator('#main-navigation');
  if (await menuLateral.count() > 0 && await menuLateral.first().isVisible().catch(() => false)) {
    // `data-tour` vem de `SidebarNavItem` (o rótulo só existe com a barra aberta).
    await menuLateral.locator('[data-tour="contacts"]').first().click({ timeout: limite });
    return 'menu lateral (desktop)';
  }
  await page.getByRole('button', { name: 'Abrir menu' }).click({ timeout: limite });
  const painel = page.getByRole('dialog', { name: 'Menu de navegação' });
  await painel.waitFor({ state: 'visible', timeout: limite });
  await painel.getByText('Contatos', { exact: true }).first().click({ timeout: limite });
  return 'cabeçalho → painel do menu (celular)';
}

async function jornada(page, registro, contatos, cfg) {
  const alvo = cfg.alvo;
  const termo = cfg.termo;
  const limite = cfg.limite * 1000;
  const ir = (caminho) => page.goto(`${cfg.baseUrl}${caminho}`, { waitUntil: 'domcontentloaded' });
  const med = { largura: cfg.largura, sinal: null, erro: null, etapas: {}, requisicoes: [], recursos: [] };

  // Entra no sistema pelo módulo Início (o vendedor já está dentro quando
  // resolve procurar um cliente; não é `goto('?view=contacts')`).
  await ir('/?view=dashboard');
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: limite });
  await page.waitForTimeout(400); // assenta o primeiro render antes de medir

  // Janela da medição: tudo daqui até "conversa aberta".
  await page.evaluate(() => { window.__qaCliques = 0; });
  const recursosAntes = new Set(await page.evaluate(() =>
    performance.getEntriesByType('resource').map((e) => e.name)));
  const t0Pagina = await page.evaluate(() => performance.now());
  const t0 = Date.now();
  med.etapas.t0Pagina = t0Pagina;

  // 1) abrir Contatos
  med.comoAbriu = await abrirModuloContatos(page, limite);
  const busca = page.getByPlaceholder(/Buscar por nome/);
  await busca.waitFor({ state: 'visible', timeout: limite });
  med.etapas.moduloAberto = Date.now() - t0;

  // 2) achar o contato pela busca
  await page.getByTestId('contact-card').first().waitFor({ state: 'visible', timeout: limite });
  med.cardsAntesDaBusca = await page.getByTestId('contact-card').count();
  await busca.fill(termo);
  // A busca é debounced no cliente (`useContactsViewState`): contar a lista no
  // mesmo instante do `fill` mediria a lista ANTES do filtro. Espera assentar
  // (a lista cai para o que casa com o termo), com teto, para o número ser real.
  const tetoAssentar = Math.min(limite, 6000);
  const assentou = await page
    .waitForFunction(() => document.querySelectorAll('[data-testid="contact-card"]').length <= 2, null, { timeout: tetoAssentar, polling: 100 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(200); // fecha o debounce do termo seguinte, se houver
  med.cardsAposBusca = await page.getByTestId('contact-card').count();
  med.buscaFiltrou = med.cardsAposBusca < med.cardsAntesDaBusca;
  med.buscaAssentou = assentou;
  const cardAlvo = page.getByTestId('contact-card').filter({ hasText: alvo.name }).first();
  await cardAlvo.waitFor({ state: 'visible', timeout: limite });
  med.etapas.contatoEncontrado = Date.now() - t0;

  // 3) abrir a conversa
  const botao = cardAlvo.getByTitle('Conversar').first();
  await botao.click({ timeout: limite });
  med.etapas.cliqueConversar = Date.now() - t0;

  // Sinal de "conversa aberta": dois candidatos, o primeiro que aparecer vence.
  // (a) linha selecionada na lista de conversas (conversa de fato aberta);
  // (b) o painel do chat montado. O motivo de aceitar os dois: em algumas
  // renderizações o painel do chat fica dentro de um contêiner que o Playwright
  // não considera "visível", e a medição travaria 20 s por isso (medido na
  // primeira versão deste roteiro).
  const candidatos = [
    { nome: 'linha de conversa selecionada (.conversation-row-selected)', loc: page.locator('.conversation-row-selected') },
    { nome: 'ChatPanel (.bg-inbox-panel) visível', loc: page.locator('.bg-inbox-panel') },
  ];
  med.sinal = await Promise.race(
    candidatos.map(async (c) => {
      await c.loc.first().waitFor({ state: 'visible', timeout: limite });
      return c.nome;
    }),
  ).catch(async () => {
    const noInbox = await page.evaluate(() => location.search.includes('view=inbox')).catch(() => false);
    return noInbox ? 'APENAS a URL em view=inbox (conversa não montou)' : null;
  });
  // Prova de que a conversa aberta é a do contato que o vendedor buscou: a linha
  // SELECIONADA da lista de conversas (`conversation-row-selected`, de
  // VirtualizedRealtimeList) tem de ser a do alvo. Só "abriu o painel" não basta.
  const alvoNaTela = await page
    .waitForFunction((nomeCompleto) => {
      const normalizar = (valor) => String(valor || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const alvoNormalizado = normalizar(nomeCompleto);
      const contemAlvo = (seletor) => {
        const no = document.querySelector(seletor);
        const texto = normalizar(no?.innerText);
        return Boolean(texto && texto.includes(alvoNormalizado));
      };
      const linhaSelecionada = contemAlvo('.conversation-row-selected');
      const painel = contemAlvo('.bg-inbox-panel');
      const conteudoPrincipal = contemAlvo('#main-content');
      return linhaSelecionada || painel || conteudoPrincipal
        ? { linhaSelecionada, painel, conteudoPrincipal, ok: true }
        : false;
    }, alvo.name, { timeout: Math.min(limite, 6000), polling: 100 })
    .then((handle) => handle.jsonValue())
    .catch(() => ({ linhaSelecionada: false, painel: false, conteudoPrincipal: false, ok: false }));
  med.conversaDoAlvo = alvoNaTela.ok;
  med.alvoEncontradoEm = alvoNaTela.linhaSelecionada
    ? 'linha selecionada'
    : alvoNaTela.painel
      ? 'painel da conversa'
      : alvoNaTela.conteudoPrincipal
        ? 'conteúdo principal'
        : null;
  const tFim = Date.now();
  med.etapas.total = tFim - t0;
  med.inicioAbs = t0;
  med.fimAbs = tFim;

  med.cliques = await page.evaluate(() => window.__qaCliques);
  med.recursos = await page.evaluate((t0) =>
    performance.getEntriesByType('resource')
      .filter((e) => e.startTime >= t0 - 5)
      .map((e) => ({
        url: e.name,
        tipo: e.initiatorType,
        decodificado: e.decodedBodySize || 0,
        transferido: e.transferSize || 0,
        inicio: Math.round(e.startTime),
        duracao: Math.round(e.duration),
      })), t0Pagina);
  // O chunk do módulo pode ter sido pré-carregado antes do caminho começar;
  // registrar isso evita ler "0 KB" como se o módulo fosse de graça.
  med.chunkModuloRuntime = (() => {
    const arquivo = cfg.arquivoModulo;
    if (!arquivo) return null;
    const noCaminho = med.recursos.filter((r) => r.url.includes(arquivo));
    const antes = [...recursosAntes].filter((u) => u.includes(arquivo));
    return {
      arquivo,
      jaCarregadoAntesDeAbrir: antes.length > 0,
      carregadoNoCaminho: noCaminho.length > 0,
      bytesDecodificado: noCaminho.reduce((a, r) => a + r.decodificado, 0),
      bytesTransferido: noCaminho.reduce((a, r) => a + r.transferido, 0),
    };
  })();

  if (cfg.diagnostico) {
    med.diagnostico = await page.evaluate(() => ({
      url: location.href,
      temInputBusca: Boolean(document.querySelector('input[placeholder*="Buscar por nome"]')),
      temCard: document.querySelectorAll('[data-testid="contact-card"]').length,
      textoDoPainel: (document.querySelector('.bg-inbox-panel')?.innerText ?? '').replace(/\n+/g, ' | ').slice(0, 300),
      textoVisivel: (document.querySelector('#main-content')?.innerText ?? '').replace(/\n+/g, ' | ').slice(0, 700),
    }));
  }
  return { med, alvo };
}

/** Requisições observadas pela rede do Playwright durante a janela da jornada. */
function contarRequisicoes(registro, desde, ate) {
  const lista = registro.requisicoes.filter((r) => r.ms >= desde && r.ms <= ate);
  const porCaminho = new Map();
  for (const r of lista) {
    const u = r.url.replace(`https://${HOST_REAL()}`, '');
    const chave = `${r.metodo} ${u.split('?')[0]}`;
    porCaminho.set(chave, (porCaminho.get(chave) ?? 0) + 1);
  }
  return {
    total: lista.length,
    porCaminho: [...porCaminho.entries()].map(([caminho, n]) => ({ caminho, n })).sort((a, b) => b.n - a.n),
  };
}

// ---------------------------------------------------------------------------
// Acessibilidade da tela do módulo (regras que o revisor cobra aqui)
// ---------------------------------------------------------------------------
const VARREDURA_A11Y = function varrer() {
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const rotulo = (el) =>
    (el.getAttribute('aria-label') || '').trim() ||
    (el.getAttribute('title') || '').trim() ||
    (el.textContent || '').replace(/\s+/g, ' ').trim() ||
    (el.getAttribute('alt') || '').trim();
  const rgb = (cor) => {
    const m = /rgba?\(([^)]+)\)/.exec(cor || '');
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const luminancia = ({ r, g, b }) => {
    const c = [r, g, b].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const fundoEfetivo = (el) => {
    let no = el;
    while (no && no !== document.documentElement) {
      const c = rgb(getComputedStyle(no).backgroundColor);
      if (c && c.a > 0.5) return c;
      no = no.parentElement;
    }
    const c = rgb(getComputedStyle(document.body).backgroundColor);
    return c && c.a > 0.5 ? c : { r: 255, g: 255, b: 255, a: 1 };
  };

  const achados = {};
  const anota = (tipo, exemplo) => {
    (achados[tipo] ??= []).push(exemplo);
  };

  // Escopo: a área do módulo (`#main-content`). O casco (barra lateral, cabeçalho,
  // painéis de notificação) não é o objeto desta auditoria — misturá-lo produzia
  // achados de outras telas (ex.: switches do painel de notificações).
  const raiz = document.querySelector('#main-content') ?? document.body;
  const todos = [...raiz.querySelectorAll('*')];
  for (const el of todos) {
    if (!visivel(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    // fonte abaixo de 11 px (regra do módulo: fonte mínima 11 px)
    const px = Number.parseFloat(s.fontSize);
    if (px && px < 11 && (el.textContent || '').trim()) {
      anota('fonteAbaixo11', `${el.tagName.toLowerCase()} ${px}px "${(el.textContent || '').trim().slice(0, 40)}"`);
    }

    // imagem sem alt
    if (el.tagName === 'IMG' && !el.hasAttribute('alt')) anota('imagemSemAlt', el.getAttribute('src') || '(sem src)');

    // controle interativo sem nome acessível
    if (el.matches('button, a[href], [role="button"], [role="link"], [role="tab"], [role="checkbox"]') && !rotulo(el)) {
      anota('semNomeAcessivel', `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    }

    // campo de formulário visível sem rótulo
    if (el.matches('input:not([type="hidden"]), textarea, select') && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      const temLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
      const dentroDeLabel = el.closest('label');
      if (!temLabel && !dentroDeLabel) anota('campoSemRotulo', `${el.tagName.toLowerCase()}[${el.getAttribute('type') || ''}] ${el.getAttribute('placeholder') || ''}`);
    }

    // alvo de toque pequeno (WCAG 2.5.8 pede 24x24; a referência do projeto é 44).
    // Alvos INLINE (link dentro de um texto corrido) ficam fora — é a exceção da norma.
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    if (!inline && el.matches('button, a[href], [role="button"], input[type="checkbox"], [role="tab"]') && (r.width < 24 || r.height < 24)) {
      anota('alvoPequeno', `${(rotulo(el) || el.tagName).slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }

    // contraste de texto (WCAG AA: 4.5:1 normal, 3:1 grande)
    const textoDireto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (textoDireto) {
      const cor = rgb(s.color);
      // Fundo com gradiente/imagem ou texto pintado por outro caminho
      // (`-webkit-text-fill-color`) não pode ser medido por cor de fundo:
      // entra como NÃO MEDIDO em vez de virar um achado falso.
      let temGradiente = false;
      for (let no = el; no && no !== document.documentElement; no = no.parentElement) {
        if (getComputedStyle(no).backgroundImage !== 'none') { temGradiente = true; break; }
      }
      const fill = (s.webkitTextFillColor || '').trim();
      if (temGradiente || (fill && fill !== s.color)) {
        if ((el.textContent || '').trim()) anota('contrasteNaoMedido', `${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 30)}"`);
      } else if (cor && cor.a > 0.1) {
        const fundo = fundoEfetivo(el);
        const razao = contraste(cor, fundo);
        const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
        const minimo = grande ? 3 : 4.5;
        if (razao < minimo) {
          anota('contrasteBaixo', `${razao.toFixed(2)}:1 (mín ${minimo}) "${(el.textContent || '').trim().slice(0, 40)}" [${s.color} sobre rgb(${fundo.r},${fundo.g},${fundo.b})]`);
        }
      }
    }
  }

  // id duplicado
  const ids = new Map();
  for (const el of raiz.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) anota('idDuplicado', `${id} (${n}x)`);

  return {
    totalElementos: todos.length,
    achados: Object.fromEntries(Object.entries(achados).map(([k, v]) => [k, { n: v.length, exemplos: v.slice(0, 3) }])),
  };
};

// ---------------------------------------------------------------------------
// Build / preview
// ---------------------------------------------------------------------------
function existeDist() {
  return fs.existsSync(path.join(RAIZ, 'dist', 'index.html'));
}

function rodarBuild() {
  const bin = path.join(RAIZ, 'node_modules', '.bin', 'vite');
  if (!fs.existsSync(bin)) throw new Error(`vite não instalado em ${bin} — rode \`bun install\``);
  console.log('[ct-001] construindo o bundle (vite build --manifest)…');
  const r = require('node:child_process').spawnSync(bin, ['build', '--manifest'], {
    cwd: RAIZ, stdio: 'inherit', env: { ...process.env, TMPDIR: path.join(RAIZ, '.tmp') },
  });
  if (r.status !== 0) throw new Error(`build falhou (exit ${r.status})`);
}

async function urlResponde(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

async function subirPreview(url) {
  const porta = new URL(url).port || '4173';
  const bin = path.join(RAIZ, 'node_modules', '.bin', 'vite');
  const filho = spawn(bin, ['preview', '--host', '127.0.0.1', '--port', porta, '--strictPort'], {
    cwd: RAIZ, env: { ...process.env, TMPDIR: path.join(RAIZ, '.tmp') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saida = '';
  filho.stdout.on('data', (d) => { saida += d.toString(); });
  filho.stderr.on('data', (d) => { saida += d.toString(); });
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    if (await urlResponde(url)) return { filho, saida: () => saida };
    if (filho.exitCode !== null) throw new Error(`preview saiu com código ${filho.exitCode}: ${saida.slice(-400)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  filho.kill();
  throw new Error(`preview não respondeu em ${url} em 60 s: ${saida.slice(-400)}`);
}

/**
 * Descobre o ref do Supabase a partir do bundle servido — o roteiro não guarda o
 * host no código (nada de produção no diff). Só o ref é usado: para montar a chave
 * da sessão falsa e para separar "backend real barrado" de "externo barrado".
 */
function descobrirRefSupabase() {
  const dir = path.join(RAIZ, 'dist', 'assets');
  if (!fs.existsSync(dir)) return null;
  for (const nome of fs.readdirSync(dir)) {
    if (!nome.endsWith('.js')) continue;
    const texto = fs.readFileSync(path.join(dir, nome), 'utf8');
    const m = texto.match(/([a-z0-9]{20})\.supabase\.co/);
    if (m) return m[1];
  }
  return null;
}

/** Soma os bytes do chunk do módulo (entrada + imports estáticos) no manifesto. */
function chunkDoModulo() {
  const arquivo = path.join(RAIZ, 'dist', '.vite', 'manifest.json');
  if (!fs.existsSync(arquivo)) return null;
  const manifesto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const entrada = Object.entries(manifesto).find(([src]) => src.includes('contacts/ContactsView'));
  if (!entrada) return null;
  const [, dados] = entrada;
  const vistos = new Set();
  const propria = [];
  const dependencias = [];
  const visitar = (chave, profundidade) => {
    if (vistos.has(chave) || profundidade > 3) return;
    vistos.add(chave);
    const item = manifesto[chave];
    if (!item) return;
    const alvo = chave === entrada[0] ? propria : dependencias;
    const p = path.join(RAIZ, 'dist', item.file);
    alvo.push({ arquivo: item.file, bytes: fs.existsSync(p) ? fs.statSync(p).size : 0 });
    for (const dep of item.imports ?? []) visitar(dep, profundidade + 1);
  };
  visitar(entrada[0], 0);
  const soma = (l) => l.reduce((a, b) => a + b.bytes, 0);
  return {
    entrada: dados.file,
    bytesProprios: soma(propria),
    bytesDependencias: soma(dependencias),
    bytesTotal: soma(propria) + soma(dependencias),
    dependencias: dependencias.sort((a, b) => b.bytes - a.bytes),
  };
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const s = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);

function relatorioMarkdown(dados) {
  const linhas = [];
  linhas.push('# Contatos — medição inicial do caminho até a conversa (CT-001)');
  linhas.push('');
  linhas.push(`> **Não é um relatório de melhoria: são os números de ANTES.** A meta do plano`);
  linhas.push('> (`docs/plans/PLANO_CONTATOS_POR_JORNADA_2026-10-08.md`, jornada 1 · Achar) é');
  linhas.push('> **3 cliques e 5 segundos** do módulo até a conversa com um cliente. Este documento');
  linhas.push('> fixa o ponto de partida para os cartões seguintes compararem.');
  linhas.push('');
  linhas.push(`- Gerado em: ${dados.geradoEm}`);
  linhas.push(`- Commit medido: \`${dados.commit ?? '(sem git)'}\``);
  linhas.push(`- Preview: \`${dados.baseUrl}\` — bundle de produção (\`vite build\`, com manifesto)`);
  linhas.push(`- Roteiro: \`node scripts/qa/contatos-jornada.cjs --repeticoes ${dados.rodadasPorLargura ?? 1} --md docs/audits/CONTATOS_BASELINE_2026-10-08.md\``);
  linhas.push(`- Rodadas: ${dados.rodadasPorLargura ?? 1} por largura; a linha de referência é a **mediana em segundos** (o host é compartilhado entre agentes e uma rodada isolada pega pico de carga).`);
  linhas.push('');
  linhas.push('## O que foi medido, e o que não foi');
  linhas.push('');
  linhas.push('Medido no navegador real (Chromium do Playwright), a partir do menu principal já');
  linhas.push('carregado: clicar **Contatos** → digitar o termo na **busca** → clicar **Conversar**.');
  linhas.push('"Conversa aberta" = Inbox aberta com o nome completo do contato-alvo no painel/área principal.');
  linhas.push('');
  linhas.push('O roteiro roda com **sessão falsa e backend 100% mockado** (mesmo padrão dos projetos');
  linhas.push('`chromium-contacts-visual` e `chromium-a11y` do `playwright.config.ts`): nada sai para o');
  linhas.push('Supabase real — um guarda de rede barra e **registra** qualquer escape (o roteiro falha se');
  linhas.push('houver um). WebSocket também é bloqueado.');
  linhas.push('');
  linhas.push(`- **Limite 1 — a lista é uma fixture de ${dados.contatos} contatos**: o banco local tem`);
  linhas.push('  poucos contatos, então a lista de teste é controlada e o contato-alvo é achado pela');
  linhas.push('  busca de verdade (mock da RPC `search_contacts` filtrado pelo termo enviado).');
  linhas.push('- **Limite 2 — latência de banco real não entra**: as respostas são locais; os segundos');
  linhas.push('  medem o custo do CLIENTE (montagem, chunks, troca de módulo), não a rede do Supabase.');
  linhas.push('- **Limite 3 — fontes do Google barradas**: a medição é hermética, então o texto usa a');
  linhas.push('  fonte de fallback; os erros de console de origem "externo" são esse efeito.');
  linhas.push('- **Limite 4 — a conversa do alvo é mockada no mesmo caminho da Inbox**: o banco');
  linhas.push('  local tem poucos contatos e não é usado aqui; a fixture serve a lista de contatos,');
  linhas.push('  a RPC de busca e uma mensagem da conversa do contato-alvo. A coluna');
  linhas.push('  "é a conversa do contato buscado?" precisa ficar "sim"; se ficar "não",');
  linhas.push('  o roteiro registra falha e sai com EXIT 1.');
  linhas.push('');
  linhas.push('## Números de antes');
  linhas.push('');
  linhas.push('| Largura | Cliques | Segundos | Requisições | JS baixado no caminho | Chunk do módulo (build) | Busca: cards antes → depois | Erros do app | Achados de a11y |');
  linhas.push('|---|---|---|---|---|---|---|---|---|');
  for (const m of dados.medicoes) {
    const js = m.recursos.filter((r) => r.url.endsWith('.js')).reduce((a, r) => a + r.decodificado, 0);
    const erros = m.console.filter((c) => c.categoria === 'app' && c.tipo === 'error').length;
    const a11y = Object.values(m.a11y?.achados ?? {}).reduce((a, x) => a + x.n, 0);
    const busca = m.cardsAntesDaBusca == null ? '—' : `${m.cardsAntesDaBusca} → ${m.cardsAposBusca} (filtrou: ${m.buscaFiltrou ? 'sim' : '**não**'})`;
    const chunk = dados.chunkBuild ? `${kb(dados.chunkBuild.bytesProprios)} (entrada)` : '—';
    linhas.push(`| ${m.largura} px | ${m.cliques ?? '—'} | ${s(m.etapas.total)} | ${m.requisicoes.total} | ${kb(js)} | ${chunk} | ${busca} | ${erros} | ${a11y} |`);
  }
  linhas.push('');
  linhas.push('O **chunk do módulo (build)** é o arquivo do `ContactsView` no manifesto (o módulo');
  linhas.push(`como ele é baixado); as dependências estáticas somam ${dados.chunkBuild ? kb(dados.chunkBuild.bytesTotal) : '—'} no`);
  linhas.push('total. A coluna **JS baixado no caminho** é o que o navegador baixou de fato na janela');
  linhas.push('medida (0 KB = já estava em cache/precarga — ver a seção do chunk do módulo).');
  linhas.push('');
  linhas.push('Meta do plano: **3 cliques e 5 segundos** — a comparação é com esta tabela.');
  linhas.push('');
  linhas.push('### Onde os segundos vão (por largura)');
  linhas.push('');
  linhas.push('| Largura | Como abriu o módulo | Abrir o módulo | Achar na busca | Abrir a conversa (total) | É a conversa do contato buscado? | Sinal que fechou a medição |');
  linhas.push('|---|---|---|---|---|---|---|');
  for (const m of dados.medicoes) {
    linhas.push(`| ${m.largura} px | ${m.comoAbriu ?? '—'} | ${s(m.etapas.moduloAberto)} | ${s(m.etapas.contatoEncontrado)} | ${s(m.etapas.total)} | ${m.conversaDoAlvo ? 'sim' : '**não**'} | ${m.sinal ?? '**não abriu**'} |`);
  }
  if (dados.medicoes.some((m) => (m.rodadas ?? []).length > 1)) {
    linhas.push('');
    linhas.push('Todas as rodadas (a linha de referência é a mediana em segundos):');
    linhas.push('');
    linhas.push('| Largura | Cliques | Segundos | Requisições | JS baixado | Conversa do alvo | Alvo encontrado em |');
    linhas.push('|---|---|---|---|---|---|---|');
    for (const m of dados.medicoes) {
      for (const [i, r] of (m.rodadas ?? []).entries()) {
        linhas.push(`| ${m.largura} px · rodada ${i + 1} | ${r.cliques} | ${r.segundos.toFixed(1)} s | ${r.requisicoes} | ${r.jsKb} KB | ${r.conversaDoAlvo ? 'sim' : 'não'} | ${r.alvoEncontradoEm ?? '—'} |`);
      }
    }
  }
  linhas.push('');
  linhas.push('## Peso do chunk do módulo (do build)');
  linhas.push('');
  if (dados.chunkBuild) {
    linhas.push(`- Entrada: \`${dados.chunkBuild.entrada}\` — ${kb(dados.chunkBuild.bytesProprios)}`);
    linhas.push(`- Dependências estáticas (${dados.chunkBuild.dependencias.length}): ${kb(dados.chunkBuild.bytesDependencias)}`);
    linhas.push(`- **Total do módulo: ${kb(dados.chunkBuild.bytesTotal)}**`);
    linhas.push('');
    linhas.push('Maiores dependências:');
    linhas.push('');
    linhas.push('| Chunk | Bytes |');
    linhas.push('|---|---|');
    for (const d of dados.chunkBuild.dependencias.slice(0, 10)) linhas.push(`| \`${d.arquivo}\` | ${kb(d.bytes)} |`);
  } else {
    linhas.push('_(manifesto do build ausente: rode com `--build`)_');
  }
  linhas.push('');
  linhas.push('### O que o navegador baixou do módulo durante a janela medida');
  linhas.push('');
  linhas.push('| Largura | Arquivo do módulo | Já estava carregado antes de abrir? | Baixado no caminho? | Bytes (decodificado) |');
  linhas.push('|---|---|---|---|---|');
  for (const m of dados.medicoes) {
    const c = m.chunkModuloRuntime;
    linhas.push(c
      ? `| ${m.largura} px | \`${c.arquivo}\` | ${c.jaCarregadoAntesDeAbrir ? 'sim' : 'não'} | ${c.carregadoNoCaminho ? 'sim' : 'não'} | ${kb(c.bytesDecodificado)} |`
      : `| ${m.largura} px | — | — | — | — |`);
  }
  linhas.push('');
  linhas.push('## Requisições do caminho');
  linhas.push('');
  for (const m of dados.medicoes) {
    linhas.push(`### ${m.largura} px — ${m.requisicoes.total} requisição(ões)`);
    linhas.push('');
    linhas.push('| Rota | Nº |');
    linhas.push('|---|---|');
    for (const r of m.requisicoes.porCaminho.slice(0, 15)) linhas.push(`| \`${r.caminho}\` | ${r.n} |`);
    linhas.push('');
  }
  linhas.push('## Erros de console e exceções');
  linhas.push('');
  linhas.push('Classificação: **app** = erro/warn do próprio código (é o que interessa); **mock** = falha');
  linhas.push('de recurso do backend mockado (403 de escrita, 401 do JWT falso, recurso barrado) —');
  linhas.push('esperado nesta medição; **externo** = fontes do Google barradas.');
  linhas.push('');
  for (const m of dados.medicoes) {
    const porCat = (cat) => m.console.filter((c) => c.categoria === cat);
    const app = porCat('app');
    linhas.push(`### ${m.largura} px`);
    linhas.push('');
    linhas.push(`- erros do app: **${app.filter((c) => c.tipo === 'error').length}** · avisos do app: ${app.filter((c) => c.tipo === 'warning').length}`);
    linhas.push(`- erros do app DURANTE o caminho medido (o resto é do casco, antes de abrir Contatos): ${app.filter((c) => c.tipo === 'error' && c.ms >= (m.inicioAbs ?? 0) && c.ms <= (m.fimAbs ?? Infinity)).length}`);
    linhas.push(`- falhas de recurso do mock: ${porCat('mock').length}`);
    linhas.push(`- fontes externas barradas: ${porCat('externo').length}`);
    linhas.push(`- exceções não tratadas: **${m.excecoes.length}**`);
    for (const c of app.slice(0, 5)) linhas.push(`  - \`${c.texto.slice(0, 200)}\``);
    for (const e of m.excecoes.slice(0, 5)) linhas.push(`  - exceção: \`${String(e).slice(0, 200)}\``);
    linhas.push('');
  }
  linhas.push('## Achados de acessibilidade (tela do módulo)');
  linhas.push('');
  linhas.push('Escopo: a área do módulo (`#main-content`), com a busca e a lista carregadas — o casco');
  linhas.push('(barra lateral, cabeçalho, painel de notificações) não é o objeto desta medição.');
  linhas.push('');
  linhas.push('Regras verificadas: fonte < 11 px, `<img>` sem `alt`, controle sem nome acessível, campo');
  linhas.push('sem rótulo, alvo de toque < 24 px (WCAG 2.5.8), contraste abaixo de AA (4,5:1 normal / 3:1');
  linhas.push('grande) e `id` duplicado.');
  linhas.push('');
  linhas.push('| Largura | Elementos | Fonte <11px | Img sem alt | Sem nome | Campo sem rótulo | Alvo <24px | Contraste baixo / não medido | Id duplicado |');
  linhas.push('|---|---|---|---|---|---|---|---|---|');
  for (const m of dados.medicoes) {
    const a = m.a11y?.achados ?? {};
    const n = (k) => a[k]?.n ?? 0;
    linhas.push(`| ${m.largura} px | ${m.a11y?.totalElementos ?? '—'} | ${n('fonteAbaixo11')} | ${n('imagemSemAlt')} | ${n('semNomeAcessivel')} | ${n('campoSemRotulo')} | ${n('alvoPequeno')} | ${n('contrasteBaixo')} / ${n('contrasteNaoMedido')} | ${n('idDuplicado')} |`);
  }
  linhas.push('');
  linhas.push('Duas ressalvas para ler esta tabela:');
  linhas.push('');
  linhas.push('- **contraste** é calculado pela cor de texto contra o fundo opaco mais próximo — sem');
  linhas.push('  considerar gradiente, imagem de fundo nem camada translúcida (alpha ≤ 0,5): esses casos');
  linhas.push('  entram como "não medido", e um "1,00:1 (branco sobre branco)" é artefato dessa');
  linhas.push('  simplificação, não achado. É uma aproximação de WCAG 1.4.3, não a medição do axe.');
  linhas.push('- **alvo < 24 px** é o mínimo da WCAG 2.5.8; alvos inline (link no meio de um texto)');
  linhas.push('  ficam fora. A referência de toque do projeto é 44 px, então 24 é o piso, não a meta.');
  linhas.push('');
  for (const m of dados.medicoes) {
    const a = m.a11y?.achados ?? {};
    const comExemplo = Object.entries(a).filter(([, v]) => v.n > 0);
    if (!comExemplo.length) continue;
    linhas.push(`### Exemplos — ${m.largura} px`);
    linhas.push('');
    for (const [tipo, v] of comExemplo) {
      linhas.push(`- **${tipo}** (${v.n}): ${v.exemplos.map((e) => `\`${e}\``).join(' · ')}`);
    }
    linhas.push('');
  }
  linhas.push('## Integridade da medição');
  linhas.push('');
  linhas.push('A guarda de rede é por **allowlist** (só a origem local passa). Toda requisição');
  linhas.push('não-local ou é servida por um **mock** (a maior parte: o backend inteiro é mockado)');
  linhas.push('ou é **barrada** pela guarda (Mapbox, fontes do Google, WebSocket). O que não estiver');
  linhas.push('em nenhuma das duas contas é escape e derruba o roteiro (EXIT 1).');
  linhas.push('');
  linhas.push('| Largura | Não-local atendida por mock | Barrada pela guarda (backend real) | Outros hosts barrados | WebSocket bloqueado | Escapes |');
  linhas.push('|---|---|---|---|---|---|');
  for (const m of dados.medicoes) {
    linhas.push(`| ${m.largura} px | ${m.registro.mocado.length} | ${m.registro.redeBarrada.length} | ${m.registro.externoBarrado.length} | ${m.registro.webSocketBloqueado.length} | ${m.registro.escaparam ?? 0} |`);
  }
  linhas.push('');
  linhas.push(`Falhas do roteiro: ${dados.falhas.length ? dados.falhas.map((f) => `\`${f}\``).join(' · ') : 'nenhuma'}.`);
  linhas.push('');
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------
async function principal() {
  const args = lerArgs(process.argv.slice(2));
  if (args.ajuda) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!/, ''));
    return 0;
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    playwright = require('@playwright/test');
  }
  const { chromium } = playwright;

  const baseUrl = args.baseUrl ?? process.env.CT001_BASE_URL ?? URL_PADRAO;
  let servidor = null;
  if (!args.baseUrl || !(await urlResponde(baseUrl))) {
    if (args.semServir) {
      console.error(`ERRO: nada respondendo em ${baseUrl} e --sem-servir foi pedido.`);
      return 2;
    }
    if (!existeDist() || args.build) rodarBuild();
    servidor = await subirPreview(baseUrl);
    console.log(`[ct-001] preview local no ar em ${baseUrl}`);
  }

  const contatos = criarContatos(args.contatos);
  const { alvo, termo } = escolherAlvo(contatos);
  const casam = filtrarContatos(contatos, termo);
  if (casam.length !== 1 || casam[0].name !== alvo.name) {
    console.error(`ERRO: o termo "${termo}" casa com ${casam.length} contatos da fixture (${casam.map((c) => c.name).join(', ')}); a jornada precisa de um alvo único.`);
    return 2;
  }

  const dados = {
    geradoEm: new Date().toISOString(),
    commit: (() => {
      try {
        return require('node:child_process')
          .execSync('git rev-parse --short HEAD', { cwd: RAIZ }).toString().trim();
      } catch {
        return null;
      }
    })(),
    baseUrl,
    contatos: contatos.length,
    rodadasPorLargura: Math.max(1, args.repeticoes ?? 1),
    termoBusca: termo,
    alvo: alvo.name,
    chunkBuild: chunkDoModulo(),
    medicoes: [],
    falhas: [],
  };

  // O ref do backend sai do bundle servido (nada de host de produção no código).
  REF = descobrirRefSupabase();
  if (!REF) {
    throw new Error('não achei o ref do Supabase no bundle servido — rode sem --sem-servir ou gere o build (--build)');
  }

  const navegador = await chromium.launch();
  const arquivoModulo = dados.chunkBuild?.entrada ?? null;
  const totalRodadas = Math.max(1, args.repeticoes ?? 1);
  try {
    for (const largura of args.larguras) {
      const rodadas = [];
      for (let r = 0; r < totalRodadas; r++) {
        const rotulo = totalRodadas > 1 ? `${largura}px rodada ${r + 1}` : `${largura}px`;
        const registro = { requisicoes: [], redeBarrada: [], webSocketBloqueado: [], externoBarrado: [], mocado: [] };
        const contexto = await navegador.newContext({
          viewport: { width: largura, height: ALTURAS[largura] ?? 900 },
          colorScheme: 'light',
          locale: 'pt-BR',
        });
        const page = await contexto.newPage();
        page.on('request', (rq) => registro.requisicoes.push({ url: rq.url(), metodo: rq.method(), ms: Date.now() }));
        const console_ = [];
        page.on('console', (msg) => {
          const tipo = msg.type();
          if (tipo !== 'error' && tipo !== 'warning') return;
          const texto = msg.text();
          const origem = msg.location()?.url ?? '';
          // Origem "externa": as fontes do Google, barradas de propósito.
          const externo = /fonts\.googleapis|fonts\.gstatic/.test(origem) || /fonts\.googleapis|fonts\.gstatic/.test(texto);
          // Origem "mock": falha de recurso do backend mockado (403 de escrita, 401
          // do JWT falso, recurso barrado) — esperado aqui, não defeito do produto.
          const mock = /Failed to load resource|net::ERR_/.test(texto) || /supabase\.co/.test(origem) ||
            /blocked|rede real bloqueada/.test(texto);
          console_.push({ tipo, texto, origem, ms: Date.now(), categoria: externo ? 'externo' : mock ? 'mock' : 'app' });
        });
        const excecoes = [];
        page.on('pageerror', (e) => excecoes.push(String(e.message ?? e)));

        await prepararPagina(page);
        await registrarRotas(page, registro, contatos, { buscaSempreVazia: args.buscaSempreVazia, alvo });

        const inicio = Date.now();
        let med;
        try {
          ({ med } = await jornada(page, registro, contatos, { ...args, largura, alvo, termo, baseUrl, arquivoModulo }));
        } catch (e) {
          const mensagem = String(e?.message ?? e).slice(0, 240);
          dados.falhas.push(`${rotulo}: etapa da jornada falhou (${mensagem})`);
          med = {
            largura,
            sinal: null,
            erro: mensagem,
            etapas: { total: Date.now() - inicio },
            requisicoes: { total: 0, porCaminho: [] },
            recursos: [],
            console: [],
            excecoes: [],
            registro,
            cliques: null,
            conversaDoAlvo: false,
            alvoEncontradoEm: null,
            cardsAntesDaBusca: null,
            cardsAposBusca: null,
            buscaFiltrou: false,
          };
        }
        const fim = Date.now();

        // Requisições DA JANELA da jornada (do clique em "Contatos" até a conversa
        // abrir) — não do boot do app, que acontece antes e não é o que se mede.
        med.requisicoes = contarRequisicoes(registro, med.inicioAbs ?? inicio, med.fimAbs ?? fim);
        med.chunkRuntime = (() => {
          const js = med.recursos.filter((rc) => rc.url.endsWith('.js'));
          if (!js.length) return null;
          const maior = js.reduce((a, b) => (b.decodificado > a.decodificado ? b : a));
          return { arquivo: maior.url.split('/').pop(), decodificado: maior.decodificado, transferido: maior.transferido, nJs: js.length, bytesJsDecodificado: js.reduce((a, rc) => a + rc.decodificado, 0) };
        })();
        med.console = console_;
        med.excecoes = excecoes;
        med.registro = registro;

        // Varredura de acessibilidade numa passada limpa pela tela do módulo —
        // só na última rodada (a tela é a mesma; repetir só custaria tempo).
        if (r === totalRodadas - 1) {
          try {
            await page.goto(`${baseUrl}/?view=contacts`, { waitUntil: 'domcontentloaded' });
            await page.getByPlaceholder(/Buscar por nome/).waitFor({ state: 'visible', timeout: args.limite * 1000 });
            await page.waitForTimeout(300);
            med.a11y = await page.evaluate(VARREDURA_A11Y);
          } catch (e) {
            med.a11y = null;
            dados.falhas.push(`${rotulo}: varredura de acessibilidade não rodou (${String(e.message).slice(0, 120)})`);
          }
        }

        if (!med.sinal || med.sinal.includes('APENAS')) dados.falhas.push(`${rotulo}: conversa não abriu (${med.sinal ?? 'nenhum sinal'})`);
        if (!med.conversaDoAlvo) dados.falhas.push(`${rotulo}: a conversa aberta não é a do contato-alvo (${alvo.name})`);
        if (excecoes.length) dados.falhas.push(`${rotulo}: ${excecoes.length} exceção(ões) de página`);
        // Integridade: nada pode sair da máquina sem passar por mock ou pela guarda.
        // Toda requisição não-local tem de estar registrada como atendida por um mock
        // ou barrada pela guarda; o que não estiver é ESCAPE e vira falha.
        const atendidas = new Set([...registro.mocado, ...registro.redeBarrada, ...registro.externoBarrado]);
        const escaparam = registro.requisicoes.filter((r) => !RE_URL_LOCAL.test(r.url) && !atendidas.has(r.url));
        if (escaparam.length) dados.falhas.push(`${rotulo}: ${escaparam.length} requisição(ões) saíram da máquina (${escaparam[0].url.slice(0, 90)})`);
        registro.escaparam = escaparam.length;

        rodadas.push(med);
        console.log(`[ct-001] ${rotulo}: ${med.cliques} clique(s), ${s(med.etapas.total)}, ${med.requisicoes.total} requisição(ões), busca ${med.cardsAntesDaBusca}→${med.cardsAposBusca}, conversa do alvo: ${med.conversaDoAlvo ? 'sim' : 'NÃO'}, sinal: ${med.sinal ?? 'não abriu'}`);
        if (med.diagnostico) console.log(`[ct-001] diagnóstico ${rotulo}: ${JSON.stringify(med.diagnostico).slice(0, 2500)}`);
        await contexto.close();
      }
      // Rodada de referência: a MEDIANA pelo tempo total (o host é compartilhado e
      // uma rodada isolada pode pegar pico de carga).
      const ordenadas = [...rodadas].sort((a, b) => a.etapas.total - b.etapas.total);
      const med = ordenadas[Math.floor(ordenadas.length / 2)];
      // A varredura de acessibilidade roda na última rodada (a tela é a mesma):
      // leve o resultado para a rodada de referência, senão a tabela sai zerada.
      med.a11y = rodadas[rodadas.length - 1].a11y ?? null;
      med.rodadas = rodadas.map((x) => ({
        cliques: x.cliques,
        segundos: +(x.etapas.total / 1000).toFixed(1),
        requisicoes: x.requisicoes.total,
        jsKb: +(x.recursos.filter((rc) => rc.url.endsWith('.js')).reduce((a, rc) => a + rc.decodificado, 0) / 1024).toFixed(1),
        conversaDoAlvo: x.conversaDoAlvo,
        alvoEncontradoEm: x.alvoEncontradoEm,
      }));

      dados.medicoes.push(med);
    }
  } finally {
    await navegador.close().catch(() => {});
    if (servidor) servidor.filho.kill();
  }

  const markdown = relatorioMarkdown(dados);
  console.log('\n' + markdown);
  if (args.md) {
    const destino = path.resolve(RAIZ, args.md);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, markdown + '\n');
    console.log(`\n[ct-001] relatório gravado em ${path.relative(RAIZ, destino)}`);
  }
  if (args.json) {
    const destino = path.resolve(RAIZ, args.json);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(dados, null, 2) + '\n');
    console.log(`[ct-001] números crus gravados em ${path.relative(RAIZ, destino)}`);
  }
  return dados.falhas.length ? 1 : 0;
}

if (require.main === module) {
  principal()
    .then((codigo) => process.exit(codigo))
    .catch((erro) => {
      console.error(`ERRO: ${erro?.stack ?? erro}`);
      process.exit(2);
    });
}

module.exports = { criarContatos, filtrarContatos, escolherAlvo, relatorioMarkdown };
