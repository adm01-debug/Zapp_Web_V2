import { HELP_ALL_TOPICS, HELP_GUIDES_SLUG } from './talkxHelpIndex';

/**
 * X189 — endereço da Ajuda do Talk X: `?view=talkx&screen=help&topic=<t>&article=<a>`.
 *
 * Igual às abas e ao assistente do módulo, a rota vive na URL: o Talk X
 * renderiza a tela da Ajuda a partir daqui e o histórico do navegador volta um
 * passo por vez (lista → artigo → lista).
 */

export type TalkXHelpRoute = {
  topic?: string;
  article?: string;
};

export type ParsedTalkXHelpRoute = {
  route: TalkXHelpRoute | null;
  /** O chamador deve reescrever o endereço sem criar entrada no histórico. */
  needsNormalization: boolean;
};

export const HELP_SCREEN = 'help';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTICLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

function isTopic(value: string | undefined): boolean {
  if (!value) return false;
  return value === HELP_ALL_TOPICS || value === HELP_GUIDES_SLUG || SLUG.test(value);
}

/**
 * Lê só a parte da Ajuda da query. `undefined` = ausente; `null` = repetido ou
 * malformado e nunca seleciona tópico/artigo (mesma convenção do wizard).
 */
export function parseTalkXHelpRoute(search: string): ParsedTalkXHelpRoute {
  const params = new URLSearchParams(search);
  const screen = readSingle(params, 'screen');
  const rawTopic = readSingle(params, 'topic');
  const rawArticle = readSingle(params, 'article');

  if (screen === undefined && rawTopic === undefined && rawArticle === undefined) {
    return { route: null, needsNormalization: false };
  }

  const view = readSingle(params, 'view');
  if (view !== 'talkx' || screen !== HELP_SCREEN) {
    return { route: null, needsNormalization: true };
  }

  if (rawTopic === null || rawArticle === null) {
    return { route: null, needsNormalization: true };
  }

  const topic = isTopic(rawTopic) ? rawTopic : undefined;
  const article = rawArticle && ARTICLE_ID.test(rawArticle) ? rawArticle : undefined;
  const needsNormalization =
    (rawTopic !== undefined && topic === undefined) || (rawArticle !== undefined && article === undefined);

  return { route: { topic, article }, needsNormalization };
}

export function formatTalkXHelpRoute(current: URL, route: TalkXHelpRoute | null): string {
  const url = new URL(current.href);
  if (route) {
    url.searchParams.set('view', 'talkx');
    url.searchParams.set('screen', HELP_SCREEN);
    if (route.topic) url.searchParams.set('topic', route.topic);
    else url.searchParams.delete('topic');
    if (route.article) url.searchParams.set('article', route.article);
    else url.searchParams.delete('article');
  } else {
    url.searchParams.delete('screen');
    url.searchParams.delete('topic');
    url.searchParams.delete('article');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pushTalkXHelpRoute(route: TalkXHelpRoute | null): void {
  window.history.pushState(null, '', formatTalkXHelpRoute(new URL(window.location.href), route));
}

export function replaceTalkXHelpRoute(route: TalkXHelpRoute | null): void {
  window.history.replaceState(null, '', formatTalkXHelpRoute(new URL(window.location.href), route));
}
