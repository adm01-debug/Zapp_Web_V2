import type mapboxgl from 'mapbox-gl';

export type MapboxModule = typeof mapboxgl;

let pending: Promise<MapboxModule> | null = null;

// mapbox-gl pesa ~1.9 MB (508 KB gzip). Importado estaticamente ele entra no
// grafo do entry e vira modulepreload no index.html — pago por todo usuário no
// first paint, mesmo sem nenhuma mensagem de localização na tela. O import
// dinâmico (JS + CSS) só baixa o chunk vendor-maps quando um mapa é renderizado.
export function loadMapbox(): Promise<MapboxModule> {
  if (!pending) {
    pending = Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')])
      .then(([mod]) => mod.default)
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}
