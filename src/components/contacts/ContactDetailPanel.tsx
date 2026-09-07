import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  X, MessageSquare, Edit, Phone, Mail, Building, Briefcase,
  Calendar, Tag, Clock, Zap,
} from 'lucide-react';
import { ContactActivityTimeline } from './ContactActivityTimeline';
import { ContactNotes } from './ContactNotes';
import { ContactPurchaseHistory } from './ContactPurchaseHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { ContactEngagementScore } from './ContactEngagementScore';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
interface ContactDetail {
  id: string;
  name: string;
  surname?: string | null;
  nickname?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  avatar_url?: string | null;
  contact_type?: string | null;
  tags?: string[] | null;
  created_at: string;
}

interface ContactDetailPanelProps {
  contact: ContactDetail | null;
  onClose: () => void;
  onOpenChat: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdit: (contact: any) => void;
  messageCount?: number;
  lastMessageAt?: string | null;
}

export function ContactDetailPanel({
  contact, onClose, onOpenChat, onEdit, messageCount = 0, lastMessageAt,
}: ContactDetailPanelProps) {
  useEffect(() => {
    if (!contact) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contact, onClose]);

  if (!contact) return null;

  const avatarColors = getAvatarColor(contact.name);
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;

  const infoItems = [
    { icon: Phone, label: 'Telefone', value: contact.phone },
    { icon: Mail, label: 'Email', value: contact.email },
    { icon: Building, label: 'Empresa', value: contact.company },
    { icon: Briefcase, label: 'Cargo', value: contact.job_title },
    { icon: Calendar, label: 'Criado em', value: format(new Date(contact.created_at), "dd 'de' MMM, yyyy", { locale: ptBR }) },
  ].filter(item => item.value);

  return (
    <AnimatePresence>
      <motion.div
        key="detail-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <motion.div
        key="detail-panel"
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-[380px] bg-card border-l border-border shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-label={`Detalhes do contato ${contact.name}`}
        aria-modal="true"
      >
        {/* Header */}
        <div className="relative p-6 pb-4">
          <Button
            variant="ghost" size="icon"
            className="absolute top-3 right-3 w-8 h-8"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex flex-col items-center text-center gap-3">
            <Avatar className="w-20 h-20 ring-4 ring-background shadow-lg">
              <AvatarImage src={contact.avatar_url || undefined} />
              <AvatarFallback className={cn(avatarColors.bg, avatarColors.text, 'text-xl font-bold')}>
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>

            <div>
              <h2 className="text-lg font-bold text-foreground">
                {contact.name} {contact.surname || ''}
              </h2>
              {contact.nickname && (
                <p className="text-sm text-muted-foreground">"{contact.nickname}"</p>
              )}
              <Badge
                variant="secondary"
                className={cn('mt-1.5 text-xs', typeConfig.badgeClass)}
              >
                {typeConfig.label}
              </Badge>
            </div>

            <ContactEngagementScore
              messageCount={messageCount}
              lastMessageAt={lastMessageAt}
              createdAt={contact.created_at}
              size="md"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mt-4">
            <Button
              className="flex-1 gap-2 bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground"
              onClick={() => onOpenChat(contact.id)}
            >
              <MessageSquare className="w-4 h-4" />
              Conversar
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => onEdit(contact)}>
              <Edit className="w-4 h-4" />
              Editar
            </Button>
          </div>
        </div>

        <Separator />

        {/* Info */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Informações
              </h3>
              <div className="space-y-3">
                {infoItems.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-medium text-foreground">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Tag className="w-3 h-3" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Summary */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Atividade
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/30 p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{messageCount}</p>
                  <p className="text-[10px] text-muted-foreground">Mensagens</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {lastMessageAt
                      ? format(new Date(lastMessageAt), 'dd/MM', { locale: ptBR })
                      : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Última msg</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <ContactActivityTimeline
              contactId={contact.id}
              contactCreatedAt={contact.created_at}
            />

            {/* Notes */}
            <ContactNotes contactId={contact.id} />

            {/* Purchases */}
            <ContactPurchaseHistory contactId={contact.id} />
          </div>
        </ScrollArea>
      </motion.div>
    </AnimatePresence>
  );
}
