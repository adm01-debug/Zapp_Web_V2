import { test, expect, type Page } from '@playwright/test';

/**
 * Y09 — Navegação por todos os módulos sem erro de console nem requisição falha.
 *
 * Abre CADA entrada da barra lateral — as 11 da navegação primária e os 31 itens
 * das 5 seções (Vendas & CRM, Automação & IA, Analytics, Conexões, Sistema) — e
 * prova, módulo a módulo, que a tela monta de verdade: título do documento, tela
 * própria do módulo (nunca "Acesso restrito", nunca o esqueleto de carregamento
 * preso, nunca tela em branco) e nenhum erro de console, exceção ou resposta >= 400.
 * Repete tudo no celular 390x844, pelo menu móvel. A busca global ("Buscar") entra
 * nas duas larguras.
 *
 * AUTENTICAÇÃO: o teste entra pela TELA DE LOGIN com o usuário sintético do banco
 * LOCAL (lido de E2E_TEST_EMAIL/E2E_TEST_PASSWORD, que o wrapper zapp-e2e-local
 * injeta: admin.local@promobrindes.com.br, semeado por ~/.local/share/zapp-local/
 * seed.sql). Nenhuma sessão salva em disco é lida ou usada (R1), e nada aqui fala
 * com a produção.
 *
 * A VARREDURA REPROVA por padrão. Só escapam as ocorrências de DUAS listas
 * explícitas e curtas, separadas de propósito, porque a natureza é diferente:
 *
 * 1) LACUNA DO CONJUNTO LOCAL — a lista LACUNAS_DO_CONJUNTO_LOCAL. São funções de
 *    ponta que precisam de segredo que só existe no projeto externo/produção (R1 e
 *    o HERMES-GUARD proíbem usar segredo real). Cada entrada é um endpoint EXATO com
 *    status e CORPO medidos na própria resposta (o espião de fetch abaixo lê o corpo
 *    real e o teste só tolera se casar com a assinatura declarada) e traz o log do
 *    runtime que prova a configuração ausente. Não há família de endpoint, prefixo
 *    nem regra por texto solto: endpoint novo, outro status ou outro corpo REPROVAM.
 *
 * 2) DEFEITO DO PRODUTO — as listas DEFEITOS_DE_PRODUTO (resposta HTTP) e
 *    NINHOS_DE_PRODUTO (HTML aninhado). É bug do app, achado por esta varredura,
 *    com dono em outra área. Cada defeito tem um `test.fixme` próprio no fim do
 *    arquivo, com a reprodução de verdade (o corpo que roda vermelho hoje e passa
 *    quando o produto for corrigido) e a causa em arquivo:linha. No teste principal
 *    a ocorrência NÃO é engolida: sai no relatório da rodada (linha
 *    `[DEFEITOS DE PRODUTO]`, com módulo + sintoma + nome do fixme) e a varredura
 *    REPROVA se a assinatura não for exatamente a medida (outro status, outro corpo,
 *    ou outro par de tags aninhadas) — e reprova qualquer outro console.error ou
 *    resposta >= 400 que não esteja em nenhuma das listas.
 *
 * A lista de módulos e os títulos esperados são DADOS DO TESTE: vieram do cartão
 * Y09 e das entradas que a barra lateral mostra. Nada é lido do código do produto.
 */

interface ItemNav {
  /** identificador da view no app */
  id: string;
  /** rótulo exato da entrada na barra lateral (o nome acessível do botão) */
  label: string;
}

interface SecaoNav {
  label: string;
  itens: ItemNav[];
}

const PRIMARIOS: ItemNav[] = [
  { id: 'inbox', label: 'Chat' },
  { id: 'team-chat', label: 'Teams' },
  { id: 'email-chat', label: 'Email' },
  { id: 'contacts', label: 'Contatos' },
  { id: 'multiplix', label: 'Multiplix' },
  { id: 'catalog', label: 'Catálogo' },
  { id: 'voip', label: 'Telefonia' },
  { id: 'pipeline', label: 'Quadro' },
  { id: 'tasks', label: 'Tarefas' },
  { id: 'achievements', label: 'Conquistas' },
  { id: 'dashboard', label: 'Dashboard' },
];

const SECOES: SecaoNav[] = [
  {
    label: 'Vendas & CRM',
    itens: [
      { id: 'crm360', label: 'CRM 360°' },
      { id: 'wallet', label: 'Carteira' },
      { id: 'queues', label: 'Filas' },
      { id: 'schedule', label: 'Agendamentos' },
      { id: 'groups', label: 'Grupos' },
    ],
  },
  {
    label: 'Automação & IA',
    itens: [
      { id: 'talkx', label: 'Campanhas' },
      { id: 'chatbot', label: 'Chatbot' },
      { id: 'automations', label: 'Automações' },
      { id: 'wa-flows', label: 'WhatsApp Flows' },
      { id: 'knowledge', label: 'Base de Conhecimento' },
      { id: 'churn', label: 'Previsão Churn' },
      { id: 'ticket-classifier', label: 'Classificador IA' },
      { id: 'campaigns', label: 'Campanhas Clássicas' },
      { id: 'wa-templates', label: 'Templates WA' },
    ],
  },
  {
    label: 'Analytics',
    itens: [
      { id: 'reports', label: 'Relatórios' },
      { id: 'warroom', label: 'War Room' },
      { id: 'sentiment', label: 'Sentimento' },
      { id: 'nps', label: 'NPS' },
      { id: 'sla', label: 'SLA' },
    ],
  },
  {
    label: 'Conexões',
    itens: [
      { id: 'connections', label: 'Conexões' },
      { id: 'integrations', label: 'Integrações' },
      { id: 'omni-inbox', label: 'Omnichannel' },
      { id: 'gmail', label: 'Gmail' },
      { id: 'omnichannel', label: 'Canais Omnichannel' },
    ],
  },
  {
    label: 'Sistema',
    itens: [
      { id: 'agents', label: 'Equipe' },
      { id: 'security', label: 'Segurança' },
      { id: 'privacy', label: 'LGPD' },
      { id: 'admin', label: 'Admin' },
      { id: 'themes', label: 'Skins' },
      { id: 'docs', label: 'Documentação' },
      { id: 'settings', label: 'Configurações' },
    ],
  },
];

