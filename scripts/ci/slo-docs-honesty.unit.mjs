#!/usr/bin/env node
// SL-102 (inventário S2-4, auditoria de 2026-09-05) — honestidade do runbook de SLOs.
//
// Histórico: `docs/runbooks/slo.md` abre dizendo "Nada aqui é aspiracional sem dizer de onde
// sai o número", mas a tabela de SLOs citava como fonte três coisas que NÃO existem no
// repositório — o monitor externo de uptime (o gap do S2-4), o cron do health check e a view
// `slo_inbound_latency_daily` — e a linha "Front disponível" prometia "uptime check externo
// ... a cada 1 min" sem que nenhum artefato do repo checasse a URL. Fonte citada que não
// existe transforma alvo em medição inventada: o próximo leitor (ou o plantão) acha que o SLO
// é medido e não investiga a queda. O mesmo vale para referência de arquivo envelhecida
// (`useDiagnosticsData.ts:151`, arquivo movido) e para a afirmação de `x-request-id`
// "ponta a ponta" quando só a borda trata o header (o front não envia).
//
// Invariantes travados aqui — o teste é RED antes da correção e GREEN depois:
//   I1. Toda linha da tabela de SLOs declara a coluna `Fonte hoje` com REAL, PARCIAL ou
//       PENDENTE; nada declara fonte sem dizer se ela existe.
//   I2. Linha do runbook não cita caminho do repositório que não existe.
//   I3. Linha que cita monitor/uptime externo só é REAL/PARCIAL se existir artefato de
//       monitoramento no repositório; linha que cita `slo_inbound_latency_daily` só é
//       REAL/PARCIAL se a view existir no retrato de produção (schema-manifest.json).
//   I4. O SLO da edge `evolution-webhook` traz o alvo NA PRÓPRIA LINHA da tabela: a linha de
//       latência tem `p95 < 500 ms` e a linha de erro/aceitação tem o percentual do alvo único
//       (erro ≤ 0,5 % ⇔ aceitação ≥ 99,5 %). Termo solto em OUTRA linha da tabela não conta —
//       foi assim que o alvo de latência e o de erro acabaram em linhas vizinhas na entrega
//       recusada, deixando o SLO citado sem alvo na linha que o leitor consulta.
//   I5. Toda referência `arquivo.ext:linha` resolve: o arquivo existe e tem aquela linha.
//   I6. A afirmação sobre `x-request-id` bate com o código: o documento não pode dizer que o
//       cliente envia o header enquanto `src/` não o tem (e vice-versa), e todo elo marcado
//       como "sim" tem de citar arquivo que realmente trata o header.
//
// Os dois lados de cada regra são provados por fixtures em string (o analisador é puro, com
// resolvedores injetados); no fim o documento real é analisado com os resolvedores do repo.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = 'docs/runbooks/slo.md';

// --- Normalização (mesmo critério de revisao-fontes-doc.unit.mjs, mas preservando `_`: aqui
// ele é parte de nome de tabela/view — `slo_inbound_latency_daily`). Sem acento, sem marcação
// Markdown e com a prosa reflowada numa linha só. NÃO mexe em caixa.
const normalizar = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Alvo do SLO da edge `evolution-webhook`, exigido NA LINHA da tabela (regra I4). O alvo de erro
// é único: `erro ≤ 0,5 %` e `aceitação ≥ 99,5 %` são a mesma medida vista dos dois lados — manter
// as duas leituras com números diferentes foi o defeito apontado na recusa do SL-102.
export const ALVO_LATENCIA_EDGE = 'p95 < 500 ms';
export const ALVO_ERRO_EDGE = '0,5 %';

const CLASSIFICADORES = ['REAL', 'PARCIAL', 'PENDENTE'];
// Negativa do "Estado" de um elo: `não`, `nunca`, `nenhuma` (sem acento, já normalizado).
const NEGATIVO = /^(nao|nunca|nenhum)/;

