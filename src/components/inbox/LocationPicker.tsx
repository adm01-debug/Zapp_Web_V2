import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { MapPin, Search, Crosshair, Clock, Loader2, Send, LocateFixed, Route, Building2, Milestone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';
import { LocationMessage } from '@/types/chat';
import { useFeatureFlag } from '@/hooks/system/useFeatureFlag';
import { HighlightedText } from './chat/HighlightedText';
import { SuggestionList } from './location-picker/SuggestionList';
import { searchFailureText } from './location-picker/searchErrors';
import { useLocationPicker } from './location-picker/useLocationPicker';
import { useAddressAutocomplete } from './location-picker/useAddressAutocomplete';
import type { GeoSuggestion } from '@/lib/mapboxGeocode';


interface LocationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (location: LocationMessage) => Promise<void> | void;
}

// Ícone por tipo de sugestão e formatação de distância vivem em `location-picker/SuggestionList.tsx`
// (E32): os dois consumidores da lista — este picker e o cadastro de contato — usam os mesmos.

const ADDRESS_LISTBOX_ID = 'location-picker-address-listbox';

export function LocationPicker({ open, onOpenChange, onSend }: LocationPickerProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'current'>('current');

  const {
    mapContainer, isMapLoaded, mapError, retryMap, isLoadingLocation, mapboxToken,
    searchQuery, setSearchQuery, isSearching, selectedLocation, searchResults,
    chooseSearchResult, getCurrentLocation, searchLocation, reset, proximity,
  } = useLocationPicker(open, activeTab);

  // Fase 2/3 do plano de busca (docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md): sugestão
  // enquanto digita, atrás de flag. Flag desligada (padrão hoje) = fluxo antigo intacto,
  // zero mudança visual — nenhum destes valores é lido fora do ramo `autocompleteEnabled`.
  const autocompleteEnabled = useFeatureFlag('mapa.searchbox-autocomplete', false);
  const autocomplete = useAddressAutocomplete({
    token: mapboxToken,
    proximity,
    enabled: autocompleteEnabled && open && activeTab === 'map',
  });
  const [addressListOpen, setAddressListOpen] = useState(false);
  const addressComboRef = useRef<HTMLDivElement>(null);
  // E29 (M2): clique no mapa e GPS mudam `selectedLocation` pelo caminho antigo (reverseGeocode ->
  // select), sem passar pelo autocomplete. O termo tem de sumir SEMPRE — antes isso só acontecia
  // se a lista estivesse aberta, e o endereço antigo ficava escrito num campo que já apontava para
  // outro ponto (o operador via um endereço que não era o que estava marcado).
  // Ajuste durante o render (nao um useEffect: react-hooks/set-state-in-effect proibe setState
  // sincrono no corpo do effect) - padrao React para "derivar estado quando uma prop muda".
  // useRef não pode ser lido/escrito durante o render (react-hooks/refs) - useState é o
  // jeito aceito pelo lint para guardar "valor da render anterior" e comparar aqui.
  const [prevSelectedLocation, setPrevSelectedLocation] = useState(selectedLocation);
  if (selectedLocation !== prevSelectedLocation) {
    setPrevSelectedLocation(selectedLocation);
    if (selectedLocation) {
      setAddressListOpen(false);
      autocomplete.clear();
    }
  }

  // Clique fora fecha a lista; rolar dentro dela não conta como "fora" (E24).
  useEffect(() => {
    if (!addressListOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!addressComboRef.current?.contains(e.target as Node)) setAddressListOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [addressListOpen]);

  const handleSelectSuggestion = async (index: number) => {
    const place = await autocomplete.select(index);
    // E26: falha do `/retrieve` (com o fallback do E16 já tentado) não pode fechar a lista — o
    // operador perde o que estava escolhendo e o campo fica sem coordenada. A lista continua
    // aberta, o item mostra a causa e o aviso sai uma vez.
    if (!place) {
      const kind = autocomplete.retrieveError?.kind;
      toast({
        title: 'Não consegui obter a coordenada',
        description: kind ? searchFailureText(kind) : 'Tente outra sugestão ou busque pelo endereço completo.',
        variant: 'destructive',
      });
      return;
    }
    setAddressListOpen(false);
    chooseSearchResult(place);
  };

  const handleSend = async () => {
    if (!selectedLocation) { toast({ title: 'Selecione uma localização', description: 'Clique no mapa ou use sua localização atual.', variant: 'destructive' }); return; }
    try {
      await onSend({
        latitude: selectedLocation.lat, longitude: selectedLocation.lng, name: selectedLocation.name, address: selectedLocation.address,
      });
      handleClose();
    } catch {
      // The handler owns the user-facing error; preserve the selected point so
      // the operator can retry after fixing connectivity or choosing static.
    }
  };

  const handleClose = () => { reset(); autocomplete.clear(); setAddressListOpen(false); setActiveTab('current'); onOpenChange(false); };

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
                    <p className="text-3xs font-mono text-muted-foreground/70 mt-1">{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="map" className="mt-0 space-y-0">
            <div className="p-4 pb-2">
              {autocompleteEnabled ? (
                <div ref={addressComboRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      role="combobox"
                      aria-expanded={addressListOpen}
                      aria-controls={ADDRESS_LISTBOX_ID}
                      aria-autocomplete="list"
                      aria-activedescendant={
                        addressListOpen && autocomplete.highlightedIndex >= 0
                          ? `${ADDRESS_LISTBOX_ID}-option-${autocomplete.highlightedIndex}`
                          : undefined
                      }
                      placeholder="Buscar endereço..."
                      value={autocomplete.query}
                      onChange={(e) => { autocomplete.setQuery(e.target.value); setAddressListOpen(true); }}
                      onFocus={() => setAddressListOpen(true)}
                      onBlur={(e) => {
                        // E30: sair do campo (Tab, clique em outro campo) fecha a lista. Um clique
                        // numa opção não fecha: ela vive dentro do mesmo container, então o
                        // `relatedTarget` continua dentro de `addressComboRef`.
                        const proximo = e.relatedTarget as Node | null;
                        if (!proximo || !addressComboRef.current?.contains(proximo)) setAddressListOpen(false);
                      }}
                      onKeyDown={(e) => {
                        autocomplete.onKeyDown(e);
                        if (e.key === 'Escape') setAddressListOpen(false);
                        if (e.key === 'Enter') {
                          // Com sugestão destacada, mesmo caminho do clique (E46: antes o hook
                          // resolvia o /retrieve sozinho e o resultado nunca chegava até aqui).
                          // Sem destaque, cai na busca antiga (/forward) com o termo do combobox
                          // (E12/C2: o input da flag ligada nunca preenche `searchQuery`).
                          if (autocomplete.highlightedIndex >= 0) void handleSelectSuggestion(autocomplete.highlightedIndex);
                          else void searchLocation(autocomplete.query);
                        }
                      }}
                      className="pl-9"
                    />
                  </div>
                  {/* E23/E32: a lista é um componente só, e o que ela mostra vem do `status`
                      (nunca de `suggestions.length` — era assim que "Nada encontrado" aparecia em
                      cima de falha e de pausa). */}
                  {addressListOpen && autocomplete.status !== 'idle' && (
                    <SuggestionList
                      listboxId={ADDRESS_LISTBOX_ID}
                      status={autocomplete.status}
                      query={autocomplete.query}
                      suggestions={autocomplete.suggestions}
                      highlightedIndex={autocomplete.highlightedIndex}
                      retrievingId={autocomplete.retrievingId}
                      error={autocomplete.error}
                      blocked={autocomplete.blocked}
                      pausedUntil={autocomplete.pausedUntil}
                      retrieveError={autocomplete.retrieveError}
                      onSelect={(index) => { void handleSelectSuggestion(index); }}
                      onRetry={() => autocomplete.retrySuggest()}
                    />
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar endereço..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchLocation()} className="pl-9" />
                  </div>
                  <Button variant="outline" onClick={() => void searchLocation()} disabled={isSearching}>{isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}</Button>
                </div>
              )}
              {!autocompleteEnabled && searchResults.length > 0 && (
                <div className="mt-2 rounded-lg border border-border divide-y divide-border overflow-hidden">
                  <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/50">Escolha o endereço certo:</p>
                  {searchResults.map((place) => (
                    <button
                      key={`${place.lat},${place.lng},${place.address}`}
                      type="button"
                      onClick={() => chooseSearchResult(place)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                    >
                      {place.name && <p className="text-sm font-medium truncate">{place.name}</p>}
                      {place.address && <p className="text-xs text-muted-foreground truncate">{place.address}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <div ref={mapContainer} className="w-full h-64 bg-muted" />
              {!isMapLoaded && !mapError && <div className="absolute inset-0 flex items-center justify-center bg-muted"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
              {mapError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
                  <span>{mapError}</span>
                  <Button size="sm" variant="outline" onClick={retryMap}>Tentar novamente</Button>
                </div>
              )}
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

        <DialogFooter className="p-4 border-t border-border bg-muted/30 gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!selectedLocation} className="gap-2"><Send className="w-4 h-4" />Enviar Localização</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
