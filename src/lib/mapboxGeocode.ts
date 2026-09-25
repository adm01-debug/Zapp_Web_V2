// Geocoding do Mapbox (pt-BR) para os dois consumidores de localização: o balão de mensagem
// recebida (só coordenadas — o WhatsApp não manda endereço quando a pessoa compartilha a posição
// atual) e o picker "Compartilhar Localização" (clique no mapa, GPS e busca por endereço).
// Timeout em toda consulta: sem ele uma requisição pendurada deixava o botão Enviar desabilitado
// para sempre e a busca em spinner eterno. Cache SÓ em memória e só do reverso: o resultado do
// geocoding temporário não deve ir para storage nem para o banco. Nunca lança.

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CACHED = 200;

export interface GeoPlace {
  /** Rótulo curto do lugar (`feature.text`), quando o Mapbox devolve. */
  name?: string;
  /** Endereço completo (`feature.place_name`). */
  address: string;
}

export interface GeoSearchPlace extends GeoPlace {
  lat: number;
  lng: number;
}

export type GeoFailureKind = 'aborted' | 'timeout' | 'rate_limited' | 'http' | 'network' | 'not_found';

export type GeoSearchResult = { ok: true; places: GeoSearchPlace[] } | { ok: false; kind: GeoFailureKind };

/** Quantos candidatos a busca devolve para o operador escolher. */
export const SEARCH_RESULT_LIMIT = 5;

export interface GeoProximity { lat: number; lng: number }

// O geocoding v5 é índice de ENDEREÇOS: não conhece estabelecimento por nome e faz fuzzy match
// agressivo — "XBZ BRINDES" casou com "Rua Brendes Pereira da Silva", em Vila Velha/ES (outro
// estado), com relevance 0,46. Abaixo deste corte o resultado é ruído, não resposta.
const MIN_V5_RELEVANCE = 0.8;

const cache = new Map<string, Promise<GeoPlace | null>>();

/** ~1 m de resolução: coordenadas praticamente iguais compartilham a mesma consulta. */
export function coordinateKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

type Feature = { center?: unknown; text?: unknown; place_name?: unknown };

function toPlace(feature: Feature | undefined): GeoPlace | null {
  const address = feature?.place_name;
  if (typeof address !== 'string' || !address) return null;
  const name = typeof feature?.text === 'string' && feature.text ? feature.text : undefined;
  return name ? { name, address } : { address };
}

/**
 * `fetch` com timeout próprio. Devolve o status e o corpo, ou a causa da falha — nunca lança.
 * O `external` cancela a consulta (busca nova substituindo a anterior) sem virar erro na tela.
 */
async function requestJson(
  url: string,
  external?: AbortSignal,
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; kind: GeoFailureKind }> {
  if (external?.aborted) return { ok: false, kind: 'aborted' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const forward = () => controller.abort();
  external?.addEventListener('abort', forward);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) return { ok: false, kind: 'rate_limited' };
    if (!response.ok) return { ok: false, kind: 'http' };
    return { ok: true, status: response.status, data: await response.json() };
  } catch {
    if (timedOut) return { ok: false, kind: 'timeout' };
    if (external?.aborted) return { ok: false, kind: 'aborted' };
    return { ok: false, kind: 'network' };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forward);
  }
}

