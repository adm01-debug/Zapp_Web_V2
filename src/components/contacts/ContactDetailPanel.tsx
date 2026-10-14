import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  X, MessageSquare, Edit, Phone, Mail, Building, Briefcase,
  Calendar, Tag, Clock, Package, ChevronLeft, ChevronRight, ContactRound,
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
import { ContactService } from '@/services/contact.service';
import { Skeleton } from '@/components/ui/skeleton';
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
  /**
   * RD-071 (casca da janela) — ganchos de navegação da ficha. Os botões
   * Anterior/Próximo fazem parte da casca; quem os liga ao contato
   * anterior/seguinte da lista filtrada é o item RD-078 (o consumidor,
   * `ContactsView`, não passa estes handlers ainda). Sem handler o botão fica
   * desabilitado — nunca um clique morto.
   */
  onPrev?: () => void;
  onNext?: () => void;
}

/** Atividade de um contato: nº de mensagens + data da última (ou `null` = sem mensagens). */
export interface ContactActivity {
  messageCount: number;
  lastMessageAt: string | null;
}

/**
 * Atividade canônica de UM contato, consultada pelo próprio painel.
 *
 * #253 (R2-AUTH-028): o painel mostrava "0 Mensagens" e "Inativo" porque
 * recebia `messageCount`/`lastMessageAt` por props que o único consumidor de
 * produção (`ContactsView`) nunca fornecia — a ausência da prop era exibida
 * como ausência de atividade. Aqui o painel busca a MESMA fonte do resto do
 * app, sem depender de prop opcional:
 *  - contagem: `ContactService.fetchStats` (a consulta da aba Resumo);
 *  - última mensagem: RPC `get_last_message_dates` (a que enriquece a lista).
 *
 * `isLoading`/`isError` sobem para o painel distinguir carregando,
 * indisponível e zero confirmado — nunca inventar zero.
 */
function useContactActivity(contactId: string | null | undefined) {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['contact-activity-stats', contactId],
    enabled: !!contactId,
    staleTime: 30_000,
    queryFn: () => ContactService.fetchStats(contactId as string),
  });

  const { data: lastMessageAt, isLoading: lastLoading, isError: lastError } = useQuery({
    queryKey: ['contact-activity-last-message', contactId],
    enabled: !!contactId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await ContactService.getLastMessageDates([contactId as string]);
      if (error) throw error;
      return data?.[0]?.last_message_at ?? null;
    },
  });

  const data: ContactActivity | undefined =
    stats && lastMessageAt !== undefined
      ? { messageCount: stats.totalMessages, lastMessageAt }
      : undefined;

  return { data, isLoading: statsLoading || lastLoading, isError: statsError || lastError };
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
                  <Badge variant="secondary" className="text-3xs h-4 px-1.5 shrink-0">
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

/**
 * RD-071 — Ficha completa do contato: casca da janela.
 *
 * A ficha deixou de ser um painel lateral de 380 px (`fixed right-0`) e virou
 * a janela centralizada do design (`docs/design/contatos-redesign-2026-10-12/`,
 * `zc-dialog`): largura de até 1050 px, raio 17 px, borda e sombra do token,
 * cabeçalho com ícone + contexto "Contatos / Ficha completa" + controles
 * Anterior / Próximo / Fechar. No celular (<640 px) ocupa a tela inteira.
 *
 * Toda a casca agora é o `Dialog` do sistema (Radix): foco preso dentro da
 * janela, `Esc` fecha e, ao fechar, o foco volta ao elemento que abriu (o
 * card/linha de Contatos) — por isso o `document.addEventListener('keydown')`
 * manual de antes saiu (era um listener global). O conteúdo interno continua o
 * de hoje; ele será reorganizado em abas nos próximos itens da fase.
 */
export function ContactDetailPanel<T extends ContactDetail>({
  contact, onClose, onOpenChat, onEdit, onPrev, onNext,
}: ContactDetailPanelProps<T>) {
  const activity = useContactActivity(contact?.id);
  const activityReady = !!activity.data && !activity.isError;
  // RD-071 — o gatilho da ficha está FORA dela (o card/linha de Contatos), então
  // o Radix não tem como devolver o foco: sem `DialogTrigger` ele só sabe
  // focar o gatilho registrado e, sem ele, larga o foco no `<body>`. Guardamos
  // quem estava focado quando a janela abriu e devolvemos no fechamento.
  const openedFrom = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        aria-modal="true"
        data-testid="contact-detail-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openedFrom.current?.focus();
        }}
        className="flex w-full max-w-[1050px] flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-elev-4 sm:rounded-[17px] max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none"
      >
        {/* Cabeçalho da janela: contexto + controles (Anterior / Próximo / Fechar). */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-4">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-xs font-normal text-muted-foreground">
            <ContactRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">Contatos / Ficha completa</span>
          </DialogTitle>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Ver contato anterior"
              title={onPrev ? 'Ver contato anterior' : 'Disponível ao navegar pela lista'}
              disabled={!onPrev}
              onClick={() => onPrev?.()}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Ver próximo contato"
              title={onNext ? 'Ver próximo contato' : 'Disponível ao navegar pela lista'}
              disabled={!onNext}
              onClick={() => onNext?.()}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
            <DialogClose asChild>
              <Button variant="outline" size="icon" aria-label="Fechar ficha" title="Fechar ficha">
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
        </header>

        <div className="p-6 pb-4">
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

            {/* Engajamento só é calculado quando a atividade é conhecida: sem
                os insumos (nº de mensagens + última), o painel não afirma
                "Inativo" — mostra carregando ou indisponível. (#253) */}
            {activity.isLoading ? (
              <div
                data-testid="engagement-loading"
                role="status"
                className="h-8 w-28 rounded-full bg-muted/40 animate-pulse"
                aria-label="Carregando atividade do contato"
              />
            ) : activityReady ? (
              <ContactEngagementScore
                messageCount={activity.data!.messageCount}
                lastMessageAt={activity.data!.lastMessageAt}
                createdAt={contact.created_at}
                size="md"
              />
            ) : (
              <span
                data-testid="engagement-unavailable"
                title="Não foi possível carregar a atividade deste contato"
                className="text-xs text-muted-foreground"
              >
                Atividade indisponível
              </span>
            )}
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
        <ScrollArea className="min-h-0 flex-1">
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

            {/* Activity Summary — reflete carregando/indisponível/valor real
                em vez de afirmar "0"/"—" enquanto o dado não é conhecido. (#253) */}
            <div
              data-testid="activity-summary"
              data-state={activity.isLoading ? 'loading' : activityReady ? 'ready' : 'unavailable'}
            >
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Atividade
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/30 p-3 text-center">
                  {activity.isLoading ? (
                    <Skeleton className="h-6 w-12 mx-auto" data-testid="activity-count-loading" />
                  ) : (
                    <p className="text-lg font-bold text-foreground" data-testid="activity-message-count">
                      {activityReady ? activity.data!.messageCount : '—'}
                    </p>
                  )}
                  <p className="text-caption">Mensagens</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3 text-center">
                  {activity.isLoading ? (
                    <Skeleton className="h-4 w-10 mx-auto" data-testid="activity-last-loading" />
                  ) : (
                    <p className="text-sm font-medium text-foreground" data-testid="activity-last-message">
                      {activityReady && activity.data!.lastMessageAt
                        ? format(new Date(activity.data!.lastMessageAt), 'dd/MM', { locale: ptBR })
                        : '—'}
                    </p>
                  )}
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
      </DialogContent>
    </Dialog>
  );
}
