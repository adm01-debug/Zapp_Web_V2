import { useState } from 'react';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { MapPin, Search, Crosshair, Clock, Radio, Loader2, Send, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/ui/use-toast';
import { LocationMessage } from '@/types/chat';
import { useLocationPicker } from './location-picker/useLocationPicker';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LocationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (location: LocationMessage) => void;
}

export function LocationPicker({ open, onOpenChange, onSend }: LocationPickerProps) {
  const [isLive, setIsLive] = useState(false);
  const [liveDuration, setLiveDuration] = useState('15');
  const [activeTab, setActiveTab] = useState<'map' | 'current'>('current');

  const { mapContainer, isMapLoaded, isLoadingLocation, searchQuery, setSearchQuery, isSearching, selectedLocation, getCurrentLocation, searchLocation, reset } = useLocationPicker(open, activeTab);

  const handleSend = () => {
    if (!selectedLocation) { toast({ title: 'Selecione uma localização', description: 'Clique no mapa ou use sua localização atual.', variant: 'destructive' }); return; }
    onSend({
      latitude: selectedLocation.lat, longitude: selectedLocation.lng, name: selectedLocation.name, address: selectedLocation.address, isLive,
      ...(isLive && { liveUntil: new Date(Date.now() + parseInt(liveDuration) * 60 * 1000) }),
    });
    handleClose();
  };

  const handleClose = () => { reset(); setIsLive(false); setLiveDuration('15'); setActiveTab('current'); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />Compartilhar Localização</DialogTitle>
          <DialogDescription>Envie sua localização ou escolha um ponto no mapa</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'map' | 'current')} className="w-full">
          <div className="px-4 pt-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current" className="gap-2"><LocateFixed className="w-4 h-4" />Minha Localização</TabsTrigger>
              <TabsTrigger value="map" className="gap-2"><MapPin className="w-4 h-4" />Escolher no Mapa</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="current" className="mt-0 p-4 space-y-4">
            <Button onClick={getCurrentLocation} disabled={isLoadingLocation} className="w-full gap-2" size="lg">
              {isLoadingLocation ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crosshair className="w-5 h-5" />}
              {isLoadingLocation ? 'Obtendo localização...' : 'Usar localização atual'}
            </Button>
            {selectedLocation && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-lg bg-muted/50 border border-border space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    {selectedLocation.name && <p className="font-medium text-sm">{selectedLocation.name}</p>}
                    {selectedLocation.address && <p className="text-xs text-muted-foreground line-clamp-2">{selectedLocation.address}</p>}
                    <p className="text-[10px] font-mono text-muted-foreground/70 mt-1">{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="map" className="mt-0 space-y-0">
            <div className="p-4 pb-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar endereço..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchLocation()} className="pl-9" />
                </div>
                <Button variant="outline" onClick={searchLocation} disabled={isSearching}>{isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}</Button>
              </div>
            </div>
            <div className="relative">
              <div ref={mapContainer} className="w-full h-64 bg-muted" />
              {!isMapLoaded && <div className="absolute inset-0 flex items-center justify-center bg-muted"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
              <Button size="icon" variant="secondary" className="absolute bottom-3 right-3 shadow-lg" onClick={getCurrentLocation} disabled={isLoadingLocation}>
                {isLoadingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
              </Button>
            </div>
            {selectedLocation && (
              <div className="p-4 pt-2">
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      {selectedLocation.name && <p className="font-medium text-sm">{selectedLocation.name}</p>}
                      {selectedLocation.address && <p className="text-xs text-muted-foreground line-clamp-1">{selectedLocation.address}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="px-4 py-3 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className={cn("w-4 h-4", isLive && "text-success animate-pulse")} />
              <div>
                <Label htmlFor="live-toggle" className="text-sm font-medium cursor-pointer">Localização em tempo real</Label>
                <p className="text-[10px] text-muted-foreground">Compartilhar atualizações contínuas</p>
              </div>
            </div>
            <Switch id="live-toggle" checked={isLive} onCheckedChange={setIsLive} />
          </div>
          {isLive && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3">
              <Label className="text-xs text-muted-foreground">Duração</Label>
              <Select value={liveDuration} onValueChange={setLiveDuration}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="480">8 horas</SelectItem>
                </SelectContent>
              </Select>
            </motion.div>
          )}
        </div>

        <DialogFooter className="p-4 pt-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!selectedLocation} className="gap-2"><Send className="w-4 h-4" />Enviar Localização</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
