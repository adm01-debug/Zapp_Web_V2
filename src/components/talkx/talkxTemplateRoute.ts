// Rota da tela 05 (editor de template) do Talk X, no mesmo padrão de
// `talkxWizardRoute.ts`: o endereço diz qual template está aberto no editor —
// `?view=talkx&tab=templates&template=<id|new>&ttab=conteudo|ab|historico`.
// `template=new` é o editor vazio (criar), `template=<id>` é um template da
// biblioteca e `ttab` diz qual sub-aba do editor está à vista.
//
// Quem formata parte do endereço atual e mexe só nos seus próprios parâmetros
// (`view`, `tab`, `template`, `ttab`), para não derrubar o que as outras trilhas do
// módulo escrevem ali (o wizard de campanha escreve `wizard`/`step` e a trilha de
// abas escreve `tab`/`sub`).

export type TalkXTemplateTab = 'conteudo' | 'ab' | 'historico';

export type TalkXTemplateRoute = {
  /** Template aberto no editor; `'new'` é o editor vazio, ainda sem id. */
  templateId: 'new' | string;
  /** Sub-aba do editor: Conteúdo, Variações A/B ou Histórico de Versões. */
  ttab: TalkXTemplateTab;
};

export type ParsedTalkXTemplateRoute = {
  route: TalkXTemplateRoute | null;
  /** O chamador deve reescrever o endereço sem criar entrada no histórico. */
  needsNormalization: boolean;
};

const TEMPLATE_TAB = 'templates';
const TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TTAB_VALUES = new Set<string>(['conteudo', 'ab', 'historico']);

function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

/**
 * Lê só a parte de templates do query string. `route: null` é a biblioteca — o
 * estado normal da tela — enquanto `needsNormalization` diz que o endereço pediu
 * algo inválido (ou incompleto) e precisa ser reescrito.
 */
export function parseTalkXTemplateRoute(search: string): ParsedTalkXTemplateRoute {
  const params = new URLSearchParams(search);
  const view = readSingle(params, 'view');
  const tab = readSingle(params, 'tab');
  const rawTemplate = readSingle(params, 'template');
  const rawTtab = readSingle(params, 'ttab');

  // Sem nenhum dos dois parâmetros ninguém pediu o editor: a biblioteca é a tela.
  if (rawTemplate === undefined && rawTtab === undefined) {
    return { route: null, needsNormalization: false };
  }

  // Parâmetro duplicado é endereço ambíguo, e `template`/`ttab` fora da tela de
  // templates (ou com id que não tem cara de id) não abrem editor nenhum: cai na
  // biblioteca com o endereço limpo.
  if (
    view !== 'talkx' ||
    tab !== TEMPLATE_TAB ||
    rawTemplate === null ||
    rawTtab === null ||
    rawTemplate === '' ||
    (rawTemplate !== 'new' && !TEMPLATE_ID.test(rawTemplate))
  ) {
    return { route: null, needsNormalization: true };
  }

  // `template` sozinho abre o editor; o endereço canônico carrega o `ttab`
  // explícito, por isso pede reescrita (mesma ideia do passo do wizard).
  if (rawTtab === undefined) {
    return { route: { templateId: rawTemplate, ttab: 'conteudo' }, needsNormalization: true };
  }

  // Sub-aba que não existe não muda o template aberto: volta para Conteúdo e o
  // endereço é reescrito, como o passo inválido do wizard.
  if (!TTAB_VALUES.has(rawTtab)) {
    return { route: { templateId: rawTemplate, ttab: 'conteudo' }, needsNormalization: true };
  }

  return { route: { templateId: rawTemplate, ttab: rawTtab as TalkXTemplateTab }, needsNormalization: false };
}

export function formatTalkXTemplateRoute(current: URL, route: TalkXTemplateRoute | null): string {
  const url = new URL(current.href);
  if (route) {
    url.searchParams.set('view', 'talkx');
    url.searchParams.set('tab', TEMPLATE_TAB);
    url.searchParams.set('template', route.templateId);
    url.searchParams.set('ttab', route.ttab);
  } else {
    // Sair do editor não pode derrubar a aba: só os parâmetros do editor saem.
    url.searchParams.delete('template');
    url.searchParams.delete('ttab');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceTalkXTemplateRoute(route: TalkXTemplateRoute | null): void {
  window.history.replaceState(null, '', formatTalkXTemplateRoute(new URL(window.location.href), route));
}

export function pushTalkXTemplateRoute(route: TalkXTemplateRoute | null): void {
  window.history.pushState(null, '', formatTalkXTemplateRoute(new URL(window.location.href), route));
}
