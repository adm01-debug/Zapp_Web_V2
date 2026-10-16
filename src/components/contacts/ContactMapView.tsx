import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Building, Users, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { ContactRegionMap } from './ContactRegionMap';
import type { PreciseContactPoint } from './ContactRegionMap';
import { getRegionFromPhone } from './getRegionFromPhone';

interface Contact {
  id: string;
  name: string;
  company?: string | null;
  phone: string;
  avatar_url?: string | null;
  lead_origin?: string | null;
  /** Preenchidos pelo autocomplete de endereço do cadastro (E41/E42) — nem todo contato tem. */
  latitude?: number | null;
  longitude?: number | null;
}

interface ContactMapViewProps {
  contacts: Contact[];
  onContactClick?: (id: string) => void;
}

/** Contato com coordenada própria (endereço confirmado) — vira pino, não bolha aproximada. */
const hasCoordinates = (c: Contact): c is Contact & { latitude: number; longitude: number } =>
  typeof c.latitude === 'number' && typeof c.longitude === 'number';

const REGION_COLORS = [
  { icon: 'bg-primary/15', bar: 'bg-primary/40' },
  { icon: 'bg-info/15', bar: 'bg-info/40' },
  { icon: 'bg-success/15', bar: 'bg-success/40' },
  { icon: 'bg-warning/15', bar: 'bg-warning/40' },
  { icon: 'bg-destructive/15', bar: 'bg-destructive/40' },
  { icon: 'bg-muted-foreground/15', bar: 'bg-muted-foreground/40' },
] as const;

export function ContactMapView({ contacts, onContactClick }: ContactMapViewProps) {
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  const regions = useMemo(() => {
    const map = new Map<string, Contact[]>();
    contacts.forEach(c => {
      const region = getRegionFromPhone(c.phone);
      if (!map.has(region)) map.set(region, []);
      map.get(region)!.push(c);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length);
  }, [contacts]);

  const maxCount = regions[0]?.[1].length || 1;

  // R2-AUTH-038 · item 262: o mapa plota LOCALIZAÇÃO FÍSICA e a legenda publica duas
  // contagens exclusivas — "Endereço confirmado" (pino) e "Aproximado pelo DDD" (bolha).
  // Por isso a bolha só leva quem NÃO tem coordenada própria: antes ela reusava `regions`
  // (o agrupamento comercial, que tem todos) e o contato já pinado era contado de novo
  // como aproximado. O cartão abaixo segue com o agrupamento comercial, sem filtro.
  const mapRegions = useMemo(() => {
    const byRegion = new Map<string, number>();
    contacts.filter((c) => !hasCoordinates(c)).forEach((c) => {
      const region = getRegionFromPhone(c.phone);
      byRegion.set(region, (byRegion.get(region) ?? 0) + 1);
    });
    return Array.from(byRegion, ([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count);
  }, [contacts]);

  const preciseContacts = useMemo<PreciseContactPoint[]>(() => contacts
    .filter(hasCoordinates)
    .map((c) => ({ id: c.id, name: c.name, lat: c.latitude, lng: c.longitude })),
  [contacts]);

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="w-4 h-4" />
          <span className="font-medium text-foreground">{regions.length}</span> regiões
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span className="font-medium text-foreground">{contacts.length}</span> contatos mapeados
        </div>
      </div>

      {/* Mapa por regiao do DDD */}
      <ContactRegionMap
        regions={mapRegions}
        preciseContacts={preciseContacts}
        selectedRegion={expandedRegion}
        onSelectRegion={(region) => setExpandedRegion((current) => (current === region ? null : region))}
      />

      {/* Region Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {regions.map(([region, members], i) => {
          const isExpanded = expandedRegion === region;
          const percentage = Math.round((members.length / maxCount) * 100);
          const regionColor = REGION_COLORS[i % REGION_COLORS.length];

          return (
            <motion.div
              key={region}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md border-border/40',
                  isExpanded && 'ring-1 ring-primary/30'
                )}
                onClick={() => setExpandedRegion(isExpanded ? null : region)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', regionColor.icon)}>
                      <MapPin className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{region}</p>
                      <p className="text-caption">{members.length} contato{members.length !== 1 ? 's' : ''}</p>
                    </div>
                    <Badge variant="secondary" className="text-3xs h-5 shrink-0">{percentage}%</Badge>
                  </div>

                  {/* Bar */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ delay: i * 0.04 + 0.2, duration: 0.5 }}
                      className={cn('h-full rounded-full', regionColor.bar)}
                    />
                  </div>

                  {/* Expanded contacts */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="overflow-hidden"
                    >
                      <ScrollArea className="max-h-36 mt-2">
                        <div className="space-y-1">
                          {members.slice(0, 20).map(c => {
                            const colors = getAvatarColor(c.name);
                            return (
                              <button
                                key={c.id}
                                onClick={e => { e.stopPropagation(); onContactClick?.(c.id); }}
                                className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={c.avatar_url || undefined} alt={c.name || 'Avatar'} />
                                  <AvatarFallback className={cn(colors.bg, colors.text, 'text-3xs')}>
                                    {getInitials(c.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-2xs truncate flex-1">{c.name}</span>
                                {c.company && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[80px]">{c.company}</span>
                                )}
                              </button>
                            );
                          })}
                          {members.length > 20 && (
                            <p className="text-3xs text-muted-foreground/50 text-center py-1">
                              +{members.length - 20} mais
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