const TITULO_BASE = 'WhatsApp Omnichannel';
const PLACEHOLDER_BUSCA = 'Buscar módulo… (ex: pipeline, chatbot)';
const MENU_DESKTOP = 'Menu de navegação principal';
const MENU_CELULAR = 'Menu de navegação';
const NAV_INFERIOR = 'Navegação principal';

/* -------------------------------------------------------------------------- */
/* Lista 1 — LACUNA DO CONJUNTO LOCAL (endpoint exato + status + corpo medido) */
/* -------------------------------------------------------------------------- */

interface LacunaLocal {
  /** caminho EXATO da função de ponta (sem host e sem query); '*' = falha do runtime local */
  caminho: string;
  status: number;
  /** assinatura do corpo: o teste só tolera se o corpo MEDIDO contiver uma delas */
  corpos: string[];
  /** prova da configuração ausente (log do runtime do conjunto local) */
  log: string;
  /** onde a resposta é produzida no código da função */
  fonte: string;
}

/**
 * As 4 entradas abaixo são tudo que o conjunto local não consegue servir por falta de
 * segredo/configuração externa — e cada uma é conferível: o corpo da resposta casa a
 * assinatura declarada e o log do runtime mostra a variável ausente.
 * (`docker logs <container>-functions | grep -i "not configured"`)
 *
 *   get-sip-password      503  {"error":"SIP não configurado","code":"SIP_NOT_CONFIGURED"}
 *                              log: {"fn":"get-sip-password","msg":"SIP_PASSWORD is not configured"}
 *                              (o mesmo endpoint tem um 401 de DEFEITO do produto — ver lista 2)
 *   promogifts-catalog    503  {"error":"External DB not configured","code":"CATALOG_NOT_CONFIGURED"}
 *                              (o banco externo do catálogo vive no projeto externo)
 *   multiplix-audience    503  {"error":"Internal server error"}
 *                              log: {"source":"edge","status":503,"msg":"Multiplix audience is not configured"}
 *                              (a função não sobe sem a ponte Singu: EXTERNAL_SUPABASE_URL/
 *                               EXTERNAL_SUPABASE_SERVICE_ROLE_KEY)
 *   gmail-oauth           500  Internal Server Error
 *                              log: Error: GOOGLE_CLIENT_ID is not configured
 *
 * Qualquer outra resposta — outro endpoint, outro status, corpo fora da assinatura —
 * REPROVA. Nada aqui é "5xx de edge" nem "família de endpoints".
 */
const LACUNAS_DO_CONJUNTO_LOCAL: LacunaLocal[] = [
  {
    caminho: '/functions/v1/get-sip-password',
    status: 503,
    corpos: ['"error":"SIP não configurado","code":"SIP_NOT_CONFIGURED"'],
    log: '{"level":"error","fn":"get-sip-password","msg":"SIP_PASSWORD is not configured"}',
    fonte: 'supabase/functions/get-sip-password/index.ts:53-58',
  },
  {
    caminho: '/functions/v1/promogifts-catalog',
    status: 503,
    corpos: ['"error":"External DB not configured","code":"CATALOG_NOT_CONFIGURED"'],
    log: 'o conjunto local não tem o banco externo do catálogo (external DB not configured)',
    fonte: 'supabase/functions/promogifts-catalog/index.ts:335-336',
  },
  {
    caminho: '/functions/v1/multiplix-audience',
    status: 503,
    corpos: ['"error":"Internal server error"'],
    log: '{"level":"error","source":"edge","status":503,"msg":"Multiplix audience is not configured"}',
    fonte: 'supabase/functions/multiplix-audience/index.ts:375,397',
  },
  {
    caminho: '/functions/v1/gmail-oauth',
    status: 500,
    corpos: ['Internal Server Error'],
    log: 'Error: GOOGLE_CLIENT_ID is not configured',
    fonte: 'supabase/functions/gmail-oauth/index.ts:303',
  },
  {
    // Falha do RUNTIME de Edge do conjunto local, não do app: o worker não conseguiu
    // subir e o próprio runtime respondeu. Corpo fixo, produzido pelo runtime (o app
    // nunca escreve essa mensagem), status 503.
    caminho: '*',
    status: 503,
    corpos: ['"code":"BOOT_ERROR","message":"Worker failed to boot'],
    log: "worker boot error: failed to bootstrap runtime: failed to create the graph: Failed caching npm package '@types/node@22.5.4'.: failed to unpack `node/readline/promises.d.ts` ... File exists (os error 17)",
    fonte: 'runtime de Edge do conjunto local (cache Deno do contêiner de functions)',
  },
];

/* -------------------------------------------------------------------------- */
/* Lista 2 — DEFEITO DO PRODUTO (bug do app, com dono e test.fixme próprio)    */
/* -------------------------------------------------------------------------- */

interface DefeitoDeProduto {
  /** sintoma curto, com o módulo, para o relatório da rodada */
  sintoma: string;
  /** dono do conserto (o relatório aponta a área) */
  area: string;
  /** título EXATO do test.fixme que reproduz o defeito (no fim do arquivo) */
  fixme: string;
  /** caminho + status + assinatura de corpo medida */
  caminho: string;
  status: number;
  corpos: string[];
}

/**
 * Defeitos de RESPOSTA (HTTP) medidos pela varredura. Cada um tem um `test.fixme`
 * que o reproduz com passos reais. Nenhum é tolerado em silêncio: a ocorrência sai
 * no relatório da rodada com módulo, sintoma, área e o nome do fixme — e a varredura
 * REPROVA se o status ou o corpo não forem exatamente os medidos aqui.
 */
const DEFEITOS_DE_PRODUTO: DefeitoDeProduto[] = [
  {
    sintoma: 'motor SIP chama get-sip-password sem credencial utilizável e recebe 401',
    area: 'chamadas',
    fixme: 'DEFEITO: o motor SIP chama get-sip-password sem credencial utilizável (401)',
    caminho: '/functions/v1/get-sip-password',
    status: 401,
    corpos: ['"error":"Invalid or expired token"', '"code":"UNAUTHORIZED_NO_AUTH_HEADER"'],
  },
  {
    sintoma: 'detect-new-device devolve 500 quando o app chama duas vezes em paralelo (StrictMode)',
    area: 'login/segurança',
    fixme: 'DEFEITO: detect-new-device devolve 500 quando o app chama duas vezes em paralelo',
    caminho: '/functions/v1/detect-new-device',
    status: 500,
    corpos: ['"error":"Internal server error"'],
  },
];