async function requestPlace(lat: number, lng: number, token: string): Promise<GeoPlace | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&language=pt&limit=1`;
  const result = await requestJson(url);
  if (!result.ok) return null;
  const features = (result.data as { features?: Feature[] } | null)?.features;
  return toPlace(features?.[0]);
}

/**
 * Lugar aproximado de uma coordenada. Uma consulta por coordenada por sessão (em voo também é
 * compartilhada); falha não fica em cache. Sem resposta devolve `null` — quem chama segue só com
 * as coordenadas.
 */
export function reverseGeocodePlace(lat: number, lng: number, token: string): Promise<GeoPlace | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
  const key = coordinateKey(lat, lng);
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = requestPlace(lat, lng, token).then((place) => {
    if (place === null && cache.get(key) === pending) cache.delete(key);
    return place;
  });
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, pending);
  return pending;
}

/** Só o endereço completo da coordenada (usado pelo balão de localização recebida). */
export function reverseGeocodeAddress(lat: number, lng: number, token: string): Promise<string | null> {
  return reverseGeocodePlace(lat, lng, token).then((place) => place?.address ?? null);
}

/** Search Box API: é a única que indexa estabelecimento por nome ("XBZ Brindes"). */
async function searchViaSearchBox(
  term: string,
  token: string,
  proximity?: GeoProximity,
  signal?: AbortSignal,
): Promise<GeoSearchResult | null> {
  const prox = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : '';
  const url = `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(term)}&access_token=${encodeURIComponent(token)}&language=pt&country=BR&limit=${SEARCH_RESULT_LIMIT}${prox}`;
  const result = await requestJson(url, signal);
  if (!result.ok) return result.kind === 'not_found' ? null : { ok: false, kind: result.kind };
  const features = (result.data as { features?: SearchBoxFeature[] } | null)?.features ?? [];
  const places = features.flatMap((feature) => {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') return [];
    const name = feature?.properties?.name;
    const address = feature?.properties?.full_address ?? feature?.properties?.place_formatted ?? '';
    return [{
      lat: coords[1],
      lng: coords[0],
      name: typeof name === 'string' && name ? name : undefined,
      address: typeof address === 'string' ? address : '',
    }];
  });
  if (places.length === 0) return null;
  return { ok: true, places };
}

interface SearchBoxFeature {
  geometry?: { coordinates?: unknown };
  properties?: { name?: unknown; full_address?: unknown; place_formatted?: unknown };
}

/**
 * Busca de endereço por texto, sem cache: a mesma consulta pode legitimamente ser repetida pelo
 * operador. Tenta a Search Box (entende estabelecimento) e só então o geocoding v5 (endereços),
 * descartando match fraco. Devolve a causa da falha para a mensagem certa na tela.
 */
export async function searchPlaces(
  query: string,
  token: string,
  signal?: AbortSignal,
  proximity?: GeoProximity,
): Promise<GeoSearchResult> {
  const term = query.trim();
  if (!term) return { ok: false, kind: 'not_found' };

  const viaBox = await searchViaSearchBox(term, token, proximity, signal);
  if (viaBox) return viaBox;

  const prox = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : '';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json?access_token=${encodeURIComponent(token)}&language=pt&country=br&limit=${SEARCH_RESULT_LIMIT}${prox}`;
  const result = await requestJson(url, signal);
  if (!result.ok) return { ok: false, kind: result.kind };
  const features = (result.data as { features?: Feature[] } | null)?.features ?? [];
  const places = features.flatMap((feature) => {
    // Match fraco do v5 é ruído de outro estado, não resposta.
    const relevance = (feature as { relevance?: unknown }).relevance;
    if (typeof relevance === 'number' && relevance < MIN_V5_RELEVANCE) return [];
    const center = feature?.center;
    if (!Array.isArray(center) || typeof center[0] !== 'number' || typeof center[1] !== 'number') return [];
    const place = toPlace(feature);
    return [{ lat: center[1], lng: center[0], name: place?.name, address: place?.address ?? '' }];
  });
  if (places.length === 0) return { ok: false, kind: 'not_found' };
  return { ok: true, places };
}

export function resetReverseGeocodeCacheForTests(): void {
  cache.clear();
}

// --- Search Box /suggest + /retrieve (autocomplete estilo playground) ---------------------------
// `/suggest` não devolve coordenada (só mapbox_id/name/full_address/feature_type/distance) — a
// coordenada só sai do `/retrieve`, ao escolher. As duas exigem `session_token` (ver
// `mapboxSession.ts`): é o que agrupa N `/suggest` + 1 `/retrieve` como 1 sessão faturável.
//
// Cascata de fallback (Apêndice C do plano — a orquestração abaixo é do hook da Fase 2, que ainda
// não existe; aqui só a camada de API precisa devolver a causa certa pra essa decisão ser possível):
//   /suggest falhou (network/timeout/http) → quem consome cai em `searchPlaces()` (o `/forward`
//     da #737). `rate_limited` NÃO cai no fallback — é limite de uso, não rota quebrada; o hook da
//     Fase 2 trata isso com backoff (E38), não com troca de endpoint.
//   /retrieve devolveu `null` → o padrão é repetir com `searchPlaces(nome da sugestão)`.
//   Telemetria (`reportMapboxFailure`, mesmo padrão de `mapboxToken.ts`) só quando as DUAS etapas
//     falham em sequência nessa mesma busca — nunca a cada `/suggest` isolado, senão vira ruído.
//     Essa contagem dupla só faz sentido dentro do hook que orquestra suggest→retrieve (Fase 2);
//     não há chamada de `audit_logs` aqui porque inventar uma sem esse contexto real de "as duas
//     falharam" registraria falso positivo.

