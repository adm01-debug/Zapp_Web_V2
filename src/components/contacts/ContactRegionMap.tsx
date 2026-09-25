import { useCallback, useEffect, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { Button } from '@/components/ui/button';
import { loadMapbox } from '@/lib/mapboxLoader';
import {
  getMapboxToken,
  mapboxFailureKindFromMapError,
  mapboxFailureKindOf,
  mapboxFailureMessage,
  reportMapboxFailure,
  MAPBOX_MAP_LOAD_TIMEOUT_MS,
} from '@/lib/mapboxToken';
import { BRAZIL_CENTER, regionCoordinates } from './contactRegionGeo';

export interface RegionBubble {
  region: string;
  count: number;
}

interface ContactRegionMapProps {
  regions: RegionBubble[];
  selectedRegion: string | null;
  onSelectRegion: (region: string) => void;
}

/** Bolha proporcional: raiz quadrada para a área crescer com a contagem, não o diâmetro. */
function bubbleSize(count: number, max: number): number {
  const ratio = Math.sqrt(count) / Math.sqrt(Math.max(max, 1));
  return Math.round(22 + ratio * 26);
}

export function ContactRegionMap({ regions, selectedRegion, onSelectRegion }: ContactRegionMapProps) {
  // Callback ref com estado (mesmo padrão do picker, #688): o container pode chegar num render
  // posterior ao do effect, e com useRef o mapa nunca seria criado.
  const [mapNode, setMapNode] = useState<HTMLDivElement | null>(null);
  const mapContainer = useCallback((node: HTMLDivElement | null) => { setMapNode(node); }, []);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // O callback fica num ref para o effect das bolhas não depender da identidade da função
  // (o pai recria a arrow a cada render, e redesenhar marcador à toa pisca a tela).
  const onSelectRef = useRef(onSelectRegion);
  useEffect(() => { onSelectRef.current = onSelectRegion; }, [onSelectRegion]);

  const plotted = regions.filter((r) => regionCoordinates(r.region) !== null);
  const hidden = regions.length - plotted.length;
  const maxCount = plotted.reduce((max, r) => Math.max(max, r.count), 0);
  // Assinatura das bolhas: só redesenha quando região/contagem realmente mudam.
  const signature = plotted.map((r) => `${r.region}:${r.count}`).join('|');

  useEffect(() => {
    let cancelled = false;
    getMapboxToken({ force: attempt > 0 })
      .then((token) => { if (!cancelled) setMapboxToken(token); })
      .catch((err) => {
        if (cancelled) return;
        const kind = mapboxFailureKindOf(err);
        reportMapboxFailure(kind, 'picker', err);
        setMapError(mapboxFailureMessage(kind));
      });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!mapNode || !mapboxToken) return;
    let cancelled = false;
    let loaded = false;
    const watchdog = setTimeout(() => {
      if (loaded || cancelled) return;
      reportMapboxFailure('timeout', 'picker');
      setMapError(mapboxFailureMessage('timeout'));
    }, MAPBOX_MAP_LOAD_TIMEOUT_MS);

    loadMapbox().then((mapboxgl) => {
      if (cancelled) return;
      setMapError(null);
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = mapboxToken;
      map.current = new mapboxgl.Map({
        container: mapNode,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: BRAZIL_CENTER,
        zoom: 3,
      });
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.current.on('error', (e) => {
        if (loaded || cancelled) return;
        const kind = mapboxFailureKindFromMapError(e.error);
        reportMapboxFailure(kind, 'picker', e.error);
        setMapError(mapboxFailureMessage(kind));
      });
      map.current.on('load', () => {
        loaded = true;
        clearTimeout(watchdog);
        setMapError(null);
        setIsMapLoaded(true);
      });
    }).catch((err) => {
      if (cancelled) return;
      const kind = mapboxFailureKindOf(err);
      reportMapboxFailure(kind, 'picker', err);
      setMapError(mapboxFailureMessage(kind));
    });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
      setIsMapLoaded(false);
    };
  }, [mapNode, mapboxToken, attempt]);

  // Bolhas: refeitas quando a lista muda; o mapa em si não é recriado.
  useEffect(() => {
    const mapboxgl = mapboxRef.current;
    if (!map.current || !mapboxgl || !isMapLoaded) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (plotted.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    plotted.forEach(({ region, count }) => {
      const coords = regionCoordinates(region);
      if (!coords) return;
      const size = bubbleSize(count, maxCount);
      const el = document.createElement('button');
      el.type = 'button';
      el.title = `${region} · ${count} contato${count !== 1 ? 's' : ''}`;
      el.setAttribute('aria-label', el.title);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.className =
        'rounded-full bg-primary/80 text-primary-foreground text-3xs font-semibold ' +
        'flex items-center justify-center shadow-lg ring-2 ring-background cursor-pointer ' +
        'transition-transform hover:scale-110';
      el.textContent = String(count);
      el.addEventListener('click', () => onSelectRef.current(region));
      markers.current.push(new mapboxgl.Marker(el).setLngLat(coords).addTo(map.current!));
      bounds.extend(coords);
    });
    if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
  // `signature` cobre região+contagem; `plotted`/`maxCount` derivam dela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isMapLoaded]);

  // Destaque da região aberta nos cartões abaixo do mapa.
  useEffect(() => {
    markers.current.forEach((marker) => {
      const el = marker.getElement();
      const isSelected = el.title.startsWith(`${selectedRegion} ·`);
      el.style.outline = isSelected ? '3px solid hsl(var(--primary))' : '';
      el.style.outlineOffset = isSelected ? '2px' : '';
    });
  }, [selectedRegion, signature]);

  return (
    <div className="space-y-1">
      <div className="relative rounded-lg overflow-hidden border border-border/40">
        <div ref={mapContainer} className="w-full h-64 bg-muted" />
        {!isMapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
            <span>{mapError}</span>
            <Button size="sm" variant="outline" onClick={() => { setMapError(null); setAttempt((n) => n + 1); }}>
              Tentar novamente
            </Button>
          </div>
        )}
      </div>
      <p className="text-3xs text-muted-foreground/70">
        Posição aproximada pela região do DDD, não pelo endereço do cliente.
        {hidden > 0 && ` ${hidden} região${hidden !== 1 ? 'ões' : ''} sem ponto conhecido ficam só nos cartões abaixo.`}
      </p>
    </div>
  );
}