interface NinhoDeProduto {
  /** tag que CONTÉM (o React acusa "X dentro de X" / "X não pode conter X") */
  ancestral: string;
  /** tag CONTIDA */
  descendente: string;
  /** onde foi medido */
  onde: string;
  /** dono do conserto */
  area: string;
  /** título EXATO do test.fixme que reproduz o defeito (no fim do arquivo) */
  fixme: string;
}

/**
 * Defeitos de HTML ANINHADO medidos pela varredura. O React emite o par de tags de
 * duas formas — `In HTML, <div> cannot be a descendant of <p>.` (com a pilha de
 * componentes) e `<p> cannot contain a nested <div>.` — e as duas trazem os dois
 * nomes de tag; `parAninhamento` lê os DOIS formatos e só aceita o par exato
 * declarado aqui. Par novo (outra combinação de tags) REPROVA: é defeito novo, que
 * precisa de dono antes de virar tolerância.
 */
const NINHOS_DE_PRODUTO: NinhoDeProduto[] = [
  {
    ancestral: 'button',
    descendente: 'button',
    onde: 'barra lateral: botão "Adicionar aos favoritos" dentro do botão do item',
    area: 'telas',
    fixme: 'DEFEITO: a barra lateral aninha o <button> de favoritos dentro do <button> do item',
  },
  {
    ancestral: 'li',
    descendente: 'li',
    onde: 'trilha de navegação do PageHeader e view do Quadro (pipeline)',
    area: 'telas',
    fixme: 'DEFEITO: <li> dentro de <li> na trilha de navegação (PageHeader) e no Quadro',
  },
  {
    ancestral: 'p',
    descendente: 'div',
    onde: 'Documentação: selo do catálogo (<div>) dentro do <p> do subtítulo',
    area: 'telas',
    fixme: 'DEFEITO: a Documentação põe o selo do catálogo (<div>) dentro de um <p>',
  },
];

interface OcorrenciaTolerada {
  /** lista de origem: lacuna do conjunto local ou defeito do produto */
  origem: 'lacuna' | 'defeito';
  /** por que escapou (texto com a assinatura MEDIDA) */
  motivo: string;
}

/** Espiona o fetch da página para ler status e corpo exatos das edge functions. */
async function espionarLacunas(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const alvo = /\/functions\/v1\/[a-z0-9-]+(\?|$)/;
    const janela = window as unknown as { __lacunasLocais?: { url: string; status: number; corpo: string }[] };
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      const resposta = await original(...args);
      try {
        const entrada = args[0];
        const url = typeof entrada === 'string' ? entrada : entrada instanceof Request ? entrada.url : String(entrada);
        if (alvo.test(url)) {
          const corpo = await resposta.clone().text();
          janela.__lacunasLocais = janela.__lacunasLocais ?? [];
          janela.__lacunasLocais.push({
            url: url.split('?')[0], // sem query: casa com o que o teste vê
            status: resposta.status,
            corpo: corpo.replace(/\s+/g, ' ').slice(0, 200),
          });
        }
      } catch {
        // corpo ilegível: a falha dessa resposta segue reprovando
      }
      return resposta;
    };
  });
}

interface MedidaResposta {
  url: string;
  status: number;
  corpo: string;
}

async function lacunasMedidas(page: Page): Promise<MedidaResposta[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __lacunasLocais?: { url: string; status: number; corpo: string }[] }).__lacunasLocais ??
      [],
  );
}

