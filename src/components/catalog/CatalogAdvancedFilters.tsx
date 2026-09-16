import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SlidersHorizontal, TrendingUp } from 'lucide-react';
import { countAdvancedFilters, type AdvancedFilters } from './catalogShared';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: AdvancedFilters;
  onApply: (filters: AdvancedFilters) => void;
  onClear: () => void;
}

export function CatalogAdvancedFilters({ open, onOpenChange, filters, onApply, onClear }: Props) {
  const [local, setLocal] = React.useState<AdvancedFilters>(filters);
  const localCount = countAdvancedFilters(local);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:w-[380px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="w-4 h-4" />
            Filtros avançados
            {localCount > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">{localCount} ativo{localCount !== 1 ? 's' : ''}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Destaques</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="adv-bestseller" className="flex items-center gap-2 cursor-pointer text-sm">
                  <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
                  Mais pedidos
                </Label>
                <Switch
                  id="adv-bestseller"
                  checked={local.isBestseller}
                  onCheckedChange={(v) => setLocal((p) => ({ ...p, isBestseller: v }))}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Faixa de preço</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mínimo (R$)</Label>
                <Input
                  type="number" min={0} step={0.01} placeholder="0,00"
                  value={local.priceMin}
                  onChange={(e) => setLocal((p) => ({ ...p, priceMin: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Máximo (R$)</Label>
                <Input
                  type="number" min={0} step={0.01} placeholder="999,99"
                  value={local.priceMax}
                  onChange={(e) => setLocal((p) => ({ ...p, priceMax: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </section>
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => { setLocal({ isBestseller: false, priceMin: '', priceMax: '' }); onClear(); onOpenChange(false); }}
            className="flex-1"
          >
            Limpar
          </Button>
          <Button size="sm" onClick={() => { onApply(local); onOpenChange(false); }} className="flex-1">
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
