// X052 — endereço do módulo Talk X: um único dono dos parâmetros da query.
// `tab`/`sub` (aba e sub-visão), `campaign`/`segment`/`template` (item aberto) e,
// reexportados de talkxWizardRoute.ts, `wizard`/`step` (editor de campanha).
//
// Mesmo rigor do parser do wizard: parâmetro duplicado é endereço AMBÍGUO e é
// rejeitado em vez de coagido — o valor repetido nunca é escolhido "por acaso"
// (antes, `?tab=analytics&tab=suppression` abria analytics em silêncio). Quem lê
// recebe `needsNormalization` e substitui o endereço sem criar entrada de histórico.
//
// Quem grava: `goTab` (aba/sub) e `pushTalkXOpenRoute`/`replaceTalkXOpenRoute`
// (item aberto — é o que a busca do módulo grava em X054).

import { parseTalkXWizardRoute, type ParsedTalkXWizardRoute } from './talkxWizardRoute';

export {
  formatTalkXWizardRoute,
  pushTalkXWizardRoute,
  replaceTalkXWizardRoute,
  type TalkXWizardRoute,
} from './talkxWizardRoute';
export { parseTalkXWizardRoute };

export const TALKX_TABS = ['overview', 'segments', 'templates', 'suppression', 'analytics'] as const;
export type TalkXTab = (typeof TALKX_TABS)[number];

// `tab=campaigns` é alias de `overview`: a listagem de campanhas mora na Visão geral
// (mock 01, que é a tela real; o mock 17 é prancha de referência).
const TAB_ALIASES: Record<string, TalkXTab> = { campaigns: 'overview' };

export type TalkXTabRoute = { tab: TalkXTab; sub?: string };

export type ParsedTalkXRoute = TalkXTabRoute & {
  /** Item aberto pela URL. Só um por endereço: `pushTalkXOpenRoute` limpa os outros. */
  campaign?: string;
  segment?: string;
  template?: string;
  /** O wizard mantém um dono só (talkxWizardRoute.ts); o sinal de normalização
   * dele vive dentro de `wizard`, separado do sinal deste parser. */
  wizard: ParsedTalkXWizardRoute;
  /** Normalização de `tab`, `sub`, `campaign`, `segment` ou `template`. */
  needsNormalization: boolean;
};

const OPEN_TARGETS = ['campaign', 'segment', 'template'] as const;
export type TalkXOpenKind = (typeof OPEN_TARGETS)[number];
export type TalkXOpenTarget = { kind: TalkXOpenKind; id: string } | null;

/** Ausente = `undefined`; duplicado (ou vazio, no caso de id) = rejeitado. */
function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

function isKnownTab(value: string): value is TalkXTab {
  return (TALKX_TABS as readonly string[]).includes(value);
}

/** Resolve uma aba digitada/gravada: alias e nome conhecido passam, o resto cai na Visão geral. */
function resolveTab(value: string): TalkXTab | null {
  const alias = TAB_ALIASES[value];
  if (alias) return alias;
  return isKnownTab(value) ? value : null;
}

function readOpenTarget(params: URLSearchParams, name: TalkXOpenKind): { id?: string; malformed: boolean } {
  const raw = readSingle(params, name);
  if (raw === undefined) return { malformed: false };
  // Vazio não abre nada e duplicado não escolhe item: nos dois casos o endereço é reescrito.
  if (raw === null || raw.trim() === '') return { malformed: true };
  return { id: raw, malformed: false };
}

export function parseTalkXRoute(search: string): ParsedTalkXRoute {
  const params = new URLSearchParams(search);
  const rawTab = readSingle(params, 'tab');
  const rawSub = readSingle(params, 'sub');

  let needsNormalization = false;
  let tab: TalkXTab = 'overview';

  if (rawTab !== undefined) {
    const resolved = rawTab === null ? null : resolveTab(rawTab);
    if (resolved) tab = resolved;
    else needsNormalization = true; // duplicado ou desconhecido: não escolhe aba por conta própria
  }

  let sub: string | undefined;
  if (rawSub !== undefined) {
    if (rawSub === null || rawSub.trim() === '') needsNormalization = true;
    else sub = rawSub;
  }

  const campaign = readOpenTarget(params, 'campaign');
  const segment = readOpenTarget(params, 'segment');
  const template = readOpenTarget(params, 'template');
  if (campaign.malformed || segment.malformed || template.malformed) needsNormalization = true;

  return {
    tab,
    sub,
    campaign: campaign.id,
    segment: segment.id,
    template: template.id,
    wizard: parseTalkXWizardRoute(search),
    needsNormalization,
  };
}

