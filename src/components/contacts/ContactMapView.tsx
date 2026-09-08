import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Building, Users, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

interface Contact {
  id: string;
  name: string;
  company?: string | null;
  phone: string;
  avatar_url?: string | null;
  lead_origin?: string | null;
}

interface ContactMapViewProps {
  contacts: Contact[];
  onContactClick?: (id: string) => void;
}

// Group contacts by lead_origin or phone prefix for geographic distribution
function getRegionFromPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  // Brazil DDD mapping (simplified)
  if (clean.startsWith('55')) {
    const ddd = clean.substring(2, 4);
    const regions: Record<string, string> = {
      '11': 'São Paulo - SP', '12': 'Vale do Paraíba - SP', '13': 'Santos - SP',
      '14': 'Bauru - SP', '15': 'Sorocaba - SP', '16': 'Ribeirão Preto - SP',
      '17': 'São José do Rio Preto - SP', '18': 'Presidente Prudente - SP', '19': 'Campinas - SP',
      '21': 'Rio de Janeiro - RJ', '22': 'Norte Fluminense - RJ', '24': 'Sul Fluminense - RJ',
      '27': 'Vitória - ES', '28': 'Sul do ES', '31': 'Belo Horizonte - MG',
      '32': 'Juiz de Fora - MG', '33': 'Governador Valadares - MG', '34': 'Uberlândia - MG',
      '35': 'Poços de Caldas - MG', '37': 'Divinópolis - MG', '38': 'Montes Claros - MG',
      '41': 'Curitiba - PR', '42': 'Ponta Grossa - PR', '43': 'Londrina - PR',
      '44': 'Maringá - PR', '45': 'Foz do Iguaçu - PR', '46': 'Pato Branco - PR',
      '47': 'Joinville - SC', '48': 'Florianópolis - SC', '49': 'Chapecó - SC',
      '51': 'Porto Alegre - RS', '53': 'Pelotas - RS', '54': 'Caxias do Sul - RS',
      '55': 'Santa Maria - RS',
      '61': 'Brasília - DF', '62': 'Goiânia - GO', '63': 'Palmas - TO',
      '64': 'Rio Verde - GO', '65': 'Cuiabá - MT', '66': 'Rondonópolis - MT',
      '67': 'Campo Grande - MS', '68': 'Rio Branco - AC', '69': 'Porto Velho - RO',
      '71': 'Salvador - BA', '73': 'Ilhéus - BA', '74': 'Juazeiro - BA',
      '75': 'Feira de Santana - BA', '77': 'Vitória da Conquista - BA',
      '79': 'Aracaju - SE',
      '81': 'Recife - PE', '82': 'Maceió - AL', '83': 'João Pessoa - PB',
      '84': 'Natal - RN', '85': 'Fortaleza - CE', '86': 'Teresina - PI',
      '87': 'Petrolina - PE', '88': 'Juazeiro do Norte - CE', '89': 'Picos - PI',
      '91': 'Belém - PA', '92': 'Manaus - AM', '93': 'Santarém - PA',
      '94': 'Marabá - PA', '95': 'Boa Vista - RR', '96': 'Macapá - AP',
      '97': 'Coari - AM', '98': 'São Luís - MA', '99': 'Imperatriz - MA',
    };
    return regions[ddd] || `DDD ${ddd}`;
  }
  if (clean.startsWith('1')) return 'Estados Unidos';
  if (clean.startsWith('44')) return 'Reino Unido';
  if (clean.startsWith('351')) return 'Portugal';
  if (clean.startsWith('54')) return 'Argentina';
  return 'Internacional';
}

const REGION_COLORS = [
  'bg-primary/15 text-primary',
  'bg-[hsl(200_80%_92%)] text-[hsl(200_80%_35%)]',
  'bg-[hsl(340_70%_92%)] text-[hsl(340_70%_40%)]',
  'bg-[hsl(160_60%_90%)] text-[hsl(160_60%_30%)]',
  'bg-[hsl(30_80%_90%)] text-[hsl(30_80%_35%)]',
  'bg-[hsl(280_60%_92%)] text-[hsl(280_60%_40%)]',
];

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

      {/* Region Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {regions.map(([region, members], i) => {
          const isExpanded = expandedRegion === region;
          const percentage = Math.round((members.length / maxCount) * 100);
          const colorClass = REGION_COLORS[i % REGION_COLORS.length];

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
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', colorClass.split(' ')[0])}>
                      <MapPin className={cn('w-4 h-4', colorClass.split(' ')[1])} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{region}</p>
                      <p className="text-[10px] text-muted-foreground">{members.length} contato{members.length !== 1 ? 's' : ''}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5 shrink-0">{percentage}%</Badge>
                  </div>

                  {/* Bar */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ delay: i * 0.04 + 0.2, duration: 0.5 }}
                      className={cn('h-full rounded-full', colorClass.split(' ')[0].replace('/15', '/40').replace('/90', '/60').replace('/92', '/60'))}
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
                                  <AvatarFallback className={cn(colors.bg, colors.text, 'text-[8px]')}>
                                    {getInitials(c.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-[11px] truncate flex-1">{c.name}</span>
                                {c.company && (
                                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">{c.company}</span>
                                )}
                              </button>
                            );
                          })}
                          {members.length > 20 && (
                            <p className="text-[10px] text-muted-foreground/50 text-center py-1">
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