// --- Tabela Markdown: linhas viram `{ celulas, bruto }` (célula normalizada para comparar,
// linha crua para extrair caminho em `crase`).
export function blocoTabela(linhas) {
  const tabela = [];
  let achou = false;
  for (const linha of linhas) {
    const ehLinha = /^\s*\|/.test(linha);
    if (!achou) {
      if (ehLinha) achou = true;
      else continue; // prosa entre o título e a tabela
    }
    if (!ehLinha) break;
    tabela.push({
      bruto: linha,
      celulas: linha
        .split('|')
        .slice(1, -1)
        .map((c) => normalizar(c)),
    });
  }
  if (!achou) return null;
  const separador = (c) => /^:?-{2,}:?$/.test(c);
  return tabela.filter(({ celulas }) => !celulas.every(separador));
}

export function tabelaDoTitulo(markdown, titulo) {
  const linhas = String(markdown).split('\n');
  const inicio = linhas.findIndex((l) => new RegExp('^##\\s+' + titulo, 'i').test(l));
  if (inicio === -1) return null;
  return blocoTabela(linhas.slice(inicio + 1));
}

export function secoes(texto) {
  const mapa = new Map();
  let atual = null;
  for (const linha of String(texto).split('\n')) {
    const m = linha.match(/^##\s+(.+)$/);
    if (m) {
      atual = normalizar(m[1]).toLowerCase();
      mapa.set(atual, []);
      continue;
    }
    if (atual) mapa.get(atual).push(linha);
  }
  return mapa;
}

// --- Tokens de caminho em `crase` (sem `:`, para não confundir URL nem `arquivo:linha`) ---
const CAMINHO_COM_EXTENSAO = /^[\w][\w./-]*\.(ya?ml|tsx?|mjs|cjs|jsx?|json|md|sql|sh)$/;
const FUNCAO_EDGE = /^supabase\/functions\/[a-z0-9-]+$/;

export function caminhosCitados(texto) {
  const achados = new Set();
  for (const m of String(texto).matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim();
    if (CAMINHO_COM_EXTENSAO.test(token) || FUNCAO_EDGE.test(token)) achados.add(token);
  }
  return [...achados];
}

export function referenciasComLinha(texto) {
  const achados = new Set();
  for (const m of String(texto).matchAll(/([\w./-]+\.(?:ts|tsx|mjs|js|json|md|ya?ml|sql)):(\d+)/g)) {
    achados.add(`${m[1]}:${m[2]}`);
  }
  return [...achados];
}

/**
 * Analisador puro. `amb` injeta os resolvedores:
 *   existeCaminho(token) -> boolean            caminho existe no repositório
 *   linhasDoArquivo(token) -> number           linhas do arquivo (0 se não existe)
 *   contemNoArquivo(token, agulha) -> boolean  arquivo do repo contém o texto
 *   existeView(nome) -> boolean                view existe no retrato de produção
 *   existeArtefatoMonitor() -> boolean         há workflow/script de monitor no repo
 *   temXRequestIdEmSrc() -> boolean            `src/` gera/envia x-request-id
 */
export function analisar(texto, amb) {
  const problemas = [];
  const doc = String(texto);

  // --- I1/I3: tabela de SLOs ---
  const tabela = tabelaDoTitulo(doc, 'SLOs propostos');
  if (!tabela) {
    problemas.push('I1: seção "SLOs propostos" sem tabela');
  } else {
    const cabecalho = tabela[0].celulas.map((c) => c.toLowerCase());
    if (!cabecalho.some((c) => c.includes('fonte hoje'))) {
      problemas.push('I1: a tabela de SLOs não declara a coluna "Fonte hoje"');
    }
    for (const { celulas } of tabela.slice(1)) {
      const bruto = celulas.join(' | ');
      const fonte = celulas[celulas.length - 1] || '';
      const m = fonte.match(/^([A-Z]+)\b/);
      if (!m || !CLASSIFICADORES.includes(m[1])) {
        problemas.push(`I1: linha sem classificação REAL/PARCIAL/PENDENTE — "${bruto.slice(0, 90)}"`);
        continue;
      }
      const classificacao = m[1];
      // I3a: monitor externo não pode ser dado como medido sem artefato de monitoramento.
      if (/\b(monitor|uptime)\b/i.test(bruto) && classificacao !== 'PENDENTE' && !amb.existeArtefatoMonitor()) {
        problemas.push(`I3: "${celulas[0]}" diz ${classificacao} para monitor/uptime sem artefato de monitoramento no repo`);
      }
      // I3b: view de latência só é fonte se existir em produção.
      if (bruto.includes('slo_inbound_latency_daily') && classificacao !== 'PENDENTE' && !amb.existeView('slo_inbound_latency_daily')) {
        problemas.push(`I3: "${celulas[0]}" diz ${classificacao} para a view slo_inbound_latency_daily, que não existe no retrato`);
      }
    }
  }

  // --- I2: caminhos citados resolvem ---
  for (const token of caminhosCitados(doc)) {
    if (!amb.existeCaminho(token)) problemas.push(`I2: caminho citado não existe — ${token}`);
  }

  // --- I4: o alvo tem de estar NA LINHA da edge `evolution-webhook` ---
  // A linha de latência carrega `p95 < 500 ms`; a linha de erro/aceitação carrega o percentual do
  // alvo único. Buscar os termos no texto da tabela inteira (regra anterior) aceitava alvo em
  // linha vizinha: quem abria a linha da edge via um SLO sem alvo.
  if (!tabela) {
    problemas.push('I4: seção "SLOs propostos" sem tabela — não há SLO da edge `evolution-webhook`');
  } else {
    const daEdge = tabela
      .slice(1)
      .filter(({ celulas }) => celulas.some((c) => c.toLowerCase().includes('evolution-webhook')));
    const linhaDe = (filtro) => daEdge.filter(({ celulas }) => filtro(celulas.join(' | ')));
    const latencia = linhaDe((t) => /laten/i.test(t));
    const erro = linhaDe((t) => /\berro\b/i.test(t));
    if (!latencia.length) problemas.push('I4: a tabela de SLOs não tem a linha de latência da edge `evolution-webhook`');
    for (const { bruto, celulas } of latencia) {
      if (!celulas.join(' | ').toLowerCase().includes(ALVO_LATENCIA_EDGE)) {
        problemas.push(
          `I4: a linha de latência da edge não traz o alvo "${ALVO_LATENCIA_EDGE}" — "${bruto.slice(0, 90)}"`,
        );
      }
    }
    if (!erro.length) problemas.push('I4: a tabela de SLOs não tem a linha de erro da edge `evolution-webhook`');
    for (const { bruto, celulas } of erro) {
      if (!celulas.join(' | ').toLowerCase().includes(ALVO_ERRO_EDGE)) {
        problemas.push(
          `I4: a linha de erro da edge não traz o alvo "${ALVO_ERRO_EDGE}" — "${bruto.slice(0, 90)}"`,
        );
      }
    }
  }

  // --- I5: referências arquivo:linha ---
  for (const ref of referenciasComLinha(doc)) {
    const [arquivo, linha] = ref.split(':');
    const total = amb.linhasDoArquivo(arquivo);
    if (!total) problemas.push(`I5: referência a arquivo inexistente — ${ref}`);
    else if (Number(linha) > total) problemas.push(`I5: referência além do fim do arquivo — ${ref} (tem ${total} linhas)`);
  }

  // --- I6: x-request-id ponta a ponta ---
  const secao = secoes(doc).get('x-request-id ponta a ponta');
  if (!secao) {
    problemas.push('I6: seção "x-request-id ponta a ponta" ausente');
  } else {
    const linhas = blocoTabela(secao);
    const corpo = linhas ? linhas.slice(1) : [];
    const cliente = corpo.find(({ celulas }) => /cliente envia/i.test(celulas[0] || ''));
    if (!cliente) {
      problemas.push('I6: a seção não diz se o cliente envia o x-request-id');
    } else {
      const estado = (cliente.celulas[1] || '').toLowerCase();
      const envioDeclarado = !NEGATIVO.test(estado);
      if (envioDeclarado !== amb.temXRequestIdEmSrc()) {
        problemas.push(
          `I6: o documento diz que o cliente ${envioDeclarado ? 'envia' : 'não envia'} o x-request-id,` +
            ` mas src/ ${amb.temXRequestIdEmSrc() ? 'tem' : 'não tem'} o header`,
        );
      }
      for (const { bruto, celulas } of corpo) {
        const marcado = !NEGATIVO.test((celulas[1] || '').toLowerCase());
        if (!marcado) continue;
        for (const token of caminhosCitados(bruto)) {
          if (!/\.(ts|tsx|mjs|js)$/.test(token)) continue;
          if (!amb.contemNoArquivo(token, 'x-request-id')) {
            problemas.push(`I6: "${celulas[0]}" diz sim, mas ${token} não trata x-request-id`);
          }
        }
      }
    }
  }

  return problemas;
}

// ---------------------------------------------------------------------------
// Resolvedores do repositório
// ---------------------------------------------------------------------------
function existe(rel) {
  try {
    fs.statSync(path.join(RAIZ, rel));
    return true;
  } catch {
    return false;
  }
}

const PREFIXOS = ['', '.github/workflows/', 'docs/runbooks/', 'scripts/ci/'];

export function existeCaminhoRepo(token) {
  if (FUNCAO_EDGE.test(token)) return existe(`${token}/index.ts`);
  return PREFIXOS.some((p) => existe(p + token));
}

export function linhasDoArquivoRepo(token) {
  for (const p of PREFIXOS) {
    if (existe(p + token)) {
      return fs.readFileSync(path.join(RAIZ, p + token), 'utf8').split('\n').length;
    }
  }
  return 0;
}

export function contemNoArquivoRepo(token, agulha) {
  for (const p of PREFIXOS) {
    if (existe(p + token)) return fs.readFileSync(path.join(RAIZ, p + token), 'utf8').includes(agulha);
  }
  return false;
}

export function existeView(nome) {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'supabase/schema-manifest.json'), 'utf8'));
  return Object.keys(m.views || {}).some((k) => k.replace(/^v:/, '') === nome);
}

