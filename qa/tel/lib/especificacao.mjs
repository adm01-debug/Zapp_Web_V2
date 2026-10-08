/**
 * Especificação do que os scripts de QA da Telefonia MEDEM e COMO decidem.
 *
 * É o contrato do E.2 (geometria), do E.3 (cor dos tokens) e do E.5 (função e
 * a11y) do PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29, traduzido para
 * tabelas que o teste consegue exercitar sem browser.
 *
 * Cada linha diz: qual eixo do aceite, de onde vem o número (o seletor real do
 * código) e qual o alvo. Onde o plano não publica um número, a linha é
 * RELACIONAL (ex.: "as duas opções de canal têm a mesma largura") e o alvo é a
 * diferença tolerada — nunca um valor inventado.
 */
import { deltaE, medir, rgbDoCss, triplaHslParaRgb } from './regras.mjs';

/**
 * E.2 — geometria da tela. `sentido`: 'igual' (alvo ± tolerância), 'min' (piso),
 * 'max' (teto).
 *
 * Alvos numéricos publicados: `contentX = 278 ± 6` (T33), painel `408 ± 8` em
 * 1672 (T55/T77), tile de KPI `78 ± 4` (CallKpiCard, T38), abas `h-10` = 40
 * (CallHistoryTabs), paginação `h-9` = 36 (CallsPagination), teclado `h-[46px]`
 * (Keypad), CTA `h-14` = 56 (NewCallPanel). Os demais são invariantes.
 */
export const ESPECIFICACAO_E2 = Object.freeze([
  { eixo: 'contentX', medicao: 'contentX', alvo: 278, tolerancia: 6 },
  { eixo: 'chips', medicao: 'chips', alvo: 2, tolerancia: 2, sentido: 'max' },
  { eixo: 'kpi', medicao: 'kpi', alvo: 0, tolerancia: 2 },
  { eixo: 'kpiTile', medicao: 'kpiTile', alvo: 78, tolerancia: 4 },
  { eixo: 'tab', medicao: 'tab', alvo: 40, tolerancia: 2 },
  { eixo: 'toolbar', medicao: 'toolbar', alvo: 200, tolerancia: 0, sentido: 'min' },
  { eixo: 'rows', medicao: 'rows', alvo: 44, tolerancia: 0, sentido: 'min' },
  { eixo: 'pager', medicao: 'pager', alvo: 36, tolerancia: 2 },
  { eixo: 'panel', medicao: 'panel', alvo: 408, tolerancia: 8 },
  { eixo: 'segmented', medicao: 'segmented', alvo: 2, tolerancia: 2, sentido: 'max' },
  { eixo: 'picker', medicao: 'picker', alvo: 200, tolerancia: 0, sentido: 'min' },
  { eixo: 'key', medicao: 'key', alvo: 46, tolerancia: 2 },
  { eixo: 'cta', medicao: 'cta', alvo: 56, tolerancia: 2 },
  // `selectedPanel`: o painel de detalhe só existe quando a URL traz `?call=`.
  // A linha mede a DIVERGÊNCIA (presente na tela menos previsto na URL): 0 = coerente.
  { eixo: 'selectedPanel', medicao: 'selectedPanel', alvo: 0, tolerancia: 0 },
  { eixo: 'kpiTotal==historyCount', medicao: 'kpiTotal==historyCount', alvo: 0, tolerancia: 0 },
  { eixo: 'scrollW/innerW', medicao: 'scrollW/innerW', alvo: 0, tolerancia: 0, sentido: 'max' },
  { eixo: 'reducedMotion', medicao: 'reducedMotion', alvo: 0, tolerancia: 0.001, sentido: 'max' },
]);

/**
 * Avalia o mapa bruto do E.2. `observado` é `{ eixo: { valor, detalhe?, skip?, motivo? } }`
 * — `skip`/`motivo` vêm no topo da observação (é o que `coleta.mjs` devolve).
 */
export function avaliarE2(observado = {}) {
  return ESPECIFICACAO_E2.map((linha) => {
    const o = observado[linha.medicao];
    return medir(linha.eixo, o?.valor, linha.alvo, linha.tolerancia, detalheDaObservacao(o), linha.sentido ?? 'igual');
  });
}

/** Junta `detalhe` + `skip`/`motivo` numa só bolsa, para o `medir`. */
function detalheDaObservacao(o) {
  if (!o) return {};
  return {
    ...(o.detalhe ?? {}),
    ...(o.skip === true ? { skip: true } : {}),
    ...(typeof o.motivo === 'string' ? { motivo: o.motivo } : {}),
  };
}

