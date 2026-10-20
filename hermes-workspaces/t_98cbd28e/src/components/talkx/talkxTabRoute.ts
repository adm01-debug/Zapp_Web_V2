// Rota de abas do Talk X. A aba ativa vive em ?tab= e a sub-visão em sub=,
// convivendo com os parâmetros do wizard (view/wizard/step em talkxWizardRoute.ts).
// goTab é exportado para os filhos navegarem sem depender do estado interno do
// TalkXView: atualiza a URL e dispara popstate, que o TalkXView escuta e reflete.

export function goTab(tab: string, sub?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  if (sub) url.searchParams.set('sub', sub);
  else url.searchParams.delete('sub');
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function readTab(search: string): string {
  const t = new URLSearchParams(search).get('tab');
  return t ?? 'overview';
}

export function readSub(search: string): string | undefined {
  return new URLSearchParams(search).get('sub') ?? undefined;
}