// Artefato de monitoramento = algo que checa a URL de fora: workflow agendado ou script.
// "monitor" sozinho é amplo demais: scripts de auditoria internos (ex.: Talk X Monitor Panel)
// não medem uptime do front e não podem transformar o SLO de front em REAL/PARCIAL.
const ARTEFATO_MONITOR_EXTERNO =
  /(uptime|health[-_.]?check|external[-_.]?monitor|monitor[-_.]?externo|front[-_.]?(monitor|uptime)|monitor[-_.]?front|version[-_.]?json)/i;

export function nomesIndicamArtefatoMonitor(nomes) {
  // Smoke pós-deploy de Edge Functions não mede uptime contínuo do frontend.
  return nomes.some((n) => n !== 'edge-deploy/health-check.mjs' && ARTEFATO_MONITOR_EXTERNO.test(n));
}

export function existeArtefatoMonitor() {
  const nomes = [];
  const dirWf = path.join(RAIZ, '.github/workflows');
  if (fs.existsSync(dirWf)) nomes.push(...fs.readdirSync(dirWf));
  const dirScripts = path.join(RAIZ, 'scripts');
  if (fs.existsSync(dirScripts)) {
    for (const sub of fs.readdirSync(dirScripts)) {
      const p = path.join(dirScripts, sub);
      if (fs.statSync(p).isDirectory()) nomes.push(...fs.readdirSync(p).map((n) => `${sub}/${n}`));
    }
  }
  return nomesIndicamArtefatoMonitor(nomes);
}

