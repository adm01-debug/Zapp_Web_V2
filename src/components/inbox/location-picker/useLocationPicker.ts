import { useState, useEffect, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';
import type mapboxgl from 'mapbox-gl';
import { loadMapbox, type MapboxModule } from '@/lib/mapboxLoader';
import {
  getMapboxToken,
  mapboxFailureKindFromMapError,
  mapboxFailureKindOf,
  mapboxFailureMessage,
  reportMapboxFailure,
  MAPBOX_MAP_LOAD_TIMEOUT_MS,
} from '@/lib/mapboxToken';

interface SelectedLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

const DEFAULT_CENTER: [number, number] = [-46.6333, -23.5505];

export function useLocationPicker(open: boolean, activeTab: 'map' | 'current') {
  // Callback ref com estado, e nao useRef: o Radix Tabs monta os filhos da aba num
  // render posterior ao da troca (`children: present && children`, com o `present`
  // virando true so no layout-effect do Presence). Com useRef o effect do mapa rodava
  // com `.current` ainda null, saia no early-return e nunca mais era reexecutado —
  // spinner eterno, sem mapa, sem watchdog e sem erro. Com estado, a chegada do
  // container reexecuta o effect.
  const [mapNode, setMapNode] = useState<HTMLDivElement | null>(null);
  const mapContainer = useCallback((node: HTMLDivElement | null) => { setMapNode(node); }, []);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const mapboxRef = useRef<MapboxModule | null>(null);
  // Coordenada que chegou (busca/GPS) antes do chunk do Mapbox resolver: aplicada no 'load'.
  const pendingMarker = useRef<[number, number] | null>(null);
  // Espelho de selectedLocation: o effect do mapa recria o marcador ao voltar para a aba
  // sem precisar reexecutar a cada nova seleção.
  const selectedRef = useRef<SelectedLocation | null>(null);
  // Só a última busca/clique vale: a anterior é cancelada para não sobrescrever o resultado.
  const geoAbort = useRef<AbortController | null>(null);

  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

  const select = useCallback((location: SelectedLocation | null) => {
    selectedRef.current = location;
    setSelectedLocation(location);
  }, []);

  const nextGeoSignal = useCallback((): AbortSignal => {
    geoAbort.current?.abort();
    const controller = new AbortController();
    geoAbort.current = controller;
    return controller.signal;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMapboxToken({ force: mapAttempt > 0 })
      .then((token) => { if (!cancelled) setMapboxToken(token); })
      .catch((err) => {
        if (cancelled) return;
        const kind = mapboxFailureKindOf(err);
        reportMapboxFailure(kind, 'picker', err);
        setMapError(mapboxFailureMessage(kind));
      });
    return () => { cancelled = true; };
  }, [open, mapAttempt]);

  const updateMarker = useCallback((lng: number, lat: number) => {
    const mapboxgl = mapboxRef.current;
    if (!map.current || !mapboxgl) {
      pendingMarker.current = [lng, lat];
      return;
    }
    if (marker.current) {
      marker.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.innerHTML = `<div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg animate-bounce"><svg class="w-5 h-5 text-primary-foreground" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;
      marker.current = new mapboxgl.Marker(el, { anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map.current);
    }
    map.current.flyTo({ center: [lng, lat], zoom: 16 });
  }, []);

  const reverseGeocode = useCallback(async (lng: number, lat: number) => {
    // O endereço é opcional: sem token (ou sem resposta do Mapbox) a coordenada continua
    // valendo, senão o GPS "funciona" mas o botão Enviar nunca habilita.
    if (!mapboxToken) { select({ lat, lng }); return; }
    const signal = nextGeoSignal();
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&language=pt`, { signal });
      const data = response.ok ? await response.json() : null;
      if (signal.aborted) return;
      const feature = data?.features?.[0];
      select(feature ? { lat, lng, name: feature.text, address: feature.place_name } : { lat, lng });
    } catch (error) {
      if (signal.aborted) return;
      log.error('Error reverse geocoding:', error);
      select({ lat, lng });
    }
  }, [mapboxToken, nextGeoSignal, select]);

  useEffect(() => {
    if (!mapNode || !mapboxToken || !open || activeTab !== 'map') return;
    let cancelled = false;
    let loaded = false;
    setMapError(null);
    // Sem `load` nem `error` no prazo (chunk, estilo ou tiles pendurados): vira erro com retry.
    const watchdog = setTimeout(() => {
      if (loaded || cancelled) return;
      reportMapboxFailure('timeout', 'picker');
      setMapError(mapboxFailureMessage('timeout'));
    }, MAPBOX_MAP_LOAD_TIMEOUT_MS);
    loadMapbox().then((mapboxgl) => {
      if (cancelled) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = mapboxToken;
      // Voltar para a aba do mapa recria o mapa: centraliza direto na seleção existente.
      const restored = selectedRef.current;
      map.current = new mapboxgl.Map({
        container: mapNode,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: restored ? [restored.lng, restored.lat] : DEFAULT_CENTER,
        zoom: restored ? 16 : 12,
      });
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      // Token invalido, estilo ou rede falham no 'error' do mapa, nao no loadMapbox().
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
        const current = selectedRef.current;
        const target = pendingMarker.current ?? (current ? ([current.lng, current.lat] as [number, number]) : null);
        pendingMarker.current = null;
        if (target) updateMarker(target[0], target[1]);
      });
      map.current.on('click', async (e) => { const { lng, lat } = e.lngLat; updateMarker(lng, lat); await reverseGeocode(lng, lat); });
    }).catch((err) => {
      if (cancelled) return;
      const kind = mapboxFailureKindOf(err);
      reportMapboxFailure(kind, 'picker', err);
      setMapError(mapboxFailureMessage(kind));
    });
    return () => { cancelled = true; clearTimeout(watchdog); map.current?.remove(); map.current = null; marker.current = null; setIsMapLoaded(false); };
  }, [mapNode, mapboxToken, open, activeTab, mapAttempt, updateMarker, reverseGeocode]);

  // Fechar o picker descarta a coordenada pendente; um retry do mapa a preserva.
  useEffect(() => { if (!open) pendingMarker.current = null; }, [open]);

  const retryMap = useCallback(() => { setMapError(null); setMapAttempt((n) => n + 1); }, []);

  const getCurrentLocation = useCallback(() => {
    setIsLoadingLocation(true);
    if (!navigator.geolocation) {
      toast({ title: 'Não suportado', description: 'Geolocalização não é suportada pelo seu navegador.', variant: 'destructive' });
      setIsLoadingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => { const { latitude, longitude } = position.coords; updateMarker(longitude, latitude); await reverseGeocode(longitude, latitude); setIsLoadingLocation(false); },
      (error) => { log.error('Error getting location:', error); toast({ title: 'Erro ao obter localização', description: 'Verifique se a permissão de localização está ativada.', variant: 'destructive' }); setIsLoadingLocation(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [updateMarker, reverseGeocode]);

  const searchLocation = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    if (!mapboxToken) {
      toast({ title: 'Busca indisponível', description: 'O serviço de mapas não respondeu. Use "Tentar novamente" no mapa.', variant: 'destructive' });
      return;
    }
    const signal = nextGeoSignal();
    setIsSearching(true);
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&language=pt&country=br`, { signal });
      if (!response.ok) {
        const limited = response.status === 429;
        toast({ title: limited ? 'Muitas buscas seguidas' : 'Falha na busca', description: limited ? 'Aguarde um instante e tente de novo.' : 'Não foi possível consultar o endereço. Tente novamente.', variant: 'destructive' });
        return;
      }
      const data = await response.json();
      if (signal.aborted) return;
      const feature = data.features?.[0];
      if (feature) {
        const [lng, lat] = feature.center;
        updateMarker(lng, lat);
        select({ lat, lng, name: feature.text, address: feature.place_name });
      } else {
        toast({ title: 'Local não encontrado', description: 'Tente buscar por outro endereço.', variant: 'destructive' });
      }
    } catch (error) {
      if (signal.aborted) return;
      log.error('Error searching location:', error);
      toast({ title: 'Falha na busca', description: 'Verifique sua conexão e tente novamente.', variant: 'destructive' });
    } finally { setIsSearching(false); }
  }, [searchQuery, mapboxToken, updateMarker, nextGeoSignal, select]);

  const reset = useCallback(() => {
    geoAbort.current?.abort();
    pendingMarker.current = null;
    select(null);
    setSearchQuery('');
    setIsSearching(false);
  }, [select]);

  return {
    mapContainer, isMapLoaded, mapError, retryMap, isLoadingLocation, searchQuery, setSearchQuery, isSearching,
    selectedLocation, getCurrentLocation, searchLocation, reset,
  };
}
