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
import { Slider } from '@/components/ui/slider';
import { SlidersHorizontal, TrendingUp } from 'lucide-react';
import {
  countAdvancedFilters,
  DEFAULT_ADVANCED_FILTERS,
  TagMultiSelectChips,
  type AdvancedFilters,
} from './catalogShared';
import type { CatalogStats } from '@/hooks/integrations/useExternalCatalog';

// E36 — teto do slider de preço enquanto stats.price_max ainda não chegou
// (1ª renderização, antes do bootstrap resolver, ou ambiente onde a RPC
// zapp_catalog_stats() ainda não tem o campo). Nunca é mostrado como um
// valor fixo na UI (placeholder do campo "Máximo" usa priceCeiling, que já
// reflete o valor real assim que stats carrega) — só delimita o range do
// controle até lá.
const FALLBACK_PRICE_CEILING = 2000;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: AdvancedFilters;
  onApply: (filters: AdvancedFilters) => void;
  onClear: () => void;
  /** KPIs/agregados do catálogo (E24) — usado para o teto real do slider de
   * preço e as opções de cor/material. Pode vir null/undefined enquanto o
   * bootstrap carrega ou em ambientes onde a RPC ainda não tem esses campos. */
  stats?: CatalogStats | null;
}

export function CatalogAdvancedFilters({ open, onOpenChange, filters, onApply, onClear, stats }: Props) {
  const [local, setLocal] = React.useState<AdvancedFilters>(filters);
  const localCount = countAdvancedFilters(local);

  const priceCeiling = Math.max(1, Math.ceil(stats?.price_max ?? FALLBACK_PRICE_CEILING));
  const clamp = (n: number) => Math.min(Math.max(n, 0), priceCeiling);
  const parsedMin = local.priceMin ? Number(local.priceMin) : 0;
  const parsedMax = local.priceMax ? Number(local.priceMax) : priceCeiling;
  const sliderValue: [number, number] = [
    clamp(Number.isFinite(parsedMin) ? parsedMin : 0),
    clamp(Number.isFinite(parsedMax) ? parsedMax : priceCeiling),
  ];

  const handleSliderChange = (vals: number[]) => {
    const [min, max] = vals;
    setLocal((p) => ({
      ...p,
      priceMin: min > 0 ? String(min) : '',
      priceMax: max < priceCeiling ? String(max) : '',
    }));
  };

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
            <div className="space-y-4">
              <Slider
                min={0}
                max={priceCeiling}
                step={1}
                value={sliderValue}
                onValueChange={handleSliderChange}
                thumbLabel={['Preço mínimo', 'Preço máximo']}
                className="py-1"
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mínimo (R$)</Label>
                  <Input
                    type="number" min={0} max={priceCeiling} step={0.01} placeholder="0,00"
                    value={local.priceMin}
                    onChange={(e) => setLocal((p) => ({ ...p, priceMin: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Máximo (R$)</Label>
                  <Input
                    type="number" min={0} step={0.01} placeholder={String(priceCeiling)}
                    value={local.priceMax}
                    onChange={(e) => setLocal((p) => ({ ...p, priceMax: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {!!stats?.top_colors?.length && (
            <section>
              <h3 className="text-sm font-semibold mb-3 text-foreground">Cor</h3>
              <TagMultiSelectChips
                options={stats.top_colors}
                selected={local.colors}
                onChange={(colors) => setLocal((p) => ({ ...p, colors }))}
              />
            </section>
          )}

          {!!stats?.top_materials?.length && (
            <section>
              <h3 className="text-sm font-semibold mb-3 text-foreground">Material</h3>
              <TagMultiSelectChips
                options={stats.top_materials}
                selected={local.materials}
                onChange={(materials) => setLocal((p) => ({ ...p, materials }))}
              />
            </section>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => { setLocal({ ...DEFAULT_ADVANCED_FILTERS }); onClear(); onOpenChange(false); }}
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