export interface GeoSuggestion {
  id: string;
  name: string;
  address: string;
  kind: 'poi' | 'street' | 'address' | 'place' | 'other';
  distanceMeters?: number;
}

export type GeoSuggestResult = { ok: true; suggestions: GeoSuggestion[] } | { ok: false; kind: GeoFailureKind };

interface SuggestFeature {
  name?: unknown;
  full_address?: unknown;
  place_formatted?: unknown;
  feature_type?: unknown;
  mapbox_id?: unknown;
  distance?: unknown;
}

const SUGGESTION_KINDS = new Set(['poi', 'street', 'address', 'place']);

function toSuggestion(feature: SuggestFeature): GeoSuggestion | null {
  const id = feature.mapbox_id;
  const name = feature.name;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !name) return null;
  const address = feature.full_address ?? feature.place_formatted;
  const kindRaw = feature.feature_type;
  const kind = typeof kindRaw === 'string' && SUGGESTION_KINDS.has(kindRaw) ? kindRaw as GeoSuggestion['kind'] : 'other';
  const suggestion: GeoSuggestion = {
    id,
    name,
    address: typeof address === 'string' ? address : '',
    kind,
  };
  if (typeof feature.distance === 'number') suggestion.distanceMeters = feature.distance;
  return suggestion;
}

/**
 * Autocomplete enquanto o operador digita. Nunca lança; string vazia/só espaço não vai à rede.
 * `opts.session` é obrigatório (billing por sessão) — quem chama pega de `getSearchSession()`.
 */
export async function suggestPlaces(
  query: string,
  token: string,
  opts: { session: string; proximity?: GeoProximity; signal?: AbortSignal },
): Promise<GeoSuggestResult> {
  const term = query.trim();
  if (!term) return { ok: false, kind: 'not_found' };

  const prox = opts.proximity ? `&proximity=${opts.proximity.lng},${opts.proximity.lat}` : '';
  const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(term)}&session_token=${encodeURIComponent(opts.session)}&access_token=${encodeURIComponent(token)}&language=pt&country=br&limit=${SEARCH_RESULT_LIMIT}${prox}`;
  const result = await requestJson(url, opts.signal);
  if (!result.ok) return { ok: false, kind: result.kind };
  const features = (result.data as { suggestions?: SuggestFeature[] } | null)?.suggestions ?? [];
  const suggestions = features.flatMap((feature) => {
    const suggestion = toSuggestion(feature);
    return suggestion ? [suggestion] : [];
  });
  return { ok: true, suggestions };
}

/**
 * Coordenada do `mapbox_id` escolhido na lista de sugestões. `null` quando o request falhou ou a
 * resposta não trouxe coordenada válida — quem chama decide o fallback (Fase 2: `searchPlaces`
 * com o nome da sugestão).
 */
export async function retrievePlace(
  mapboxId: string,
  token: string,
  opts: { session: string; signal?: AbortSignal },
): Promise<GeoSearchPlace | null> {
  const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}?session_token=${encodeURIComponent(opts.session)}&access_token=${encodeURIComponent(token)}`;
  const result = await requestJson(url, opts.signal);
  if (!result.ok) return null;
  const features = (result.data as { features?: SearchBoxFeature[] } | null)?.features;
  const coords = features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') return null;
  const properties = features?.[0]?.properties;
  const name = properties?.name;
  const address = properties?.full_address ?? properties?.place_formatted;
  return {
    lat: coords[1],
    lng: coords[0],
    name: typeof name === 'string' && name ? name : undefined,
    address: typeof address === 'string' ? address : '',
  };
}