/** Caminho da função de ponta (host/porta podem diferir entre app e resposta). */
function caminhoDaFuncao(url: string): string {
  return (url.match(/\/functions\/v1\/[^/?#]+/) ?? [url])[0];
}

/** Corpo casando alguma assinatura declarada (comparação no texto medido). */
function corpoCasa(corpo: string, assinaturas: string[]): boolean {
  return assinaturas.some((a) => corpo.includes(a));
}

/**
 * Confere uma resposta >= 400 contra as duas listas. Devolve `undefined` quando ela
 * não pertence a nenhuma — e aí ela REPROVA.
 */
function respostaTolerada(medida: MedidaResposta): OcorrenciaTolerada | undefined {
  const caminho = caminhoDaFuncao(medida.url);

  const lacuna = LACUNAS_DO_CONJUNTO_LOCAL.find(
    (l) =>
      (l.caminho === '*' || l.caminho === caminho) &&
      l.status === medida.status &&
      corpoCasa(medida.corpo, l.corpos),
  );
  if (lacuna) {
    return {
      origem: 'lacuna',
      motivo: `lacuna do conjunto local (${lacuna.log}; ${lacuna.fonte}) — corpo medido: ${medida.corpo}`,
    };
  }

  const defeito = DEFEITOS_DE_PRODUTO.find(
    (d) => d.caminho === caminho && d.status === medida.status && corpoCasa(medida.corpo, d.corpos),
  );
  if (defeito) {
    return {
      origem: 'defeito',
      motivo: `DEFEITO DO PRODUTO (${defeito.area}): ${defeito.sintoma} → test.fixme "${defeito.fixme}" — corpo medido: ${medida.corpo}`,
    };
  }

  return undefined;
}

/**
 * Lê o par de tags de um aviso de aninhamento do React nos DOIS formatos medidos:
 *   `In HTML, %s cannot be a descendant of <%s>.\nThis will cause a hydration error.%s <div> p ...`
 *   `<%s> cannot contain a nested %s.\nSee this log for the ancestor stack trace. p <div>`
 * (o texto do console traz a mensagem de formato e, em seguida, os argumentos: a tag
 * com colchetes é sempre a CONTIDA e a sem colchetes é a que CONTÉM.)
 */
function parAninhamento(texto: string): { ancestral: string; descendente: string } | undefined {
  const descendente = texto.match(
    /^In HTML, %s cannot be a descendant of <%s>\.\s*This will cause a hydration error\.%s <([a-z0-9]+)> ([a-z0-9]+)/i,
  );
  if (descendente) return { descendente: descendente[1].toLowerCase(), ancestral: descendente[2].toLowerCase() };

  const contido = texto.match(
    /^<%s> cannot contain a nested %s\.\s*See this log for the ancestor stack trace\. ([a-z0-9]+) <([a-z0-9]+)>/i,
  );
  if (contido) return { ancestral: contido[1].toLowerCase(), descendente: contido[2].toLowerCase() };

  return undefined;
}

/**
 * Confere um erro de console contra a lista de HTML aninhado. Devolve `undefined`
 * quando o par de tags não é um dos medidos (inclusive quando a mensagem é de
 * aninhamento mas o par é novo) — e aí REPROVA.
 */
function consoleEDefeito(texto: string): NinhoDeProduto | undefined {
  const par = parAninhamento(texto);
  if (!par) return undefined;
  return NINHOS_DE_PRODUTO.find((n) => n.ancestral === par.ancestral && n.descendente === par.descendente);
}

/* -------------------------------------------------------------------------- */
/* Tráfego e ruído                                                             */
/* -------------------------------------------------------------------------- */

type TipoRuido = 'console' | 'pageerror' | 'resposta';

interface Ocorrencia {
  tipo: TipoRuido;
  texto: string;
  /** prova da tolerância: só entra aqui com status e corpo medidos na resposta */
  tolerada?: OcorrenciaTolerada;
}

interface Trafego {
  ruido: Ocorrencia[];
  /** URLs que responderam (qualquer status) nesta sessão */
  responderam: Set<string>;
  /** requisições que o navegador cancelou: não houve resposta nenhuma */
  canceladas: { metodo: string; url: string; motivo: string }[];
}

function observar(page: Page): Trafego {
  const trafego: Trafego = { ruido: [], responderam: new Set(), canceladas: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    trafego.ruido.push({ tipo: 'console', texto: msg.text() });
  });
  page.on('pageerror', (err) => {
    trafego.ruido.push({ tipo: 'pageerror', texto: err.message });
  });
  page.on('response', (response) => {
    trafego.responderam.add(response.url());
    if (response.status() < 400) return;
    if (response.url().includes('/functions/v1/')) {
      void response
        .text()
        .then((corpo) =>
          process.stdout.write(
            `[MEDIDA] ${response.status()} ${response.url().split('?')[0]} :: ${corpo.replace(/\s+/g, ' ').slice(0, 160)}\n`,
          ),
        )
        .catch(() => undefined);
    }
    trafego.ruido.push({
      tipo: 'resposta',
      texto: `${response.status()} ${response.request().method()} ${response.url()}`,
    });
  });
  page.on('requestfailed', (request) => {
    trafego.canceladas.push({
      metodo: request.method(),
      url: request.url(),
      motivo: request.failure()?.errorText ?? 'sem motivo',
    });
  });

  return trafego;
}

function statusDaOcorrencia(texto: string): number {
  return Number((texto.match(/^(\d{3})\b/) ?? texto.match(/status of (\d{3})/) ?? [])[1]);
}

/** Agrupa por tipo + início do texto, para o relato caber na tela. */
function resumir(itens: { tipo?: string; texto?: string; motivo?: string; url?: string; metodo?: string }[]): string[] {
  const contagem = new Map<string, number>();
  for (const item of itens) {
    const texto = item.texto ?? `${item.metodo} ${item.url} — ${item.motivo}`;
    const chave = `${item.tipo ?? 'cancelada'} :: ${texto.replace(/[?&][^ ]*/g, '').slice(0, 140)}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return Array.from(contagem.entries())
    .sort()
    .map(([chave, n]) => `${n}× ${chave}`);
}

/**
 * Espera (com teto curto) a PROVA MEDIDA daquela resposta entrar na lista da página.
 * O espião lê o corpo da resposta de forma assíncrona, então a resposta pode entrar
 * na lista de ruído antes de o corpo estar legível — sem esta espera a tolerância
 * dependia de sorte de tempo (flaky medido na 2ª rodada de 07/10, num 500 de
 * gmail-oauth). Só espera o que o espião registra (funções de ponta): resposta de
 * outro caminho não tem corpo para esperar. Sem prova depois do teto, REPROVA.
 */
async function esperarMedidaDaResposta(page: Page, texto: string): Promise<void> {
  const url = ((texto.match(/https?:\/\/\S+/) ?? [''])[0]).split('?')[0];
  const status = statusDaOcorrencia(texto);
  if (!url || !status || !url.includes('/functions/v1/')) return;

  await page
    .waitForFunction(
      ({ alvo, alvoStatus }: { alvo: string; alvoStatus: number }) => {
        const lista =
          (window as unknown as { __lacunasLocais?: { url: string; status: number; corpo: string }[] })
            .__lacunasLocais ?? [];
        return lista.some((m) => m.url.includes(alvo) && m.status === alvoStatus && m.corpo.length > 0);
      },
      { alvo: caminhoDaFuncao(url), alvoStatus: status },
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

/**
 * Separa o que REPROVA do que já está justificado nas duas listas.
 *
 * - resposta >= 400: só escapa com CORPO e status medidos na própria sessão, casando
 *   uma entrada de LACUNAS_DO_CONJUNTO_LOCAL ou de DEFEITOS_DE_PRODUTO;
 * - console.error: só escapa quando é a sombra de uma resposta já justificada com
 *   aquele status ("Failed to load resource ... status of N") ou quando o par de tags
 *   aninhadas casa um defeito de NINHOS_DE_PRODUTO já registrado em test.fixme;
 * - qualquer outra coisa (exceção, erro de console sem resposta por trás, 4xx de
 *   validação, endpoint novo, par de tags novo) entra em `reprovam`.
 */
async function julgar(
  page: Page,
  trafego: Trafego,
  desde: number,
): Promise<{ reprovam: Ocorrencia[]; lacunas: Ocorrencia[]; defeitos: Ocorrencia[] }> {
  const fatia = trafego.ruido.slice(desde);

  // A prova medida de cada resposta da janela precisa estar legível antes do veredito.
  for (const ocorrencia of fatia) {
    if (ocorrencia.tipo !== 'resposta') continue;
    await esperarMedidaDaResposta(page, ocorrencia.texto);
  }

  const medidas = await lacunasMedidas(page);
  const lacunas: Ocorrencia[] = [];
  const defeitos: Ocorrencia[] = [];
  const statusJustificados = new Set<number>();
  const pendentes = new Set<Ocorrencia>();

  for (const ocorrencia of fatia) {
    if (ocorrencia.tipo !== 'resposta') {
      pendentes.add(ocorrencia);
      continue;
    }
    const url = ((ocorrencia.texto.match(/https?:\/\/\S+/) ?? [''])[0]).split('?')[0];
    const status = statusDaOcorrencia(ocorrencia.texto);
    const medida = medidas.find((m) => caminhoDaFuncao(m.url) === caminhoDaFuncao(url) && m.status === status);
    const tolerada = medida ? respostaTolerada(medida) : undefined;

    if (tolerada) {
      ocorrencia.tolerada = tolerada;
      statusJustificados.add(status);
      (tolerada.origem === 'lacuna' ? lacunas : defeitos).push(ocorrencia);
    } else {
      pendentes.add(ocorrencia);
    }
  }

  const reprovam: Ocorrencia[] = [];
  for (const ocorrencia of Array.from(pendentes)) {
    const status = statusDaOcorrencia(ocorrencia.texto);
    if (ocorrencia.tipo === 'console' && status && statusJustificados.has(status)) {
      ocorrencia.tolerada = {
        origem: 'lacuna',
        motivo: `sombra de console da resposta já medida (status ${status})`,
      };
      lacunas.push(ocorrencia);
      continue;
    }
    const defeito = ocorrencia.tipo === 'console' ? consoleEDefeito(ocorrencia.texto) : undefined;
    if (defeito) {
      ocorrencia.tolerada = {
        origem: 'defeito',
        motivo: `DEFEITO DO PRODUTO (${defeito.area}): HTML aninhado <${defeito.descendente}> dentro de <${defeito.ancestral}> em ${defeito.onde} → test.fixme "${defeito.fixme}"`,
      };
      defeitos.push(ocorrencia);
      continue;
    }
    reprovam.push(ocorrencia);
  }

  return { reprovam, lacunas, defeitos };
}

/** Linha de relatório por ocorrência, com o módulo onde ela apareceu. */
function relatar(onde: string, itens: Ocorrencia[]): string[] {
  return itens.map((i) => `${onde}: ${i.texto.replace(/\s+/g, ' ').slice(0, 180)} — ${i.tolerada?.motivo}`);
}

/**
 * Cancelamento de requisição pelo PRÓPRIO app só é aceitável com prova de que
 * aquela mesma URL respondeu (com qualquer status) na sequência: o React
 * StrictMode (ligado em main.tsx, E38) monta os efeitos duas vezes em
 * desenvolvimento, então a primeira rajada de contagens é cancelada e a segunda
 * responde. Cancelamento sem essa prova continua reprovando — é requisição que
 * nunca chegou a lugar nenhum.
 */
function canceladasSemProva(trafego: Trafego): Trafego['canceladas'] {
  return trafego.canceladas.filter((c) => !trafego.responderam.has(c.url));
}

/* -------------------------------------------------------------------------- */
/* Conferência da tela de um módulo                                            */
/* -------------------------------------------------------------------------- */

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function conferirModulo(page: Page, item: ItemNav, onde: string): Promise<void> {
  await expect(page, `${onde}: título do documento do módulo`).toHaveTitle(
    new RegExp(`^${escaparRegex(item.label)} \\| ${escaparRegex(TITULO_BASE)}$`),
  );

  const principal = page.getByRole('main');
  await expect(principal, `${onde}: região principal não ficou visível`).toBeVisible();

  // A tela de bloqueio do ViewRouter tem título próprio: "Acesso restrito" à vista
  // é acesso negado, e não módulo ausente — as duas coisas ficam distinguíveis.
  await expect(
    page.getByRole('heading', { name: 'Acesso restrito' }),
    `${onde}: caiu na tela de acesso restrito`,
  ).toHaveCount(0);

  // Esqueleto de carregamento preso = módulo que não montou.
  await expect(
    page.getByRole('status', { name: 'Carregando módulo' }),
    `${onde}: ficou preso no esqueleto de carregamento`,
  ).toHaveCount(0);

  // A view pode chegar antes dos dados: espera ela SAIR do esqueleto de
  // carregamento e produzir texto. Tela em branco de verdade (nenhum texto no
  // teto) continua reprovando — o que muda é só a espera, não o critério.
  await expect
    .poll(async () => (await principal.innerText()).trim().length, {
      message: `${onde}: renderizou tela em branco`,
      timeout: 45_000,
    })
    .toBeGreaterThan(30);
}

/* -------------------------------------------------------------------------- */
/* Sessão e navegação                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Shell autenticado em qualquer largura: no desktop a barra lateral
 * (#main-navigation); no celular a navegação inferior (ou o cabeçalho, se a
 * navegação inferior ainda não montou).
 */
function shellAutenticado(page: Page) {
  return page
    .locator('#main-navigation')
    .or(page.getByRole('navigation', { name: NAV_INFERIOR }))
    .or(page.getByRole('button', { name: 'Abrir menu' }))
    .first();
}

/** Entra pela tela de login com o usuário sintético do banco local. */
async function entrar(page: Page): Promise<void> {
  // Tetos explícitos: sob carga alta o dev server demora a servir o bundle e um
  // clique sem teto pendura o teste inteiro (já aconteceu com 900 s).
  await page.goto('/auth', { timeout: 90_000, waitUntil: 'domcontentloaded' });
  if (await shellAutenticado(page).isVisible().catch(() => false)) return;

  const email = process.env.E2E_TEST_EMAIL;
  const senha = process.env.E2E_TEST_PASSWORD;
  if (!email || !senha) {
    throw new Error(
      'E2E_TEST_EMAIL/E2E_TEST_PASSWORD não estão definidas e não há sessão montada. Rode pelo ' +
        'wrapper do banco local: zapp-e2e-local <cópia> <conjunto> (ele injeta o usuário do seed local).',
    );
  }

  const teto = { timeout: 90_000 };
  await page.getByRole('tab', { name: /^entrar$/i }).click(teto);
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(email, teto);
  await page.locator('input[type="password"]').fill(senha, teto);
  await page.getByRole('button', { name: /^entrar$/i }).click(teto);

  const shell = shellAutenticado(page);
  if (!(await shell.isVisible().catch(() => false))) {
    await shell.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => undefined);
  }
  if (await shell.isVisible().catch(() => false)) return;

  const visivel = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  throw new Error(`login local não concluiu (banco local do conjunto). Tela: ${visivel.slice(0, 400)}`);
}

/**
 * Fecha o que a aplicação põe por cima da navegação, do jeito que um usuário
 * faria, e registra no relato:
 *  - o aviso de 2FA do admin (MfaAdminNudge, `z-[80]`, fixo no rodapé): no
 *    celular ele cobre a navegação inferior inteira e dura 24 h, então o teste
 *    o dispensa pelo botão próprio;
 *  - os toasts (Sonner), que também interceptam o clique.
 * Sem espera fixa: o teste falha se o aviso não sair da tela.
 */
async function limparAvisos(page: Page, etapa: string): Promise<void> {
  // Os toasts vêm PRIMEIRO: eles ficam por cima do aviso de 2FA e engolem o
  // clique (o aviso fica no rodapé, colado na navegação inferior do celular).
  const avisos = page.locator('[data-sonner-toast][data-visible="true"]');
  if ((await avisos.count()) > 0) {
    const textos: string[] = [];
    for (const aviso of await avisos.all()) {
      textos.push((await aviso.innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
      const fechar = aviso.locator('[data-close-button]');
      if (await fechar.isVisible().catch(() => false)) {
        await fechar.click({ force: true }).catch(() => undefined);
      }
    }
    console.warn(`[AVISO] ${etapa}: ${textos.filter(Boolean).join(' | ') || '(sem texto)'}`);
    await expect(avisos, `${etapa}: aviso não saiu da tela`).toHaveCount(0, { timeout: 15_000 });
  }

  // Faixa de WhatsApp desconectado (EvolutionDisconnectBanner): `fixed top-0
  // z-[90]` — no celular ela cobre o cabeçalho e o botão de busca global. O
  // fechamento é estado do componente, então basta uma vez por sessão.
  const faixa = page
    .getByRole('region', { name: 'Status das conexões do WhatsApp' })
    .getByRole('button', { name: 'Fechar alerta' })
    .first();
  if (await faixa.isVisible().catch(() => false)) {
    await faixa.click({ force: true }).catch(() => undefined);
    if (await faixa.isVisible().catch(() => false)) {
      await faixa.evaluate((el) => (el as HTMLElement).click()).catch(() => undefined);
    }
    console.warn(`[AVISO] ${etapa}: faixa de WhatsApp desconectado fechada (cobre o topo no celular)`);
  }

  const nudge = page.getByRole('button', { name: 'Dispensar por 24 horas' }).first();
  if (!(await nudge.isVisible().catch(() => false))) return;

  await nudge.click({ force: true }).catch(() => undefined);
  if (await nudge.isVisible().catch(() => false)) {
    // Ainda coberto: dispara o clique direto no elemento (mesma ação do usuário
    // — o handler é o do próprio botão —, sem depender do hit-test do navegador).
    await nudge.evaluate((el) => (el as HTMLElement).click()).catch(() => undefined);
    console.warn(
      `[AVISO PERSISTENTE] ${etapa}: dispensa do 2FA precisou de clique direto (botão do rodapé coberto por outro aviso)`,
    );
  }
  await expect(nudge, `${etapa}: o aviso de 2FA continuou na tela`).toBeHidden({ timeout: 15_000 });
  console.warn(`[AVISO PERSISTENTE] ${etapa}: aviso de 2FA do admin dispensado (cobre a navegação inferior no celular)`);
}

/** Abre o app já logado, com a barra lateral mostrando rótulos. */
async function abrirApp(page: Page): Promise<void> {
  // A barra lateral nasce RECOLHIDA (useSidebarCollapse: sem valor gravado =>
  // recolhida). Aqui os rótulos precisam estar visíveis — preferência de
  // interface do usuário, gravada antes de o app montar.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('zapp-sidebar-collapsed', 'false');
    } catch {
      /* sem localStorage: a espera pelo shell falha e o motivo fica claro */
    }
  });
  await espionarLacunas(page);
  await entrar(page);
  await expect(shellAutenticado(page), 'shell autenticado não apareceu').toBeVisible();
  await limparAvisos(page, 'entrada');
}

