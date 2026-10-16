import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, Trash2, MapPin, Loader2, Search, Building2 } from 'lucide-react';
import { useCityWhitelist } from '@/hooks/security/useCityWhitelist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function CityWhitelistPanel() {
  const {
    settings, cities, loading, updating,
    dialogOpen, setDialogOpen, cityToRemove, setCityToRemove,
    handleToggle, handleAddCity, handleRemoveCity,
  } = useCityWhitelist();
  const [search, setSearch] = useState('');
  const [newCity, setNewCity] = useState('');

  const enabled = settings?.city_whitelist_enabled ?? false;
  const filtered = cities.filter((c) => c.city_name.toLowerCase().includes(search.toLowerCase()));

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setNewCity('');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center">
                <Building2 className="w-5 h-5 text-success dark:text-success" />
              </div>
              <div>
                <CardTitle>Login por cidade</CardTitle>
                <CardDescription>
                  Com o bloqueio ativo, só cidades da lista conseguem fazer login
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar cidade
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="city-whitelist-enabled" className="font-medium">
                Bloquear login fora das cidades da lista
              </Label>
              <p className="text-xs text-muted-foreground">
                Cidade não identificada também é bloqueada. Lista vazia com o bloqueio ativo nega todos os logins.
              </p>
            </div>
            <Switch
              id="city-whitelist-enabled"
              checked={enabled}
              disabled={!settings}
              onCheckedChange={(v) => void handleToggle(v)}
            />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 motion-safe:animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma cidade na lista</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filtered.map((city) => (
                  <motion.div
                    key={city.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-between p-3 rounded-lg border bg-success/10/50 dark:bg-success/20/10 border-success dark:border-success"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-success dark:text-success" />
                      </div>
                      <div>
                        <span className="font-medium">{city.city_name}</span>
                        <p className="text-xs text-muted-foreground">
                          Adicionada em {format(new Date(city.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCityToRemove(city)}
                      aria-label={`Remover ${city.city_name}`}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Adicionar cidade</DialogTitle>
            <DialogDescription>
              Acentos e maiúsculas são ignorados na comparação (São Paulo = sao paulo)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="city-name">Nome da cidade</Label>
            <Input
              id="city-name"
              placeholder="Ex: São Paulo"
              maxLength={128}
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleAddCity(newCity)} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 motion-safe:animate-spin mr-2" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cityToRemove} onOpenChange={() => setCityToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Com o bloqueio ativo, logins vindos de <strong>{cityToRemove?.city_name}</strong> passarão a ser negados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemoveCity()} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 motion-safe:animate-spin mr-2" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
