import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  X, MessageSquare, Edit, Phone, Mail, Building, Briefcase,
  Calendar, Tag, Clock, Zap, Package,
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
// Guarda de WhatsApp: o mesmo critério que o resto do app usa para telefone
// utilizável é o `normalizeE164BR` (src/lib/calls/phone.ts) — devolve `null`
// quando não dá para extrair um E.164 brasileiro.
import { normalizeE164BR } from '@/lib/calls/phone';
// CT-51/CT-52 — o catálogo do chat reusado no painel do contato: abre o mesmo
// Dialog de envio (CT-14), já com este contato como `presetContact`.
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
// CT-54 — histórico dos produtos já enviados PARA este contato: lê
// `catalog_send_events` filtrando por `contact_id`. Reusa o hook da aba
// "Enviados" (CT-57); o filtro SÓ estreita, a RLS por agente segue valendo.
import { useCatalogSendHistory } from '@/hooks/integrations/useCatalogSendHistory';
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

interface ContactDetailPanelProps<T extends ContactDetail> {
  contact: T | null;
  onClose: () => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: T) => void;
  messageCount?: number;
  lastMessageAt?: string | null;
}

const SEND_STATUS_LABEL: Record<string, string> = {
  sent: 'Enviado',
  partial: 'Parcial',
  failed: 'Falhou',
};

/**
 * CT-54 — bloco "Produtos enviados" no perfil do contato.
 *
 * Usa `useCatalogSendHistory({ contactId })` (mesma consulta da aba
 * "Enviados", agora recortada por destinatário). Estados de carregamento,
 * erro e vazio são explicitamente tratados — contato sem envio não pode
 * parecer "carregando para sempre".
 */
export function ContactCatalogSendHistory({ contactId }: { contactId: string }) {
  const { rows, isLoading, error } = useCatalogSendHistory({ contactId });

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Package className="w-3 h-3" />
        Produtos enviados
      </h3>

      {isLoading ? (
        <div className="space-y-2" data-testid="send-history-loading">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-muted-foreground/50" data-testid="send-history-error">
          Não foi possível carregar o histórico de envios.
        </p>
      ) : rows.length === 0 ? (
        <div className="text-center py-4" data-testid="send-history-empty">
          <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/50">Nenhum produto enviado para este contato</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="send-history-list">
          {rows.map((row) => (
            <div key={row.id} className="p-3 rounded-lg bg-muted/20 border border-border/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{row.product_name}</p>
                  {row.variant_label && <p className="text-caption">{row.variant_label}</p>}
                </div>
                {row.status && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">
                    {SEND_STATUS_LABEL[row.status] || row.status}
                  </Badge>
                )}
              </div>
              <span className="text-caption flex items-center gap-1 mt-2">
                <Calendar className="w-2.5 h-2.5" />
                {format(new Date(row.created_at), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactDetailPanel<T extends ContactDetail>({
  contact, onClose, onOpenChat, onEdit, messageCount = 0, lastMessageAt,
}: ContactDetailPanelProps<T>) {
  useEffect(() => {
    if (!contact) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contact, onClose]);

  if (!contact) return null;

  const avatarColors = getAvatarColor(contact.name);
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  // Sem telefone utilizável (E.164 brasileiro) não há WhatsApp de destino, e
  // sem destino não há envio de produto: o gatilho do catálogo fica bloqueado.
  const hasWhatsApp = normalizeE164BR(contact.phone) !== null;

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
              <AvatarImage src={contact.avatar_url || undefined} alt={contact.name || 'Avatar'} />
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

          {/* Quick Actions — CT-51: é AQUI o ponto de extensão das ações do
              contato (o "header" do contato é este painel lateral, não um
              cabeçalho de página). */}
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex gap-2">
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

            {/* CT-52 — envia um produto do catálogo com ESTE contato já
                pré-selecionado; o envio grava `catalog_send_events` com o
                contact_id do perfil (CT-14). O catálogo abre o mesmo Dialog do
                chat (grade + filtros), não um picker compacto — divergência
                registrada no relatório. */}
            <ExternalProductCatalog
              presetContact={{
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
                avatar_url: contact.avatar_url ?? null,
              }}
              /* Sem WhatsApp o catálogo é forçado fechado (open controlado) e o
                 gatilho vira um botão desabilitado com o motivo no `title`. O
                 `title` fica no <span>: o botão desabilitado tem
                 `disabled:pointer-events-none` e não receberia o hover, e um
                 Tooltip (src/components/ui/tooltip) não pode ser o filho do
                 `DialogTrigger asChild` do ExternalProductCatalog. */
              open={hasWhatsApp ? undefined : false}
              onOpenChange={hasWhatsApp ? undefined : () => {}}
              trigger={
                hasWhatsApp ? (
                  <Button variant="outline" className="w-full gap-2">
                    <Package className="w-4 h-4" />
                    Enviar produto
                  </Button>
                ) : (
                  <span className="block w-full" title="Contato sem WhatsApp">
                    <Button variant="outline" className="w-full gap-2" disabled>
                      <Package className="w-4 h-4" />
                      Enviar produto
                    </Button>
                  </span>
                )
              }
            />
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
                      <p className="text-3xs text-muted-foreground uppercase tracking-wider">{label}</p>
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
                  <p className="text-caption">Mensagens</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {lastMessageAt
                      ? format(new Date(lastMessageAt), 'dd/MM', { locale: ptBR })
                      : '—'}
                  </p>
                  <p className="text-caption">Última msg</p>
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

            {/* CT-54 — Produtos enviados a este contato */}
            <ContactCatalogSendHistory contactId={contact.id} />
          </div>
        </ScrollArea>
      </motion.div>
    </AnimatePresence>
  );
}
