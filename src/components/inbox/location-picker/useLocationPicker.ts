import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';
import type mapboxgl from 'mapbox-gl';
import { loadMapbox, type MapboxModule } from '@/lib/mapboxLoader';

const MAP_LOAD_ERROR = 'Não foi possível carregar o mapa.';

interface SelectedLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

export function useLocationPicker(open: boolean, activeTab: 'map' | 'current') {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const mapboxRef = useRef<MapboxModule | null>(null);
  // Coordenada que chegou (busca/GPS) antes do chunk do Mapbox resolver: aplicada no 'load'.
  const pendingMarker = useRef<[number, number] | null>(null);

  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase.functions.invoke('get-mapbox-token').then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data?.token) setMapboxToken(data.token);
      else setMapError(MAP_LOAD_ERROR);
    }).catch(err => { log.error('Error fetching Mapbox token:', err); if (!cancelled) setMapError(MAP_LOAD_ERROR); });
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
    if (!mapboxToken) return;
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&language=pt`);
      const data = await response.json();
      if (data.features?.length > 0) {
        setSelectedLocation({ lat, lng, name: data.features[0].text, address: data.features[0].place_name });
      } else {
        setSelectedLocation({ lat, lng });
      }
    } catch (error) {
      log.error('Error reverse geocoding:', error);
      setSelectedLocation({ lat, lng });
    }
  }, [mapboxToken]);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || !open || activeTab !== 'map') return;
    let cancelled = false;
    let loaded = false;
    setMapError(null);
    loadMapbox().then((mapboxgl) => {
      if (cancelled || !mapContainer.current) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = mapboxToken;
      map.current = new mapboxgl.Map({ container: mapContainer.current, style: 'mapbox://styles/mapbox/streets-v12', center: [-46.6333, -23.5505], zoom: 12 });
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      // Token invalido, estilo ou rede falham no 'error' do mapa, nao no loadMapbox().
      map.current.on('error', (e) => {
        if (loaded || cancelled) return;
        log.error('Mapbox map error:', e.error);
        setMapError(MAP_LOAD_ERROR);
      });
      map.current.on('load', () => {
        loaded = true;
        setIsMapLoaded(true);
        if (pendingMarker.current) {
          const [lng, lat] = pendingMarker.current;
          pendingMarker.current = null;
          updateMarker(lng, lat);
        }
      });
      map.current.on('click', async (e) => { const { lng, lat } = e.lngLat; updateMarker(lng, lat); await reverseGeocode(lng, lat); });
    }).catch((err) => {
      log.error('Error loading Mapbox:', err);
      if (!cancelled) setMapError(MAP_LOAD_ERROR);
    });
    return () => { cancelled = true; pendingMarker.current = null; map.current?.remove(); map.current = null; marker.current = null; setIsMapLoaded(false); };
  }, [mapboxToken, open, activeTab, mapAttempt, updateMarker, reverseGeocode]);

  const retryMap = useCallback(() => setMapAttempt((n) => n + 1), []);

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
    if (!searchQuery.trim() || !mapboxToken) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&language=pt&country=br`);
      const data = await response.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].center;
        updateMarker(lng, lat);
        setSelectedLocation({ lat, lng, name: data.features[0].text, address: data.features[0].place_name });
      } else {
        toast({ title: 'Local não encontrado', description: 'Tente buscar por outro endereço.', variant: 'destructive' });
      }
    } catch (error) { log.error('Error searching location:', error); }
    finally { setIsSearching(false); }
  }, [searchQuery, mapboxToken, updateMarker]);

  const reset = useCallback(() => {
    pendingMarker.current = null;
    setSelectedLocation(null);
    setSearchQuery('');
  }, []);

  return {
    mapContainer, isMapLoaded, mapError, retryMap, isLoadingLocation, searchQuery, setSearchQuery, isSearching,
    selectedLocation, getCurrentLocation, searchLocation, reset,
  };
}
