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

export type GeoSearchResult = { ok: true; place: GeoSearchPlace } | { ok: false; kind: GeoFailureKind };

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

/**
 * Busca de endereço por texto (forward geocoding), sem cache: a mesma consulta pode legitimamente
 * ser repetida pelo operador. Devolve a causa da falha para a mensagem certa na tela.
 */
export async function searchPlace(query: string, token: string, signal?: AbortSignal): Promise<GeoSearchResult> {
  const term = query.trim();
  if (!term) return { ok: false, kind: 'not_found' };
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json?access_token=${encodeURIComponent(token)}&language=pt&country=br&limit=1`;
  const result = await requestJson(url, signal);
  if (!result.ok) return { ok: false, kind: result.kind };
  const feature = (result.data as { features?: Feature[] } | null)?.features?.[0];
  const center = feature?.center;
  const place = toPlace(feature);
  if (!Array.isArray(center) || typeof center[0] !== 'number' || typeof center[1] !== 'number') {
    return { ok: false, kind: 'not_found' };
  }
  return { ok: true, place: { lat: center[1], lng: center[0], name: place?.name, address: place?.address ?? '' } };
}

export function resetReverseGeocodeCacheForTests(): void {
  cache.clear();
}
