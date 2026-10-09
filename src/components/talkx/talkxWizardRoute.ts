import type { WizardStep } from './useCampaignEditor';

export type TalkXWizardRoute = {
  campaignId: 'new' | string;
  step: WizardStep;
  /**
   * X134 (V22) — passo de volta do fluxo "Editar" da revisão: o endereço
   * `step=N&return=4` abre o passo N e deixa registrado para onde o botão
   * principal daquele passo deve voltar. Ausente fora desse fluxo.
   */
  returnTo?: WizardStep;
};

export type ParsedTalkXWizardRoute = {
  route: TalkXWizardRoute | null;
  /** The caller should replace the address without creating a history entry. */
  needsNormalization: boolean;
};

const STEP_VALUES = new Set(['1', '2', '3', '4']);
const CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

/** `return` só vale 1–4 e sem duplicata; qualquer outra coisa não é adivinhada. */
function parseReturnStep(raw: string | null | undefined): WizardStep | undefined {
  if (raw === undefined || raw === null || !STEP_VALUES.has(raw)) return undefined;
  return Number(raw) as WizardStep;
}

/**
 * Parses only the Talk X part of the query string. `undefined` means absent,
 * while `null` means duplicate/malformed and must never select a campaign.
 */
export function parseTalkXWizardRoute(search: string): ParsedTalkXWizardRoute {
  const params = new URLSearchParams(search);
  const view = readSingle(params, 'view');
  const rawWizard = readSingle(params, 'wizard');
  const rawStep = readSingle(params, 'step');
  const rawReturn = readSingle(params, 'return');

  if (rawWizard === undefined && rawStep === undefined) {
    // Um `return` solto (sem wizard) ainda suja o endereço: sem limpá-lo, a
    // próxima campanha aberta herdaria um destino de volta que não é dela.
    return { route: null, needsNormalization: rawReturn !== undefined };
  }

  if (view !== 'talkx' || rawWizard === undefined || rawWizard === null || rawWizard === '' || (rawWizard !== 'new' && !CAMPAIGN_ID.test(rawWizard))) {
    return { route: null, needsNormalization: true };
  }

  const returnTo = parseReturnStep(rawReturn);
  const returnNeedsNormalization = rawReturn !== undefined && returnTo === undefined;

  if (rawStep === undefined) {
    return { route: { campaignId: rawWizard, step: 1, returnTo }, needsNormalization: true };
  }

  // Duplicated parameters are an ambiguous address, not an invalid value that
  // can safely be coerced. Reject the whole route so it cannot select a draft.
  if (rawStep === null) {
    return { route: null, needsNormalization: true };
  }

  if (!STEP_VALUES.has(rawStep)) {
    return { route: { campaignId: rawWizard, step: 1, returnTo }, needsNormalization: true };
  }

  return {
    route: { campaignId: rawWizard, step: Number(rawStep) as WizardStep, returnTo },
    needsNormalization: returnNeedsNormalization,
  };
}

export function formatTalkXWizardRoute(current: URL, route: TalkXWizardRoute | null): string {
  const url = new URL(current.href);
  if (route) {
    url.searchParams.set('view', 'talkx');
    url.searchParams.set('wizard', route.campaignId);
    url.searchParams.set('step', String(route.step));
    if (route.returnTo) url.searchParams.set('return', String(route.returnTo));
    else url.searchParams.delete('return');
  } else {
    url.searchParams.delete('wizard');
    url.searchParams.delete('step');
    // Sair do wizard também limpa o destino de volta: ele pertence à campanha
    // que estava aberta, não à próxima.
    url.searchParams.delete('return');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceTalkXWizardRoute(route: TalkXWizardRoute | null): void {
  window.history.replaceState(null, '', formatTalkXWizardRoute(new URL(window.location.href), route));
}

export function pushTalkXWizardRoute(route: TalkXWizardRoute | null): void {
  window.history.pushState(null, '', formatTalkXWizardRoute(new URL(window.location.href), route));
}
