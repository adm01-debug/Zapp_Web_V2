// Rota da tela de segmentos do Talk X (tela 03), no mesmo padrão de
// `talkxWizardRoute.ts`: o endereço diz qual segmento está aberto no construtor —
// `?view=talkx&tab=segments&segment=<id>&mode=edit|new`. Quem formata parte do
// endereço atual e mexe só nos seus próprios parâmetros (`view`, `tab`, `segment`,
// `mode`), para não derrubar o que as outras trilhas do módulo escrevem ali
// (sub do módulo, wizard/step de uma campanha).

export type TalkXSegmentsRoute = {
  /** Segmento aberto no construtor; `null` = segmento novo, ainda sem id. */
  segmentId: string | null;
  mode: 'edit' | 'new';
};

export type ParsedTalkXSegmentsRoute = {
  route: TalkXSegmentsRoute | null;
  /** O chamador deve reescrever o endereço sem criar entrada no histórico. */
  needsNormalization: boolean;
};

const SEGMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function readSingle(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : null;
}

/**
 * Lê só a parte de segmentos do query string. `route: null` é a biblioteca — o
 * estado normal da tela — enquanto `needsNormalization` diz que o endereço
 * pediu algo inválido (ou incompleto) e precisa ser reescrito.
 */
export function parseTalkXSegmentsRoute(search: string): ParsedTalkXSegmentsRoute {
  const params = new URLSearchParams(search);
  const view = readSingle(params, 'view');
  const tab = readSingle(params, 'tab');
  const rawSegment = readSingle(params, 'segment');
  const rawMode = readSingle(params, 'mode');

  // Sem nenhum dos dois parâmetros ninguém pediu construtor: a biblioteca é a tela.
  if (rawSegment === undefined && rawMode === undefined) {
    return { route: null, needsNormalization: false };
  }

  // Parâmetro duplicado é endereço ambíguo, e um `segment` fora da tela de
  // segmentos não pode abrir construtor nenhum: cai na biblioteca.
  if (view !== 'talkx' || tab !== 'segments' || rawSegment === null || rawMode === null) {
    return { route: null, needsNormalization: true };
  }

  if (rawMode === 'new') {
    // `mode=new` abre o construtor VAZIO; um segmento junto seria contraditório.
    if (rawSegment !== undefined) return { route: null, needsNormalization: true };
    return { route: { segmentId: null, mode: 'new' }, needsNormalization: false };
  }

  // `mode` só pode ser edit ou new; ausente com um segmento na URL, o endereço
  // está incompleto e é completado como edit (mesma ideia do passo do wizard).
  if (rawMode !== undefined && rawMode !== 'edit') {
    return { route: null, needsNormalization: true };
  }

  // `mode=edit` sem id (ou com id que não tem cara de id) não tem o que abrir.
  if (rawSegment === undefined || rawSegment === '' || !SEGMENT_ID.test(rawSegment)) {
    return { route: null, needsNormalization: true };
  }

  // `segment=<id>` sozinho abre o construtor do segmento; o endereço canônico
  // carrega o `mode=edit` explícito, por isso pede reescrita.
  return { route: { segmentId: rawSegment, mode: 'edit' }, needsNormalization: rawMode === undefined };
}

export function formatTalkXSegmentsRoute(current: URL, route: TalkXSegmentsRoute | null): string {
  const url = new URL(current.href);
  if (route) {
    url.searchParams.set('view', 'talkx');
    url.searchParams.set('tab', 'segments');
    if (route.segmentId) url.searchParams.set('segment', route.segmentId);
    else url.searchParams.delete('segment');
    url.searchParams.set('mode', route.mode);
  } else {
    url.searchParams.delete('segment');
    url.searchParams.delete('mode');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceTalkXSegmentsRoute(route: TalkXSegmentsRoute | null): void {
  window.history.replaceState(null, '', formatTalkXSegmentsRoute(new URL(window.location.href), route));
}

export function pushTalkXSegmentsRoute(route: TalkXSegmentsRoute | null): void {
  window.history.pushState(null, '', formatTalkXSegmentsRoute(new URL(window.location.href), route));
}