/** Avalia UM eixo do E.2 (usado quando a medição sai em outro contexto). */
export function avaliarLinhaE2(eixo, observacao = {}) {
  const linha = ESPECIFICACAO_E2.find((l) => l.eixo === eixo);
  if (!linha) throw new Error(`eixo fora da especificação E.2: ${eixo}`);
  return medir(linha.eixo, observacao.valor, linha.alvo, linha.tolerancia, detalheDaObservacao(observacao), linha.sentido ?? 'igual');
}

/**
 * E.3 — cada elemento pinta com o TOKEN que ele diz usar. O esperado vem da
 * variável CSS que a página declara (`--card`, `--foreground`, …) e o obtido do
 * `getComputedStyle` do próprio elemento: as duas pontas são independentes.
 * Reprova acima de ΔE 2 (CIE76), como o plano manda.
 */
export const TOKENS_E3 = Object.freeze([
  { eixo: 'history-card/card', seletor: '[data-testid="tel-history-card"]', propriedade: 'backgroundColor', token: '--card' },
  { eixo: 'kpi-card/card', seletor: '[data-testid="tel-kpi-card"]', propriedade: 'backgroundColor', token: '--card' },
  { eixo: 'historico/foreground', seletor: '[data-testid="tel-history-card"] h2', propriedade: 'color', token: '--foreground' },
  { eixo: 'kpi-value/foreground', seletor: '[data-testid="tel-kpi-value"]', propriedade: 'color', token: '--foreground' },
  { eixo: 'cta/success', seletor: '[data-testid="tel-dial-button"]', propriedade: 'backgroundColor', token: '--success' },
  { eixo: 'side-panel/card', seletor: '[data-testid="tel-side-panel"] .bg-card', propriedade: 'backgroundColor', token: '--card' },
  { eixo: 'view/background', seletor: 'body', propriedade: 'backgroundColor', token: '--background' },
]);

/** Avalia o mapa `{ eixo: { pintado, token } }` (ambos em RGB). */
export function avaliarE3(observado = {}) {
  return TOKENS_E3.map((linha) => {
    const o = observado[linha.eixo];
    if (!o?.pintado || !o?.token) {
      return medir(linha.eixo, NaN, 0, 2, { token: linha.token, motivo: 'cor não medida' });
    }
    const d = deltaE(o.pintado, o.token);
    return medir(linha.eixo, Number(d.toFixed(3)), 0, 2, {
      token: linha.token,
      pintado: `rgb(${o.pintado.join(', ')})`,
      esperado: `rgb(${o.token.join(', ')})`,
    });
  });
}

/**
 * Converte as duas pontas cruas (`getComputedStyle`) em RGB. Exportado para o teste.
 */
export function rgbDaCor(propriedade, texto) {
  if (propriedade === 'backgroundColor' || propriedade === 'color') return rgbDoCss(texto);
  return null;
}

/** Junta o mapa cru do E.3 com a especificação e devolve tudo em RGB. */
export function prepararE3(bruto = {}) {
  const saida = {};
  for (const linha of TOKENS_E3) {
    const o = bruto[linha.eixo] ?? {};
    saida[linha.eixo] = {
      pintado: rgbDaCor(linha.propriedade, o.pintado),
      token: rgbDoToken(o.token),
    };
  }
  return saida;
}

/** Converte o valor de uma variável CSS de token ("221 83% 53%") em RGB. */
export function rgbDoToken(texto) {
  return rgbDoCss(texto) ?? triplaHslParaRgb(texto);
}

/** E.5 — os 20 passos funcionais do `func.mjs`, na ordem do plano (T83). */
export const CHECKS_E5 = Object.freeze([
  'periodo muda KPIs',
  'aba VoIP',
  'busca nome',
  'busca numero',
  'Direcao',
  'Resultado',
  'pagina 2/volta',
  'deep link',
  'selecionar/Esc',
  'picker',
  'teclado fisico',
  'WhatsApp desabilitado com motivo',
  'CTA sem numero',
  'discar -> dialing -> Cancelar -> linha cancelled',
  'ActiveCallBar em ?view=inbox',
  'notas salvam',
  '2 abas lider/seguidora',
  'seletor Minhas/Todas',
  'console sem error',
  'sem overflow horizontal',
]);

/** E.5/a11y — só `serious` e `critical` bloqueiam (T76/T84). */
export const IMPACTOS_BLOQUEANTES = Object.freeze(['serious', 'critical']);

/** Normaliza as violações do axe e separa as que bloqueiam. */
export function avaliarAxe(violacoes = []) {
  const normalizadas = violacoes.map((v) => ({
    id: v.id,
    impact: v.impact,
    nos: Array.isArray(v.nodes) ? v.nodes.length : 0,
  }));
  return {
    total: normalizadas.length,
    bloqueantes: normalizadas.filter((v) => IMPACTOS_BLOQUEANTES.includes(v.impact)),
    violacoes: normalizadas,
  };
}
