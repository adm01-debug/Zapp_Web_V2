import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cake, Gift, PartyPopper, Calendar } from 'lucide-react';
import { format, differenceInDays, setYear, isToday, isTomorrow, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

interface Contact {
  id: string;
  name: string;
  avatar_url?: string | null;
  birthday?: string | null;
}

interface ContactBirthdayPanelProps {
  contacts: Contact[];
  onContactClick?: (id: string) => void;
}

function getUpcomingBirthdays(contacts: Contact[], days = 30) {
  const today = startOfDay(new Date());
  const thisYear = today.getFullYear();

  return contacts
    .filter(c => c.birthday)
    .map(c => {
      const bday = new Date(c.birthday!);
      let nextBday = setYear(bday, thisYear);
      if (nextBday < today) nextBday = setYear(bday, thisYear + 1);
      const daysUntil = differenceInDays(nextBday, today);
      return { contact: c, nextBday, daysUntil };
    })
    .filter(b => b.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function getDaysLabel(days: number) {
  if (days === 0) return { text: 'Hoje! 🎉', variant: 'default' as const };
  if (days === 1) return { text: 'Amanhã', variant: 'secondary' as const };
  if (days <= 7) return { text: `${days} dias`, variant: 'outline' as const };
  return { text: `${days} dias`, variant: 'outline' as const };
}

export function ContactBirthdayPanel({ contacts, onContactClick }: ContactBirthdayPanelProps) {
  const upcoming = useMemo(() => getUpcomingBirthdays(contacts), [contacts]);

  if (upcoming.length === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <Cake className="w-6 h-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum aniversário nos próximos 30 dias</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Adicione datas de nascimento aos contatos</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[hsl(340_70%_92%)] flex items-center justify-center">
            <PartyPopper className="w-3.5 h-3.5 text-[hsl(340_70%_40%)]" />
          </div>
          Aniversários Próximos
          <Badge variant="secondary" className="ml-auto text-[10px] h-5">{upcoming.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-48">
          <div className="space-y-2">
            {upcoming.map((item, i) => {
              const { text, variant } = getDaysLabel(item.daysUntil);
              const colors = getAvatarColor(item.contact.name);
              return (
                <motion.button
                  key={item.contact.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onContactClick?.(item.contact.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                    'hover:bg-muted/50',
                    item.daysUntil === 0 && 'bg-primary/5 border border-primary/20'
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={item.contact.avatar_url || undefined} alt={item.contact.name || 'Contato'} />
                    <AvatarFallback className={cn(colors.bg, colors.text, 'text-[10px]')}>
                      {getInitials(item.contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.contact.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {format(item.nextBday, 'dd MMM', { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant={variant} className={cn(
                    'text-[10px] h-5 shrink-0',
                    item.daysUntil === 0 && 'bg-primary text-primary-foreground'
                  )}>
                    {item.daysUntil === 0 ? <Gift className="w-3 h-3 mr-1" /> : null}
                    {text}
                  </Badge>
                </motion.button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
