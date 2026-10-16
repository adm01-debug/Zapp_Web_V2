import type { WizardStep } from './useCampaignEditor';

export type TalkXWizardRoute = {
  campaignId: 'new' | string;
  step: WizardStep;
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

/**
 * Parses only the Talk X part of the query string. `undefined` means absent,
 * while `null` means duplicate/malformed and must never select a campaign.
 */
export function parseTalkXWizardRoute(search: string): ParsedTalkXWizardRoute {
  const params = new URLSearchParams(search);
  const view = readSingle(params, 'view');
  const rawWizard = readSingle(params, 'wizard');
  const rawStep = readSingle(params, 'step');

  if (rawWizard === undefined && rawStep === undefined) {
    return { route: null, needsNormalization: false };
  }

  if (view !== 'talkx' || rawWizard === undefined || rawWizard === null || rawWizard === '' || (rawWizard !== 'new' && !CAMPAIGN_ID.test(rawWizard))) {
    return { route: null, needsNormalization: true };
  }

  if (rawStep === undefined) {
    return { route: { campaignId: rawWizard, step: 1 }, needsNormalization: true };
  }

  // Duplicated parameters are an ambiguous address, not an invalid value that
  // can safely be coerced. Reject the whole route so it cannot select a draft.
  if (rawStep === null) {
    return { route: null, needsNormalization: true };
  }

  if (!STEP_VALUES.has(rawStep)) {
    return { route: { campaignId: rawWizard, step: 1 }, needsNormalization: true };
  }

  return { route: { campaignId: rawWizard, step: Number(rawStep) as WizardStep }, needsNormalization: false };
}

export function formatTalkXWizardRoute(current: URL, route: TalkXWizardRoute | null): string {
  const url = new URL(current.href);
  if (route) {
    url.searchParams.set('view', 'talkx');
    url.searchParams.set('wizard', route.campaignId);
    url.searchParams.set('step', String(route.step));
  } else {
    url.searchParams.delete('wizard');
    url.searchParams.delete('step');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceTalkXWizardRoute(route: TalkXWizardRoute | null): void {
  window.history.replaceState(null, '', formatTalkXWizardRoute(new URL(window.location.href), route));
}

export function pushTalkXWizardRoute(route: TalkXWizardRoute | null): void {
  window.history.pushState(null, '', formatTalkXWizardRoute(new URL(window.location.href), route));
}
