import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, TrendingUp, Star, Filter } from 'lucide-react';
import type { MediaItem, MediaType } from './useMediaLibrary';

export function StatsCards({ items, type }: { items: MediaItem[]; type: MediaType }) {
  const total = items.length;
  const totalUses = items.reduce((s, i) => s + (i.use_count || 0), 0);
  const favorites = items.filter(i => i.is_favorite).length;
  const categories = [...new Set(items.map(i => i.category))].length;
  const topUsed = [...items].sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 3);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <Card className="border-border/50"><CardContent className="p-3"><div className="flex items-center gap-2"><Package className="w-4 h-4 text-primary" /><div><p className="text-lg font-bold text-foreground">{total}</p><p className="text-3xs text-muted-foreground">Total de itens</p></div></div></CardContent></Card>
      <Card className="border-border/50"><CardContent className="p-3"><div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-success" /><div><p className="text-lg font-bold text-foreground">{totalUses}</p><p className="text-3xs text-muted-foreground">Usos totais</p></div></div></CardContent></Card>
      <Card className="border-border/50"><CardContent className="p-3"><div className="flex items-center gap-2"><Star className="w-4 h-4 text-warning" /><div><p className="text-lg font-bold text-foreground">{favorites}</p><p className="text-3xs text-muted-foreground">Favoritos</p></div></div></CardContent></Card>
      <Card className="border-border/50"><CardContent className="p-3"><div className="flex items-center gap-2"><Filter className="w-4 h-4 text-info" /><div><p className="text-lg font-bold text-foreground">{categories}</p><p className="text-3xs text-muted-foreground">Categorias</p></div></div></CardContent></Card>
      {topUsed.length > 0 && (
        <Card className="border-border/50 col-span-2 md:col-span-4"><CardContent className="p-3"><p className="text-3xs text-muted-foreground mb-2 font-medium">🏆 Mais usados</p><div className="flex gap-3">{topUsed.map((item, i) => (<div key={item.id} className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">{i + 1}.</span><span className="font-medium truncate max-w-[120px]">{item.name || 'Sem nome'}</span><Badge variant="secondary" className="text-[9px] px-1">{item.use_count}x</Badge></div>))}</div></CardContent></Card>
      )}
    </div>
  );
}