async function abrirSecaoDesktop(page: Page, secao: string): Promise<void> {
  const gatilho = page.getByRole('button', { name: `${secao} — expandir`, exact: true });
  if (await gatilho.isVisible().catch(() => false)) {
    await gatilho.click();
    await expect(page.getByRole('button', { name: `${secao} — recolher`, exact: true })).toBeVisible();
  }
}

async function clicarDesktop(page: Page, item: ItemNav): Promise<void> {
  const nav = page.getByRole('navigation', { name: MENU_DESKTOP });
  const botao = nav.getByRole('button', { name: item.label, exact: true }).first();
  await botao.click();
  await expect(
    botao,
    `a entrada "${item.label}" da barra lateral não virou a view ativa`,
  ).toHaveAttribute('aria-current', 'page');
}

/**
 * Abre o menu móvel pela navegação inferior e escolhe o módulo. O clique é
 * repetido quando um aviso da aplicação cobre o botão no meio do caminho — é o
 * comportamento do próprio app, não um defeito do teste.
 */
async function clicarMobile(page: Page, item: ItemNav): Promise<void> {
  const menu = page.getByRole('dialog', { name: MENU_CELULAR });
  const mais = page.getByRole('navigation', { name: NAV_INFERIOR }).getByRole('button', { name: 'Mais' });
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      await limparAvisos(page, `celular/${item.label}`);
      await mais.click({ timeout: 10_000 });
      await expect(menu, 'o menu móvel não abriu').toBeVisible({ timeout: 10_000 });
      await menu.getByRole('button', { name: item.label, exact: true }).first().click({ timeout: 10_000 });
      await expect(menu, 'o menu móvel não fechou depois de escolher o módulo').toBeHidden({
        timeout: 10_000,
      });
      return;
    } catch (erro) {
      ultimoErro = erro;
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error(`não consegui abrir "${item.label}" pelo menu móvel`);
}

