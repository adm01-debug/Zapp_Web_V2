import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, ExternalLink, Clock, Radio } from 'lucide-react';
import { log } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LocationMessage as LocationMessageType } from '@/types/chat';
import { supabase } from '@/integrations/supabase/client';
import type mapboxgl from 'mapbox-gl';
import { loadMapbox } from '@/lib/mapboxLoader';

interface LocationMessageDisplayProps {
  location: LocationMessageType;
  isSent: boolean;
}

export function LocationMessageDisplay({ location, isSent }: LocationMessageDisplayProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    // Fetch Mapbox token from edge function
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (!error && data?.token) {
          setMapboxToken(data.token);
        }
      } catch (err) {
        log.error('Error fetching Mapbox token:', err);
      }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    let cancelled = false;

    loadMapbox()
      .then((mapboxgl) => {
        if (cancelled || !mapContainer.current) return;

        mapboxgl.accessToken = mapboxToken;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [location.longitude, location.latitude],
          zoom: 15,
          interactive: false,
        });

        // Add marker
        const el = document.createElement('div');
        el.className = 'location-marker';
        el.innerHTML = `
          <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg ${location.isLive ? 'animate-pulse ring-4 ring-primary/30' : ''}">
            <svg class="w-4 h-4 text-primary-foreground" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `;

        marker.current = new mapboxgl.Marker(el)
          .setLngLat([location.longitude, location.latitude])
          .addTo(map.current);

        map.current.on('load', () => {
          setIsMapLoaded(true);
        });
      })
      .catch((err) => {
        log.error('Error loading Mapbox:', err);
        if (!cancelled) setMapError(true);
      });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, location.latitude, location.longitude, location.isLive]);

  const openInMaps = () => {
    const url = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-2"
    >
      {/* Live indicator */}
      {location.isLive && (
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
          isSent 
            ? "bg-primary-foreground/20 text-primary-foreground" 
            : "bg-success/10 text-success"
        )}>
          <Radio className="w-3 h-3 animate-pulse" />
          <span>Localização em tempo real</span>
          {location.liveUntil && (
            <span className="opacity-70">
              · até {new Date(location.liveUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* Map container */}
      <div className="relative rounded-lg overflow-hidden">
        <div 
          ref={mapContainer} 
          className="w-full h-32 bg-muted"
          style={{ minWidth: '200px' }}
        />
        
        {!isMapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted px-2 text-center text-xs text-muted-foreground">
            Mapa indisponível — abra a localização pelos botões abaixo.
          </div>
        )}
      </div>

      {/* Location info */}
      <div className="space-y-1">
        {location.name && (
          <p className={cn(
            "font-medium text-sm",
            isSent ? "text-primary-foreground" : "text-foreground"
          )}>
            {location.name}
          </p>
        )}
        {location.address && (
          <p className={cn(
            "text-xs",
            isSent ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {location.address}
          </p>
        )}
        <p className={cn(
          "text-[10px] font-mono",
          isSent ? "text-primary-foreground/50" : "text-muted-foreground/70"
        )}>
          {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant={isSent ? "secondary" : "outline"}
          className={cn(
            "flex-1 h-7 text-xs gap-1",
            isSent && "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0"
          )}
          onClick={openInMaps}
        >
          <ExternalLink className="w-3 h-3" />
          Abrir
        </Button>
        <Button
          size="sm"
          variant={isSent ? "secondary" : "outline"}
          className={cn(
            "flex-1 h-7 text-xs gap-1",
            isSent && "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0"
          )}
          onClick={getDirections}
        >
          <Navigation className="w-3 h-3" />
          Rotas
        </Button>
      </div>
    </motion.div>
  );
}
