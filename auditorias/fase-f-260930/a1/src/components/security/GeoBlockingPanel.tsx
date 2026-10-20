import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Plus, Trash2, Search, MapPin, AlertTriangle, Shield, ShieldOff, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useGeoBlocking } from '@/hooks/system/useGeoBlocking';
import { useState } from 'react';

const COUNTRIES = [
  { code: 'AF', name: 'Afeganistão' }, { code: 'AL', name: 'Albânia' }, { code: 'DZ', name: 'Argélia' },
  { code: 'AR', name: 'Argentina' }, { code: 'AU', name: 'Austrália' }, { code: 'AT', name: 'Áustria' },
  { code: 'BD', name: 'Bangladesh' }, { code: 'BY', name: 'Bielorrússia' }, { code: 'BE', name: 'Bélgica' },
  { code: 'BO', name: 'Bolívia' }, { code: 'BR', name: 'Brasil' }, { code: 'BG', name: 'Bulgária' },
  { code: 'CA', name: 'Canadá' }, { code: 'CL', name: 'Chile' }, { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colômbia' }, { code: 'HR', name: 'Croácia' }, { code: 'CU', name: 'Cuba' },
  { code: 'CZ', name: 'República Tcheca' }, { code: 'DK', name: 'Dinamarca' }, { code: 'EC', name: 'Equador' },
  { code: 'EG', name: 'Egito' }, { code: 'FI', name: 'Finlândia' }, { code: 'FR', name: 'França' },
  { code: 'DE', name: 'Alemanha' }, { code: 'GR', name: 'Grécia' }, { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungria' }, { code: 'IN', name: 'Índia' }, { code: 'ID', name: 'Indonésia' },
  { code: 'IR', name: 'Irã' }, { code: 'IQ', name: 'Iraque' }, { code: 'IE', name: 'Irlanda' },
  { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Itália' }, { code: 'JP', name: 'Japão' },
  { code: 'KZ', name: 'Cazaquistão' }, { code: 'KE', name: 'Quênia' }, { code: 'KP', name: 'Coreia do Norte' },
  { code: 'KR', name: 'Coreia do Sul' }, { code: 'MY', name: 'Malásia' }, { code: 'MX', name: 'México' },
  { code: 'MA', name: 'Marrocos' }, { code: 'NL', name: 'Holanda' }, { code: 'NZ', name: 'Nova Zelândia' },
  { code: 'NG', name: 'Nigéria' }, { code: 'NO', name: 'Noruega' }, { code: 'PK', name: 'Paquistão' },
  { code: 'PE', name: 'Peru' }, { code: 'PH', name: 'Filipinas' }, { code: 'PL', name: 'Polônia' },
  { code: 'PT', name: 'Portugal' }, { code: 'RO', name: 'Romênia' }, { code: 'RU', name: 'Rússia' },
  { code: 'SA', name: 'Arábia Saudita' }, { code: 'SG', name: 'Singapura' }, { code: 'ZA', name: 'África do Sul' },
  { code: 'ES', name: 'Espanha' }, { code: 'SE', name: 'Suécia' }, { code: 'CH', name: 'Suíça' },
  { code: 'SY', name: 'Síria' }, { code: 'TW', name: 'Taiwan' }, { code: 'TH', name: 'Tailândia' },
  { code: 'TR', name: 'Turquia' }, { code: 'UA', name: 'Ucrânia' }, { code: 'AE', name: 'Emirados Árabes Unidos' },
  { code: 'GB', name: 'Reino Unido' }, { code: 'US', name: 'Estados Unidos' }, { code: 'UY', name: 'Uruguai' },
  { code: 'VE', name: 'Venezuela' }, { code: 'VN', name: 'Vietnã' },
];

export function GeoBlockingPanel() {
  const {
    settings, allowedCountries, blockedCountries, loading,
    dialogOpen, setDialogOpen, selectedCountry, setSelectedCountry,
    countryToRemove, setCountryToRemove, activeTab, setActiveTab,
    handleModeChange, handleAddCountry, handleRemoveCountry,
  } = useGeoBlocking();
  const [search, setSearch] = useState('');

  const currentList = activeTab === 'whitelist' ? allowedCountries : blockedCountries;
  const filteredCountries = currentList.filter(c => c.country_name.toLowerCase().includes(search.toLowerCase()) || c.country_code.toLowerCase().includes(search.toLowerCase()));
  const availableCountries = COUNTRIES.filter(c => !currentList.some(cl => cl.country_code === c.code));

  const getModeIcon = () => settings?.mode === 'whitelist' ? <ShieldCheck className="w-5 h-5 text-success" /> : settings?.mode === 'blacklist' ? <Shield className="w-5 h-5 text-destructive" /> : <ShieldOff className="w-5 h-5 text-muted-foreground" />;
  const getModeLabel = () => settings?.mode === 'whitelist' ? 'Whitelist Ativa' : settings?.mode === 'blacklist' ? 'Blacklist Ativa' : 'Desativado';
  const getModeDescription = () => settings?.mode === 'whitelist' ? 'Apenas países na whitelist podem acessar' : settings?.mode === 'blacklist' ? 'Países na blacklist são bloqueados' : 'Todos os países podem acessar';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">{getModeIcon()}</div>
              <div><CardTitle>Modo de Bloqueio Geográfico</CardTitle><CardDescription>{getModeDescription()}</CardDescription></div>
            </div>
            <Badge variant={settings?.mode === 'disabled' ? 'secondary' : settings?.mode === 'whitelist' ? 'default' : 'destructive'} className="text-xs">{getModeLabel()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(['disabled', 'whitelist', 'blacklist'] as const).map(mode => (
              <Button key={mode} variant={settings?.mode === mode ? 'default' : 'outline'} className="flex-col h-auto py-4 gap-2" onClick={() => handleModeChange(mode)}>
                {mode === 'disabled' ? <ShieldOff className="w-5 h-5" /> : mode === 'whitelist' ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                <span className="text-xs">{mode === 'disabled' ? 'Desativado' : mode === 'whitelist' ? 'Whitelist' : 'Blacklist'}</span>
              </Button>
            ))}
          </div>
          {settings?.mode === 'whitelist' && (
            <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20"><div className="flex items-start gap-2"><ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-success">Modo Whitelist Ativo</p><p className="text-xs text-muted-foreground mt-1">Apenas usuários de países na whitelist ({allowedCountries.length}) podem acessar o sistema.</p></div></div></div>
          )}
          {settings?.mode === 'blacklist' && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20"><div className="flex items-start gap-2"><Shield className="w-5 h-5 text-destructive shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-destructive">Modo Blacklist Ativo</p><p className="text-xs text-muted-foreground mt-1">Usuários de países bloqueados ({blockedCountries.length}) não podem acessar o sistema.</p></div></div></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-primary/10"><Globe className="w-5 h-5 text-primary" /></div><div><CardTitle>Listas de Países</CardTitle><CardDescription>Gerencie whitelist e blacklist de países</CardDescription></div></div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Adicionar País</Button></DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader><DialogTitle>Adicionar à {activeTab === 'whitelist' ? 'Whitelist' : 'Blacklist'}</DialogTitle><DialogDescription>{activeTab === 'whitelist' ? 'Países na whitelist terão acesso permitido.' : 'Países na blacklist terão acesso bloqueado.'}</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>País</Label>
                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger><SelectValue placeholder="Selecione um país" /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">{availableCountries.map(c => <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {activeTab === 'blacklist' && <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20"><AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" /><p className="text-sm text-muted-foreground">Todos os usuários deste país serão bloqueados.</p></div>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={() => { const c = COUNTRIES.find(ct => ct.code === selectedCountry); if (c) handleAddCountry(c.code, c.name); }} variant={activeTab === 'blacklist' ? 'destructive' : 'default'}>Adicionar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'whitelist' | 'blacklist')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="whitelist" className="gap-2"><ShieldCheck className="w-4 h-4" />Whitelist ({allowedCountries.length})</TabsTrigger>
              <TabsTrigger value="blacklist" className="gap-2"><Shield className="w-4 h-4" />Blacklist ({blockedCountries.length})</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar país..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
              {loading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> :
               filteredCountries.length === 0 ? (
                <div className="text-center py-8"><Globe className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" /><p className="text-muted-foreground">{search ? 'Nenhum país encontrado' : `Nenhum país na ${activeTab}`}</p>
                  {activeTab === 'whitelist' && settings?.mode === 'whitelist' && allowedCountries.length === 0 && <p className="text-xs text-warning mt-2">⚠️ Atenção: com whitelist ativa e vazia, ninguém poderá acessar!</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {filteredCountries.map((country) => (
                      <motion.div key={country.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${activeTab === 'whitelist' ? 'bg-success/10' : 'bg-destructive/10'}`}><MapPin className={`w-4 h-4 ${activeTab === 'whitelist' ? 'text-success' : 'text-destructive'}`} /></div>
                          <div><div className="flex items-center gap-2"><span className="font-medium">{country.country_name}</span><Badge variant="outline" className="text-xs">{country.country_code}</Badge></div><p className="text-xs text-muted-foreground">Adicionado {formatDistanceToNow(new Date(country.created_at), { addSuffix: true, locale: ptBR })}</p></div>
                        </div>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCountryToRemove(country)}><Trash2 className="w-4 h-4" /></Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={!!countryToRemove} onOpenChange={(open) => !open && setCountryToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remover {countryToRemove?.country_name}?</AlertDialogTitle><AlertDialogDescription>Esta ação removerá o país da {activeTab}. Você pode adicioná-lo novamente a qualquer momento.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleRemoveCountry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