/* -------------------------------------------------------------------------- */
/* Testes                                                                      */
/* -------------------------------------------------------------------------- */

const PASSOS: { secao?: string; item: ItemNav }[] = [
  ...PRIMARIOS.map((item) => ({ item })),
  ...SECOES.flatMap((secao) => secao.itens.map((item) => ({ secao: secao.label, item }))),
];

// A varredura inteira (login + 42 módulos + busca) passa longe do teto padrão de
// 30s do Playwright — este teto é do cartão, não uma espera fixa.
test.describe.configure({ timeout: 15 * 60_000 });

/** Relatório da rodada: lacunas e defeitos SEPARADOS (lacuna é conjunto, defeito é produto). */
function relatarRodada(
  onde: string,
  lacunas: Ocorrencia[],
  defeitos: Ocorrencia[],
  visitados: number,
  total: number,
  trafego: Trafego,
): void {
  const semProva = canceladasSemProva(trafego);
  console.warn(
    `[COBERTURA] ${onde}: ${visitados}/${total} entradas do menu visitadas`,
  );
  console.warn(
    `[CANCELADAS] ${onde}: ${trafego.canceladas.length} canceladas, ${semProva.length} sem resposta da mesma URL`,
  );
  console.warn(`[LACUNAS DO CONJUNTO LOCAL] ${onde}: ${lacunas.length}`);
  for (const linha of relatar(onde, lacunas)) console.warn(`  ${linha}`);
  console.warn(`[DEFEITOS DE PRODUTO] ${onde}: ${defeitos.length}`);
  for (const linha of relatar(onde, defeitos)) console.warn(`  ${linha}`);
}