const IGNORAR_SRC = /(__tests__|__fixtures__|__mocks__|node_modules|\.test\.|\.spec\.)/;
export function temXRequestIdEmSrc() {
  const pilha = [path.join(RAIZ, 'src')];
  while (pilha.length) {
    const atual = pilha.pop();
    let itens;
    try {
      itens = fs.readdirSync(atual, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of itens) {
      const rel = path.relative(RAIZ, path.join(atual, item.name));
      if (IGNORAR_SRC.test(rel)) continue;
      if (item.isDirectory()) pilha.push(path.join(atual, item.name));
      else if (/\.(ts|tsx|js|jsx)$/.test(item.name)) {
        if (/x-request-id/i.test(fs.readFileSync(path.join(atual, item.name), 'utf8'))) return true;
      }
    }
  }
  return false;
}

const AMB_REPO = {
  existeCaminho: existeCaminhoRepo,
  linhasDoArquivo: linhasDoArquivoRepo,
  contemNoArquivo: contemNoArquivoRepo,
  existeView,
  existeArtefatoMonitor,
  temXRequestIdEmSrc,
};

// ---------------------------------------------------------------------------
// Documento real
// ---------------------------------------------------------------------------
test('o runbook de SLOs fecha os invariantes de honestidade (I1–I6)', () => {
  const problemas = analisar(fs.readFileSync(path.join(RAIZ, DOC), 'utf8'), AMB_REPO);
  assert.deepEqual(problemas, [], `docs/runbooks/slo.md:\n- ${problemas.join('\n- ')}`);
});

test('o runbook continua dizendo que o monitor externo NÃO existe', () => {
  const doc = fs.readFileSync(path.join(RAIZ, DOC), 'utf8');
  assert.match(doc, /monitor externo de uptime continua n[ãa]o existindo/i);
  assert.equal(existeArtefatoMonitor(), false, 'surgiu um artefato de monitoramento: atualize o runbook');
  const tabela = tabelaDoTitulo(doc, 'SLOs propostos');
  const front = tabela.find(({ celulas }) => /front dispon/i.test(celulas[0]));
  assert.ok(front, 'linha do SLO de front ausente');
  assert.match(front.celulas[front.celulas.length - 1], /^PENDENTE/, 'SLO de front sem fonte real tem de ser PENDENTE');
});

// ---------------------------------------------------------------------------
// Prova por mutação sobre o DOCUMENTO REAL — a guarda analisa o artefato entregue,
// não uma cópia feita à mão: cada mutação abaixo é aplicada no texto lido do disco.
// ---------------------------------------------------------------------------
const lerDoc = () => fs.readFileSync(path.join(RAIZ, DOC), 'utf8');

function mutar(troca, por) {
  const doc = lerDoc();
  const mutado = doc.replace(troca, por);
  assert.notEqual(mutado, doc, `a mutação não achou o trecho: ${troca}`);
  return analisar(mutado, AMB_REPO);
}

test('mutação no documento real: SLO de front de PENDENTE para REAL acusa I3', () => {
  const problemas = mutar('(HTTP 200 + JSON) a cada 1 min | PENDENTE', '(HTTP 200 + JSON) a cada 1 min | REAL');
  assert.ok(problemas.some((p) => p.startsWith('I3')), problemas.join('; '));
});

test('mutação no documento real: view de latência de PENDENTE para REAL acusa I3', () => {
  const problemas = mutar(
    'não existe em `supabase/schema-manifest.json` (passo 4) |',
    'existe em `supabase/schema-manifest.json` (passo 4) | REAL |',
  );
  assert.ok(problemas.some((p) => p.startsWith('I3')), problemas.join('; '));
});

test('mutação no documento real: caminho de workflow inválido acusa I2', () => {
  const problemas = mutar('`db-live-guard.yml` roda', '`db-live-guard-inexistente.yml` roda');
  assert.ok(problemas.some((p) => p.startsWith('I2')), problemas.join('; '));
});

test('mutação no documento real: referência de arquivo quebrada acusa I5', () => {
  const problemas = mutar('useMonitoringActions.ts:17', 'useMonitoringActions.ts:9999');
  assert.ok(problemas.some((p) => p.startsWith('I5')), problemas.join('; '));
});

test('mutação no documento real: alvo de erro fora da linha da edge acusa I4', () => {
  const problemas = mutar('erro ≤ 0,5 % ⇔', 'erro conforme o alvo de aceitação ⇔');
  assert.ok(problemas.some((p) => p.startsWith('I4')), problemas.join('; '));
});

test('mutação no documento real: alvo de latência fora da linha da edge acusa I4', () => {
  const problemas = mutar('p95 < 500 ms', 'p95 sob o limiar acordado');
  assert.ok(problemas.some((p) => p.startsWith('I4')), problemas.join('; '));
});

// ---------------------------------------------------------------------------
// Fixtures — os dois lados de cada regra, provados em string
// ---------------------------------------------------------------------------
const OK = {
  existeCaminho: (t) => t === 'db-live-guard.yml' || t === 'src/cliente.ts',
  linhasDoArquivo: (t) => (t === 'src/cliente.ts' ? 30 : 0),
  contemNoArquivo: () => true,
  existeView: () => false,
  existeArtefatoMonitor: () => false,
  temXRequestIdEmSrc: () => false,
};

const tabela = (linhaFront, ...extras) => `## SLOs propostos (janela de 30 dias)

| SLO | Alvo | Como medir (fonte real) | Fonte hoje |
|---|---|---|---|
${linhaFront}
| Webhook \`evolution-webhook\` latência | p95 < 500 ms | duração por invocação nos logs da Edge Function | PENDENTE |
| Webhook \`evolution-webhook\` erro | erro ≤ 0,5 % ⇔ aceitação ≥ 99,5 % (alvo único) | logs da edge | PENDENTE |
| Schema sem drift | 100 % | \`db-live-guard.yml\` | REAL |
${extras.join('\n')}
`;

const secaoXrid = (estadoCliente, citado = '`src/cliente.ts`') => `## x-request-id ponta a ponta

| Elo | Estado | Onde |
|---|---|---|
| Cliente envia \`x-request-id\` | ${estadoCliente} | ${citado} |
| Borda devolve | sim | \`src/cliente.ts\` |
`;

const FRONT_PENDENTE = '| Front disponível | 99,9 % | monitor externo em /version.json | PENDENTE |';

test('fixture: documento conforme passa nas seis regras', () => {
  assert.deepEqual(analisar(tabela(FRONT_PENDENTE) + secaoXrid('não'), OK), []);
});

test('fixture I1: linha sem a coluna Fonte hoje é acusada (o defeito de 05/09)', () => {
  const semColuna = `## SLOs propostos (janela de 30 dias)

| SLO | Alvo | Como medir (fonte real) |
|---|---|---|
| Front disponível | 99,9 % | uptime check externo a cada 1 min |
| Webhook \`evolution-webhook\` latência | p95 < 500 ms | semanal |
| Webhook \`evolution-webhook\` erro | < 1 % | semanal |
| Instância conectada | 99 % | \`connection_health_logs\` |
| Login funcional | 99,9 % | logs da edge |
| Schema sem drift | 100 % | \`db-live-guard.yml\` |

## x-request-id ponta a ponta

| Elo | Estado | Onde |
|---|---|---|
| Cliente envia \`x-request-id\` | não | nenhuma ocorrência em \`src/\` |
`;
  const problemas = analisar(semColuna, OK);
  assert.ok(problemas.some((p) => p.startsWith('I1')), problemas.join('; '));
});

test('fixture I3: monitor/uptime declarado REAL sem artefato de monitoramento é acusado', () => {
  const fixt = tabela('| Front disponível | 99,9 % | monitor externo em /version.json | REAL |') + secaoXrid('não');
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I3')));
});

test('fixture I3: view de latência declarada PARCIAL sem existir em produção é acusada', () => {
  const fixt = tabela('| Latência | p95 < 5 s | view `slo_inbound_latency_daily` | PARCIAL |') + secaoXrid('não');
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I3')));
});

test('fixture I3: com o artefato de monitoramento presente, o REAL passa', () => {
  const fixt = tabela('| Front disponível | 99,9 % | monitor externo em /version.json | REAL |') + secaoXrid('não');
  const amb = { ...OK, existeArtefatoMonitor: () => true };
  assert.deepEqual(analisar(fixt, amb), []);
});

test('fixture I3: auditoria Talk X Monitor Panel não conta como monitor externo de uptime', () => {
  assert.equal(nomesIndicamArtefatoMonitor(['talkx-monitor-panel.test.sh']), false);
  assert.equal(nomesIndicamArtefatoMonitor(['edge-deploy/health-check.mjs']), false);
  assert.equal(nomesIndicamArtefatoMonitor(['ops/external-monitor.mjs']), true);
  assert.equal(nomesIndicamArtefatoMonitor(['uptime-check.mjs']), true);
});

test('fixture I2: caminho citado que não existe é acusado', () => {
  const fixt = tabela('| Front disponível | 99,9 % | \`scripts/ci/uptime-check.mjs\` | PENDENTE |') + secaoXrid('não');
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I2')));
});

test('fixture I5: referência arquivo:linha além do fim é acusada', () => {
  const fixt = tabela(FRONT_PENDENTE) + secaoXrid('não') + '\nVer `src/cliente.ts:31`.\n';
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I5')));
});

test('fixture I6: dizer que o cliente envia com src/ sem o header é acusado', () => {
  const fixt = tabela(FRONT_PENDENTE) + secaoXrid('sim');
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I6')));
});

test('fixture I6: dizer que o cliente não envia com src/ tendo o header é acusado', () => {
  const fixt = tabela(FRONT_PENDENTE) + secaoXrid('não');
  const amb = { ...OK, temXRequestIdEmSrc: () => true };
  assert.ok(analisar(fixt, amb).some((p) => p.startsWith('I6')));
});

test('fixture I6: elo marcado como sim cita arquivo que não trata o header', () => {
  const fixt = tabela(FRONT_PENDENTE) + secaoXrid('não');
  const amb = { ...OK, contemNoArquivo: () => false };
  assert.ok(analisar(fixt, amb).some((p) => p.startsWith('I6')));
});

test('fixture I4: SLO mínimo do webhook ausente é acusado', () => {
  const fixt = `## SLOs propostos (janela de 30 dias)

| SLO | Alvo | Como medir (fonte real) | Fonte hoje |
|---|---|---|---|
| Front disponível | 99,9 % | monitor em /version.json | PENDENTE |
| Instância conectada | 99 % | \`connection_health_logs\` | PARCIAL |
| Mensagem visível | p95 < 5 s | \`messages\` | PENDENTE |
| Login funcional | 99,9 % | logs | PARCIAL |
| Schema sem drift | 100 % | \`db-live-guard.yml\` | REAL |
| Backups | diário | MCP | PARCIAL |
` + secaoXrid('não');
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I4')));
});

// Fixture da recusa: os termos existem NA TABELA, mas o alvo não está na linha da edge —
// `evolution-webhook` numa linha, `p95 < 500 ms` e o percentual em OUTRAS linhas. A regra antiga
// (busca no texto da tabela inteira) dava verde aqui; a linha da edge, sozinha, não tinha alvo.
test('fixture I4: alvo espalhado em outras linhas da tabela é acusado (defeito da regra antiga)', () => {
  const espalhado = `## SLOs propostos (janela de 30 dias)

| SLO | Alvo | Como medir (fonte real) | Fonte hoje |
|---|---|---|---|
| Front disponível | 99,9 % | monitor externo em /version.json | PENDENTE |
| Webhook \`evolution-webhook\` latência | ver a linha de mensagens | logs da edge | PENDENTE |
| Mensagem inbound visível | p95 < 500 ms | \`messages\` | PENDENTE |
| Webhook \`evolution-webhook\` erro | ver a linha de aceitação | logs da edge | PENDENTE |
| Webhook inbound aceito | erro ≤ 0,5 % | logs da edge | PARCIAL |
| Backups diários | ≥ 99 % de execução no dia (falha ≤ 1 %) | MCP | PARCIAL |
| Schema sem drift | 100 % | \`db-live-guard.yml\` | REAL |
` + secaoXrid('não');
  // Esta mesma tabela, com a guarda ANTERIOR (busca dos 4 termos no texto da tabela inteira),
  // saía sem nenhum problema: a prova é a execução da guarda antiga sobre este documento, medida
  // e registrada no relato — aqui não se copia a regra antiga à mão.
  const problemas = analisar(espalhado, OK);
  assert.ok(problemas.some((p) => p.startsWith('I4')), problemas.join('; '));
  // Prova dos dois lados: a mesma tabela com os alvos NAS linhas da edge passa.
  assert.deepEqual(analisar(tabela(FRONT_PENDENTE) + secaoXrid('não'), OK), []);
});

// --- Bordas: documento vazio, célula vazia e negativa por outra palavra ---
test('fixture borda: documento vazio acusa I1, I4 e I6 (nada de silêncio verde)', () => {
  const problemas = analisar('', OK);
  for (const regra of ['I1', 'I4', 'I6']) {
    assert.ok(problemas.some((p) => p.startsWith(regra)), `${regra} não acusou: ${problemas.join('; ')}`);
  }
});

test('fixture borda: célula Fonte hoje vazia é acusada por I1', () => {
  const fixt = tabela('| Front disponível | 99,9 % | monitor externo | |') + secaoXrid('não');
  assert.ok(analisar(fixt, OK).some((p) => p.startsWith('I1')));
});

test('fixture borda: "nenhuma ocorrência" no elo do cliente conta como não envia', () => {
  const fixt = tabela(FRONT_PENDENTE) + secaoXrid('nenhuma ocorrência');
  assert.deepEqual(analisar(fixt, OK), []);
});
