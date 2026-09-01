import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  X, Mail, Tag, Clock, BarChart3,
  MessageSquare, User, UserPlus
} from 'lucide-react';
import type { EmailThread } from '@/hooks/integrations/useGmail';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EmailContactPanelProps {
  thread: EmailThread;
  onClose: () => void;
}

// E17: Cor determinística de avatar
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

function getAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

export function EmailContactPanel({ thread, onClose }: EmailContactPanelProps) {
  const contact = thread.contact;
  const [accordionValue, setAccordionValue] = useState<string[]>(['info', 'tags', 'stats']);

  // E18: fallback para last_from_* quando sem contato vinculado
  const displayName  = contact?.name  || thread.last_from_name  || null;
  const displayEmail = contact?.email || thread.last_from_address || null;
  const hasContact   = !!contact?.id;

  const avatarSeed = displayEmail || thread.id;
  const avatarColor = getAvatarColor(avatarSeed);

  return (
    <div className="w-80 h-full bg-sidebar border-l border-border/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/30 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Detalhes</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Avatar & Nome */}
          <div className="flex flex-col items-center text-center pb-4 border-b border-border/30">
            <Avatar className="h-20 w-20 mb-3">
              <AvatarFallback className={cn('text-lg font-bold', avatarColor)}>
                {getInitials(displayName, displayEmail)}
              </AvatarFallback>
            </Avatar>

            <h4 className="font-semibold text-foreground text-base">
              {displayName || 'Remetente desconhecido'}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5 break-all">
              {displayEmail || ''}
            </p>

            {/* E18/E19: CTA contextual */}
            <div className="flex items-center gap-1 mt-3">
              {hasContact ? (
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" title="Ver contato no CRM">
                  <User className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs rounded-full"
                  title="Criar contato a partir deste remetente"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  Criar contato
                </Button>
              )}
              {displayEmail && (
                <Button
                  variant="outline" size="icon" className="h-8 w-8 rounded-full"
                  title={`Novo email para ${displayEmail}`}
                  onClick={() => { window.location.href = `mailto:${displayEmail}`; }}
                >
                  <Mail className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Accordion */}
          <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue}>
            {/* Info */}
            <AccordionItem value="info" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Informações
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2.5">
                  <InfoRow icon={Mail} label="Email" value={displayEmail} />
                  {/* E21: line-clamp-2 + break-words + pr-2 no assunto */}
                  <InfoRow icon={MessageSquare} label="Assunto" value={thread.subject || '(Sem assunto)'} multiline />
                  <InfoRow
                    icon={Clock}
                    label="Última mensagem"
                    value={thread.last_message_at
                      ? format(new Date(thread.last_message_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : '-'
                    }
                  />
                  <InfoRow icon={BarChart3} label="Mensagens" value={`${thread.message_count} na thread`} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Tags */}
            <AccordionItem value="tags" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" />
                  Tags
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {thread.tags && thread.tags.length > 0 ? (
                    thread.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma tag</p>
                  )}
                  {thread.label_ids && thread.label_ids
                    .filter(l => !['INBOX', 'UNREAD', 'SENT', 'IMPORTANT'].includes(l))
                    .map(label => (
                      <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                    ))
                  }
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Stats */}
            <AccordionItem value="stats" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Estatísticas
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Mensagens" value={thread.message_count} />
                  <StatCard label="Status" value={thread.is_unread ? 'Não lido' : 'Lido'} />
                  <StatCard label="Favorito" value={thread.is_starred ? 'Sim' : 'Não'} />
                  {/* E20: não usar HAS_ATTACHMENT (não é label Gmail) */}
                  <StatCard label="Com anexos" value={thread.label_ids?.includes('HAS_ATTACHMENT') ? 'Sim' : '—'} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Histórico */}
            <AccordionItem value="history" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Histórico
                </span>
              </AccordionTrigger>
              {/* E22: histórico com dados reais */}
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground/80">Thread iniciada</p>
                      <p className="text-[10px]">
                        {thread.last_message_at
                          ? format(new Date(thread.last_message_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })
                          : '-'}
                      </p>
                    </div>
                  </div>
                  {thread.message_count > 1 && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0 mt-1.5" />
                      <p>{thread.message_count} mensagem(ns) na thread</p>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value, multiline
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 pr-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        {/* E21: line-clamp-2 + break-words */}
        <p className={cn(
          'text-xs text-foreground break-words',
          multiline ? 'line-clamp-2' : 'truncate'
        )}>
          {value}
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2 text-center">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
