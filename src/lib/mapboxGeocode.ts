// Endereço aproximado de uma coordenada (Mapbox reverse geocoding, pt-BR), para localizações
// recebidas que chegam só com latitude/longitude (o WhatsApp não manda endereço quando a pessoa
// compartilha a posição atual). Cache SÓ em memória: o resultado do geocoding temporário não deve
// ir para storage nem para o banco. Nunca lança: sem endereço, o balão segue só com as coordenadas.

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CACHED = 200;
const cache = new Map<string, Promise<string | null>>();

/** ~1 m de resolução: coordenadas praticamente iguais compartilham a mesma consulta. */
export function coordinateKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

async function request(lat: number, lng: number, token: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&language=pt&limit=1`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: Array<{ place_name?: unknown }> };
    const name = data.features?.[0]?.place_name;
    return typeof name === 'string' && name ? name : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Uma consulta por coordenada por sessão (em voo também é compartilhada). Falha não fica em cache. */
export function reverseGeocodeAddress(lat: number, lng: number, token: string): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
  const key = coordinateKey(lat, lng);
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = request(lat, lng, token).then((address) => {
    if (address === null && cache.get(key) === pending) cache.delete(key);
    return address;
  });
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, pending);
  return pending;
}

export function resetReverseGeocodeCacheForTests(): void {
  cache.clear();
}