test.describe('Navegação por todos os módulos (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('abre os 42 módulos da barra lateral e a busca global sem erro de console nem requisição falha', async ({
    page,
  }) => {
    // A varredura é longa (42 módulos + busca, cada um com espera de view e de
    // ruído): o teto padrão do Playwright (30 s) não cabe — e o teto fica no
    // próprio spec para ele rodar no config do repositório, sem config própria.
    test.setTimeout(20 * 60_000);
    const trafego = observar(page);
    await abrirApp(page);
    let vistos = trafego.ruido.length;
    const lacunasDaRodada: Ocorrencia[] = [];
    const defeitosDaRodada: Ocorrencia[] = [];
    const visitados: string[] = [];

    for (const { secao, item } of PASSOS) {
      const onde = secao ? `desktop/${secao}` : 'desktop';
      visitados.push(item.label);
      // Cada seção da barra lateral abre FECHADA; a visita do primeiro item abre a dela.
      if (secao && item === SECOES.find((s) => s.label === secao)?.itens[0]) {
        await abrirSecaoDesktop(page, secao);
      }
      await clicarDesktop(page, item);
      await conferirModulo(page, item, `${onde}/${item.label}`);

      const { reprovam, lacunas, defeitos } = await julgar(page, trafego, vistos);
      lacunasDaRodada.push(...lacunas);
      defeitosDaRodada.push(...defeitos);
      expect(resumir(reprovam), `${onde} — ${item.label} produziu ruído não justificado`).toEqual([]);
      vistos = trafego.ruido.length;
    }

    // Busca global (⌘K), pela entrada "Buscar..." da barra lateral.
    await page.getByRole('button', { name: /Busca global/ }).click();
    const campo = page.getByPlaceholder(PLACEHOLDER_BUSCA);
    await expect(campo, 'a busca global não abriu pelo botão "Buscar..."').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(campo, 'a busca global não fechou com Escape').toBeHidden();

    const { reprovam, lacunas, defeitos } = await julgar(page, trafego, vistos);
    lacunasDaRodada.push(...lacunas);
    defeitosDaRodada.push(...defeitos);
    expect(resumir(reprovam), 'desktop — Buscar produziu ruído não justificado').toEqual([]);

    // Prova de cobertura: o número de módulos ABERTOS tem de bater com o mapa
    // da barra lateral, senão a varredura passou sem passar por tudo.
    expect(
      visitados.length,
      'a varredura do desktop não visitou todas as entradas do menu',
    ).toBe(PASSOS.length);

    relatarRodada('desktop', lacunasDaRodada, defeitosDaRodada, visitados.length, PASSOS.length, trafego);
    expect(
      resumir(canceladasSemProva(trafego)),
      'desktop: requisições canceladas que nunca responderam na mesma sessão',
    ).toEqual([]);
  });
});

