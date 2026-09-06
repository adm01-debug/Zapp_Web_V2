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
  X, Mail, Phone, Building2, Tag, Clock, BarChart3,
  MessageSquare, FileText, Star, ExternalLink, User
} from 'lucide-react';
import type { EmailThread } from '@/hooks/integrations/useGmail';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EmailContactPanelProps {
  thread: EmailThread;
  onClose: () => void;
}

function getInitials(name?: string | null, email?: string): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

export function EmailContactPanel({ thread, onClose }: EmailContactPanelProps) {
  const contact = thread.contact;
  const [accordionValue, setAccordionValue] = useState<string[]>(['info', 'tags', 'stats']);

  return (
    <div className="w-80 h-full bg-sidebar border-l border-border/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/30 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Detalhes do Contato</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Contact Avatar & Name */}
          <div className="flex flex-col items-center text-center pb-4 border-b border-border/30">
            <Avatar className="h-20 w-20 mb-3">
              <AvatarFallback className="text-lg bg-primary/10 text-primary font-bold">
                {getInitials(contact?.name, contact?.email)}
              </AvatarFallback>
            </Avatar>
            <h4 className="font-semibold text-foreground text-base">
              {contact?.name || 'Desconhecido'}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {contact?.email || ''}
            </p>

            {/* Quick action buttons */}
            <div className="flex items-center gap-1 mt-3">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" title="Email">
                <Mail className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" title="CRM">
                <User className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Accordion Sections */}
          <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue}>
            {/* Info */}
            <AccordionItem value="info" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Informações
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2.5">
                  <InfoRow icon={Mail} label="Email" value={contact?.email} />
                  <InfoRow icon={MessageSquare} label="Assunto" value={thread.subject || '(Sem assunto)'} />
                  <InfoRow
                    icon={Clock}
                    label="Última mensagem"
                    value={thread.last_message_at ? format(new Date(thread.last_message_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'}
                  />
                  <InfoRow icon={BarChart3} label="Mensagens" value={`${thread.message_count} mensagens na thread`} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Labels/Tags */}
            <AccordionItem value="tags" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" />
                  Tags
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {thread.tags && thread.tags.length > 0 ? (
                    thread.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma tag</p>
                  )}
                  {thread.label_ids && thread.label_ids.length > 0 && (
                    <>
                      {thread.label_ids.filter(l => !['INBOX', 'UNREAD', 'SENT', 'IMPORTANT'].includes(l)).map(label => (
                        <Badge key={label} variant="outline" className="text-[10px]">
                          {label}
                        </Badge>
                      ))}
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Thread Stats */}
            <AccordionItem value="stats" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground hover:no-underline py-2">
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
                  <StatCard label="Anexos" value={thread.label_ids?.includes('HAS_ATTACHMENT') ? 'Sim' : 'Não'} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* History */}
            <AccordionItem value="history" className="border-border/30">
              <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground hover:no-underline py-2">
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Histórico
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span>Thread criada</span>
                    <span className="ml-auto text-[10px]">
                      {thread.last_message_at ? format(new Date(thread.last_message_at), 'dd/MM/yy', { locale: ptBR }) : '-'}
                    </span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs text-foreground truncate">{value}</p>
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