export function formatTalkXTabRoute(current: URL, route: TalkXTabRoute): string {
  const url = new URL(current.href);
  url.searchParams.set('tab', route.tab);
  if (route.sub) url.searchParams.set('sub', route.sub);
  else url.searchParams.delete('sub');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Navega para a aba. Aceita o alias e nomes desconhecidos: grava sempre a aba canônica. */
export function goTab(tab: string, sub?: string): void {
  const route: TalkXTabRoute = {
    tab: resolveTab(tab) ?? 'overview',
    sub: sub && sub.trim() ? sub : undefined,
  };
  window.history.pushState(null, '', formatTalkXTabRoute(new URL(window.location.href), route));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function replaceTalkXTabRoute(route: TalkXTabRoute): void {
  window.history.replaceState(null, '', formatTalkXTabRoute(new URL(window.location.href), route));
}

export function formatTalkXOpenRoute(current: URL, target: TalkXOpenTarget): string {
  const url = new URL(current.href);
  for (const kind of OPEN_TARGETS) url.searchParams.delete(kind);
  if (target) url.searchParams.set(target.kind, target.id);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pushTalkXOpenRoute(target: TalkXOpenTarget): void {
  window.history.pushState(null, '', formatTalkXOpenRoute(new URL(window.location.href), target));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function replaceTalkXOpenRoute(target: TalkXOpenTarget): void {
  window.history.replaceState(null, '', formatTalkXOpenRoute(new URL(window.location.href), target));
}

// --- Screen routing (TL-152): campaign monitor screen via ?screen= ---

export type TalkXScreen = 'monitor' | 'scheduled' | 'running';
export type TalkXScreenTarget = TalkXScreen | 'wizard';

export type TalkXRoute = {
  campaignId: string;
  screen?: TalkXScreen;
};

export type ParsedTalkXScreenRoute = {
  route: TalkXRoute | null;
  needsNormalization: boolean;
};

const SCREENS = new Set<string>(['monitor', 'scheduled', 'running']);
const CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * A situação da campanha decide a tela de acompanhamento.
 * `paused` cai na tela running e `completed`/`cancelled` caem no monitor em
 * leitura (X143: a tela de relatório ainda não existe; sem tela própria, o
 * endereço nunca é `?screen=report`).
 */
export function screenForStatus(status: string | null | undefined): TalkXScreenTarget {
  switch (status) {
    case 'draft':
      return 'wizard';
    case 'scheduled':
      return 'scheduled';
    case 'sending':
      return 'running';
    case 'paused':
      return 'running';
    case 'completed':
    case 'cancelled':
      return 'monitor';
    default:
      return 'monitor';
  }
}

/**
 * Lê só a parte da campanha aberta do query string.
 * `undefined` na tela significa "a situação decide";
 * `null` (duplicado) ou valor malformado nunca abrem campanha.
 */
export function parseTalkXScreenRoute(search: string): ParsedTalkXScreenRoute {
  const params = new URLSearchParams(search);
  const rawCampaign = readSingle(params, 'campaign');
  const rawScreen = readSingle(params, 'screen');

  if (rawCampaign === undefined) {
    return { route: null, needsNormalization: rawScreen !== undefined && rawScreen !== 'help' };
  }

  if (rawCampaign === null || !CAMPAIGN_ID.test(rawCampaign)) {
    return { route: null, needsNormalization: true };
  }

  if (rawScreen === null) {
    return { route: null, needsNormalization: true };
  }

  if (rawScreen !== undefined && !SCREENS.has(rawScreen)) {
    return { route: null, needsNormalization: true };
  }

  return {
    route: rawScreen === undefined
      ? { campaignId: rawCampaign }
      : { campaignId: rawCampaign, screen: rawScreen as TalkXScreen },
    needsNormalization: false,
  };
}

export function formatTalkXRoute(current: URL, route: TalkXRoute | null): string {
  const url = new URL(current.href);
  if (route) {
    url.searchParams.set('campaign', route.campaignId);
    if (route.screen) url.searchParams.set('screen', route.screen);
    else url.searchParams.delete('screen');
  } else {
    url.searchParams.delete('campaign');
    url.searchParams.delete('screen');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceTalkXRoute(route: TalkXRoute | null): void {
  window.history.replaceState(null, '', formatTalkXRoute(new URL(window.location.href), route));
}