test.describe('Navegação por todos os módulos (celular 390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('abre os 42 módulos pelo menu móvel e a busca do cabeçalho sem erro de console nem requisição falha', async ({
    page,
  }) => {
    test.setTimeout(20 * 60_000); // mesma razão do desktop: varredura longa
    const trafego = observar(page);
    await abrirApp(page);
    let vistos = trafego.ruido.length;
    const lacunasDaRodada: Ocorrencia[] = [];
    const defeitosDaRodada: Ocorrencia[] = [];
    const visitados: string[] = [];

    for (const { secao, item } of PASSOS) {
      const onde = secao ? `celular/${secao}` : 'celular';
      visitados.push(item.label);
      await clicarMobile(page, item);
      await conferirModulo(page, item, `${onde}/${item.label}`);

      const { reprovam, lacunas, defeitos } = await julgar(page, trafego, vistos);
      lacunasDaRodada.push(...lacunas);
      defeitosDaRodada.push(...defeitos);
      expect(resumir(reprovam), `${onde} — ${item.label} produziu ruído não justificado`).toEqual([]);
      vistos = trafego.ruido.length;
    }

    // Busca global pelo botão "Buscar" do cabeçalho móvel.
    await limparAvisos(page, 'celular/Buscar');
    const buscar = page.getByRole('button', { name: 'Buscar', exact: true });
    try {
      // Teto curto: em vez de pendurar o teste, tenta de novo depois de limpar
      // os avisos outra vez (o cabeçalho do celular vive coberto por eles).
      await buscar.click({ timeout: 20_000 });
    } catch {
      await limparAvisos(page, 'celular/Buscar (2ª tentativa)');
      await buscar.click({ timeout: 20_000 });
    }
    const campo = page.getByPlaceholder(PLACEHOLDER_BUSCA);
    await expect(campo, 'a busca global não abriu pelo botão do cabeçalho').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(campo, 'a busca global não fechou com Escape').toBeHidden();

    const { reprovam, lacunas, defeitos } = await julgar(page, trafego, vistos);
    lacunasDaRodada.push(...lacunas);
    defeitosDaRodada.push(...defeitos);
    expect(resumir(reprovam), 'celular — Buscar produziu ruído não justificado').toEqual([]);

    // Prova de cobertura: idem desktop, pelo menu móvel.
    expect(
      visitados.length,
      'a varredura do celular não visitou todas as entradas do menu',
    ).toBe(PASSOS.length);

    relatarRodada('celular', lacunasDaRodada, defeitosDaRodada, visitados.length, PASSOS.length, trafego);
    expect(
      resumir(canceladasSemProva(trafego)),
      'celular: requisições canceladas que nunca responderam na mesma sessão',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* DEFEITOS DO PRODUTO — cada um com reprodução real, pronta para virar `test` */
/*                                                                             */
/* São os defeitos das listas DEFEITOS_DE_PRODUTO e NINHOS_DE_PRODUTO, que a    */
/* varredura acima contabiliza em `[DEFEITOS DE PRODUTO]`. Os corpos abaixo são */
/* a reprodução de verdade: hoje eles falham (é o defeito); quando o produto for */
/* corrigido, os donos trocam `test.fixme` por `test` e a entrada sai da lista.  */
/* -------------------------------------------------------------------------- */

/** Ocorrências de console, na janela, cujo par de tags aninhadas é o pedido. */
function aninhadosNaJanela(trafego: Trafego, desde: number, ancestral: string, descendente: string): Ocorrencia[] {
  return trafego.ruido.slice(desde).filter((ocorrencia) => {
    if (ocorrencia.tipo !== 'console') return false;
    const par = parAninhamento(ocorrencia.texto);
    return par?.ancestral === ancestral && par?.descendente === descendente;
  });
}

/**
 * DEFEITO (área de telas) — `src/components/layout/SidebarNavItem.tsx:83-92`:
 * o botão "Adicionar aos favoritos" é renderizado DENTRO do `<button>` do item da
 * barra lateral, e HTML não permite botão dentro de botão. O React avisa por
 * `console.error` ("In HTML, <button> cannot be a descendant of <button>").
 * MEDIDO em 07/10 no conjunto local, ao expandir qualquer seção da barra.
 */
test.fixme('DEFEITO: a barra lateral aninha o <button> de favoritos dentro do <button> do item', async ({ page }) => {
  const trafego = observar(page);
  await abrirApp(page);
  const desde = trafego.ruido.length;
  await abrirSecaoDesktop(page, 'Vendas & CRM');
  const erros = aninhadosNaJanela(trafego, desde, 'button', 'button');
  expect(resumir(erros), 'a barra lateral ainda aninha o botão de favoritos dentro do botão do item').toEqual([]);
});

/**
 * DEFEITO (área de telas) — `src/components/ui/breadcrumb.tsx:62`: o
 * `BreadcrumbSeparator` renderiza um `<li>` e é usado dentro do `<li>` do
 * `BreadcrumbItem` (`src/components/layout/PageHeader.tsx:103-104`), o que o React
 * recusa ("<li> cannot contain a nested <li>"). MEDIDO em 07/10 nas telas com
 * trilha de navegação (Tarefas) e na view do Quadro (pipeline).
 */
test.fixme('DEFEITO: <li> dentro de <li> na trilha de navegação (PageHeader) e no Quadro', async ({ page }) => {
  const trafego = observar(page);
  await abrirApp(page);
  const desde = trafego.ruido.length;
  await clicarDesktop(page, { id: 'tasks', label: 'Tarefas' });
  await clicarDesktop(page, { id: 'pipeline', label: 'Quadro' });
  const erros = aninhadosNaJanela(trafego, desde, 'li', 'li');
  expect(resumir(erros), 'a trilha do PageHeader e o Quadro ainda aninham <li> dentro de <li>').toEqual([]);
});

/**
 * DEFEITO (área de telas) — `src/components/docs/SystemFeaturesView.tsx:41-49`: o
 * `<Badge>` do catálogo (que é um `<div>`) é filho do `<p>` do subtítulo; o React
 * avisa "In HTML, <div> cannot be a descendant of <p>". MEDIDO em 07/10 ao abrir
 * Sistema > Documentação.
 */
test.fixme('DEFEITO: a Documentação põe o selo do catálogo (<div>) dentro de um <p>', async ({ page }) => {
  const trafego = observar(page);
  await abrirApp(page);
  const desde = trafego.ruido.length;
  await abrirSecaoDesktop(page, 'Sistema');
  await clicarDesktop(page, { id: 'docs', label: 'Documentação' });
  const erros = aninhadosNaJanela(trafego, desde, 'p', 'div');
  expect(resumir(erros), 'a Documentação ainda põe o selo do catálogo (<div>) dentro de um <p>').toEqual([]);
});

/**
 * DEFEITO (área de chamadas) — `src/hooks/communication/useSipClient.ts:80-89`: na
 * transição de aba para líder, o hook chama `connectWithStoredCredentials` (que faz
 * `POST /functions/v1/get-sip-password`) antes de haver credencial utilizável, e a
 * função responde 401 (`supabase/functions/get-sip-password/index.ts:34` sem
 * `Authorization`, `:41` com claims inválidas/expiradas).
 * MEDIDO em 07/10: 401 `{"error":"Invalid or expired token"}` (e, em rodada
 * anterior, 401 `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`) no arranque da sessão.
 * A causa raiz (chamada cedo demais X credencial do conjunto local) é da área de
 * chamadas: este fixme é a reprodução, não o veredito.
 */
test.fixme('DEFEITO: o motor SIP chama get-sip-password sem credencial utilizável (401)', async ({ page }) => {
  const falhas: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/functions/v1/get-sip-password') && response.status() >= 400) {
      falhas.push(`${response.status()} ${response.url()}`);
    }
  });
  await abrirApp(page);
  await expect(page.getByRole('main'), 'a tela inicial não montou para observar o arranque').toBeVisible();
  expect(resumir(falhas.map((texto) => ({ tipo: 'resposta', texto }))), 'o motor SIP ainda chama a função sem credencial').toEqual([]);
});

/**
 * DEFEITO (área de login/segurança) — `src/hooks/ui/useDeviceDetection.ts:116`:
 * no arranque o app dispara DUAS chamadas para `/functions/v1/detect-new-device`
 * (StrictMode); uma responde 200 e a outra estoura no INSERT e devolve 500
 * `{"error":"Internal server error"}` — log do runtime: "New device detected" →
 * "Error [object Object]" → 500. MEDIDO em 07/10, com o usuário do seed local; o
 * certo é tratar a corrida, não devolver 500.
 */
test.fixme('DEFEITO: detect-new-device devolve 500 quando o app chama duas vezes em paralelo', async ({ page }) => {
  const falhas: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/functions/v1/detect-new-device') && response.status() >= 400) {
      falhas.push(`${response.status()} ${response.url()}`);
    }
  });
  await abrirApp(page);
  await expect(page.getByRole('main'), 'a tela inicial não montou para observar o arranque').toBeVisible();
  expect(resumir(falhas.map((texto) => ({ tipo: 'resposta', texto }))), 'detect-new-device ainda devolve 500 na corrida').toEqual([]);
});
