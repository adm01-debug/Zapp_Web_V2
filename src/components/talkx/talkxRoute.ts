// Endereço das telas de acompanhamento do Talk X (Monitor, Agendada, Em Andamento
// e o relatório de concluída/cancelada). A campanha vive em ?campaign= e a tela em
// ?screen=; sem ?screen= é a situação da campanha que decide (screenForStatus).
//
// Convivência: as abas do módulo continuam em ?tab= (talkxTabRoute.ts) e o editor em
// ?wizard=/?step= (talkxWizardRoute.ts); este módulo só toca campaign/screen, para os
// três endereços não se sobrescreverem.
//
// Rigor do parser igual ao do wizard: parâmetro duplicado é endereço ambíguo e a rota
// inteira é rejeitada, nunca "escolhida" a primeira ocorrência.

/** Telas de acompanhamento endereçáveis pela URL. */
export type TalkXScreen = 'monitor' | 'scheduled' | 'running' | 'report';

/** Onde a campanha deve abrir: uma tela de acompanhamento ou o wizard. */
export type TalkXScreenTarget = TalkXScreen | 'wizard';

export type TalkXRoute = {
  campaignId: string;
  /** Ausente: a tela sai da situação da campanha (screenForStatus). */
  screen?: TalkXScreen;
};

export type ParsedTalkXRoute = {
  route: TalkXRoute | null;
  /** O chamador deve corrigir o endereço sem criar entrada no histórico. */
  needsNormalization: boolean;
};

const SCREENS = new Set<string>(['monitor', 'scheduled', 'running', 'report']);
const CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

/**
 * A situação da campanha decide a tela de acompanhamento.
 * `paused` cai na tela 12 (a tela 13 chega em X156) e `completed`/`cancelled` caem no
 * monitor em leitura até a trilha de dados, relatório e importação existir.
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
      return 'report';
    default:
      return 'monitor';
  }
}

/**
 * Lê só a parte da campanha aberta do query string. `undefined` na tela significa
 * "a situação decide"; `null` (duplicado) ou valor malformado nunca abrem campanha.
 */
export function parseTalkXRoute(search: string): ParsedTalkXRoute {
  const params = new URLSearchParams(search);
  const view = readSingle(params, 'view');
  const rawCampaign = readSingle(params, 'campaign');
  const rawScreen = readSingle(params, 'screen');

  if (rawCampaign === undefined) {
    // `screen=help` pertence à rota da Central de Ajuda (talkxHelpRoute.ts), não
    // a uma campanha. Sem campanha, este parser não normaliza a URL.
    return { route: null, needsNormalization: rawScreen !== undefined && rawScreen !== 'help' };
  }

  // Campanha malformada/duplicada ou view de outro módulo: não há tela de
  // acompanhamento para abrir.
  if (view !== 'talkx' || rawCampaign === null || !CAMPAIGN_ID.test(rawCampaign)) {
    return { route: null, needsNormalization: true };
  }

  // Tela duplicada é ambígua: rejeita a rota inteira.
  if (rawScreen === null) {
    return { route: null, needsNormalization: true };
  }

  // Tela desconhecida não abre nada de errado: cai na situação da campanha.
  if (rawScreen !== undefined && !SCREENS.has(rawScreen)) {
    return { route: { campaignId: rawCampaign }, needsNormalization: true };
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
    url.searchParams.set('view', 'talkx');
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
