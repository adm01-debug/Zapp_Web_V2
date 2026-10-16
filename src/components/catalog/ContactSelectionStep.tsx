import { useMemo } from 'react';
import { ArrowLeft, Check, Image as ImageIcon, ImageOff, Loader2, MessageSquare, Package, Palette, Plus, Search, Send, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCard, IconTile, MetaRow, RailCard } from '@/components/talkx/talkxShared';
import { InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { formatPhoneBR } from '@/lib/calls/phone';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { CONTACT_SEARCH_MIN_CHARS } from '@/hooks/integrations/useCatalogContactSearch';
import { useCatalogRecentSends } from '@/hooks/integrations/useCatalogRecentSends';
import { cn } from '@/lib/utils';
import type { ContactResult, SendProgress } from './useSendProduct';
import type { MessageTemplate } from './sendProductUtils';

/** CT-42 — quantos envios recentes viram atalho no topo da lista. */
const RECENT_SENDS_LIMIT = 5;

interface ContactSelectionStepProps {
  productName: string;
  productImageUrl?: string;
  selectedImagesCount: number;
  template: MessageTemplate;
  variantLabel?: string;
  templateLabels: Record<MessageTemplate, string>;
  contactSearch: string;
  onContactSearchChange: (v: string) => void;
  contactResults: ContactResult[];
  searchingContacts: boolean;
  selectedContact: ContactResult | null;
  onSelectContact: (c: ContactResult) => void;
  isSending: boolean;
  onBack: () => void;
  onSend: () => void;
  /** CT-08 — motivo do bloqueio pré-envio (conexão WhatsApp ou supressão). */
  sendBlockedReason?: string | null;
  /** CT-08 — checagem pré-envio em andamento: não dispara envio antes de saber. */
  checkingSendReadiness?: boolean;
  /**
   * R2-MOD-008 — a consulta de prontidão falhou (indisponível): repete a
   * consulta. Quando presente, o aviso ganha o botão "Tentar de novo".
   */
  onRetrySendReadiness?: (() => void) | null;
  /** CT-46 — contador de mensagens do envio em andamento ("Enviando 2/4..."). */
  sendProgress?: SendProgress | null;
}

/**
 * CT-42 — linha de contato da lista: avatar com iniciais (foto quando há
 * `avatar_url`), nome, telefone formatado em pt-BR e radio de seleção.
 *
 * O radio é ARIA (`role="radio"` + `aria-checked`) sobre o próprio botão da
 * linha em vez de `RadioGroupItem`: o wrapper de `ui/radio-group` fixa o
 * `Indicator` como children do item, então nem `asChild` nem conteúdo próprio
 * funcionam nele (o filho do chamador é descartado) — e trocar o botão por
 * `<label>` quebraria os cliques por `.closest('button')` já usados nos testes
 * do dialog. A linha inteira continua sendo o alvo do clique.
 */
function ContactRow({ contact, selected, onSelect }: {
  contact: ContactResult;
  selected: boolean;
  onSelect: (c: ContactResult) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(contact)}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all',
        selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
      )}
    >
      {/* InitialsAvatar (dashboard) só aceita 24|28|32|36|44|56 — o 40 do
          layout não existe na union; `size` escolhe a fonte e o className
          força os 40px exatos. */}
      <InitialsAvatar name={contact.name || '?'} src={contact.avatar_url} size={44} className="!h-10 !w-10" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{contact.name}</p>
        <p className="text-xs text-muted-foreground truncate">{formatPhoneBR(contact.phone)}</p>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
          selected ? 'border-primary' : 'border-muted-foreground/40'
        )}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

export function ContactSelectionStep({
  productName, productImageUrl, selectedImagesCount,
  template, variantLabel, templateLabels,
  contactSearch, onContactSearchChange,
  contactResults, searchingContacts,
  selectedContact, onSelectContact,
  isSending, onBack, onSend,
  sendBlockedReason = null, checkingSendReadiness = false,
  onRetrySendReadiness = null,
  sendProgress = null,
}: ContactSelectionStepProps) {
  // CT-42 — "Enviados recentemente" vem de catalog_send_events (E56), não da
  // lista de contatos: quem foi enviado ontem pode não estar entre os 15 mais
  // recentemente atualizados.
  const { recent } = useCatalogRecentSends(RECENT_SENDS_LIMIT);
  const hasQuery = contactSearch.trim().length >= CONTACT_SEARCH_MIN_CHARS;

  const contactById = useMemo(() => {
    const map = new Map<string, ContactResult>();
    if (selectedContact) map.set(selectedContact.id, selectedContact);
    for (const contact of contactResults) map.set(contact.id, contact);
    return map;
  }, [contactResults, selectedContact]);

  const recentContacts = useMemo(() => {
    const seen = new Set<string>();
    const list: ContactResult[] = [];
    for (const event of recent) {
      if (list.length >= RECENT_SENDS_LIMIT) break;
      const id = event.contact_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const loaded = contactById.get(id);
      if (loaded) {
        list.push(loaded);
        continue;
      }
      // O evento guarda só o nome do destinatário (o telefone não é
      // registrado em catalog_send_events) — fora dos resultados carregados a
      // linha aparece sem telefone, mas continua selecionável.
      const name = event.contact_name?.trim();
      if (name) list.push({ id, name, phone: '', avatar_url: null });
    }
    return list;
  }, [recent, contactById]);

  // Durante uma busca a seção de recentes sai de cena: os resultados são o
  // que o usuário pediu, e o atalho viraria ruído.
  const shownRecent = hasQuery ? [] : recentContacts;
  const shownRecentIds = new Set(shownRecent.map((c) => c.id));
  const shownContacts = contactResults.filter((c) => !shownRecentIds.has(c.id));
  const isEmpty = shownRecent.length === 0 && shownContacts.length === 0;

  const sendingLabel = isSending && sendProgress
    ? `Enviando ${sendProgress.done}/${sendProgress.total}...`
    : 'Enviando...';

  return (
    <>
      <DialogHeader className="p-5 pb-3">
        <DialogTitle className="flex items-center gap-3 text-lg">
          <IconTile icon={Users} color="blue" size={40} />
          <span className="min-w-0">
            <span className="block">Selecionar Contato</span>
            <span className="block text-sm font-normal text-muted-foreground truncate">
              Escolha para quem enviar <span className="font-medium text-foreground">{productName}</span>
            </span>
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 px-5 md:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato por nome ou telefone..."
              value={contactSearch}
              onChange={(e) => onContactSearchChange(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {contactSearch.trim().length > 0 && !hasQuery && (
            <p className="text-xs text-muted-foreground">
              Digite ao menos {CONTACT_SEARCH_MIN_CHARS} caracteres para buscar.
            </p>
          )}

          <ScrollArea className="max-h-[45vh]">
            {searchingContacts ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : isEmpty ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{hasQuery ? 'Nenhum contato encontrado' : 'Busque por nome ou telefone'}</p>
                {/* Não existe `?new=1` no roteador (ViewRouter só lê `?view=`) e
                    useContactsCRUD abre o formulário por estado local: o link
                    leva para a view de contatos, que é o que existe hoje. */}
                <a
                  href="?view=contacts"
                  onClick={(event) => { event.preventDefault(); navigateToView('contacts'); }}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />Criar contato
                </a>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Contatos" className="space-y-1 pr-3">
                {shownRecent.length > 0 && (
                  <p className="px-1 pt-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Enviados recentemente
                  </p>
                )}
                {shownRecent.map((contact) => (
                  <ContactRow
                    key={`recent-${contact.id}`}
                    contact={contact}
                    selected={selectedContact?.id === contact.id}
                    onSelect={onSelectContact}
                  />
                ))}
                {shownContacts.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    selected={selectedContact?.id === contact.id}
                    onSelect={onSelectContact}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <aside className="min-w-0 space-y-3">
          <RailCard icon={Package} color="violet" title="Resumo do envio">
            {productImageUrl ? (
              <img
                src={productImageUrl}
                alt={productName}
                className="w-24 h-24 rounded-lg object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
                <ImageOff className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <MetaRow icon={Package} label="Produto" value={productName} />
              <MetaRow icon={MessageSquare} label="Modelo" value={templateLabels[template]} />
              <MetaRow icon={Palette} label="Variação" value={variantLabel ?? 'Produto completo'} />
              <MetaRow icon={ImageIcon} label="Fotos" value={`${selectedImagesCount} foto(s)`} />
            </div>
          </RailCard>
          {/* AlertCard não aceita aria-live/role (só children/tone/actionLabel/
              onAction) — o anúncio acessível fica neste wrapper. O aviso só
              aparece quando o envio está realmente liberado, para não duplicar
              o AlertCard de bloqueio do rodapé. */}
          <div aria-live="polite">
            {selectedContact && !sendBlockedReason && !checkingSendReadiness && (
              <AlertCard tone="info">
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />Pronto para enviar!
                </span>
              </AlertCard>
            )}
          </div>
        </aside>
      </div>

      <div className="p-4 border-t space-y-2">
        {sendBlockedReason && (
          <AlertCard
            tone="warning"
            actionLabel={onRetrySendReadiness ? 'Tentar de novo' : undefined}
            onAction={onRetrySendReadiness ?? undefined}
          >
            {sendBlockedReason}
          </AlertCard>
        )}
        <div className="flex items-center gap-2">
          {/* CT-68 — progresso do envio anunciado: o rótulo do botão muda a cada
              lote, mas botão não é região viva. `sr-only` não ocupa layout. */}
          {isSending && (
            <span className="sr-only" role="status" aria-live="polite" data-testid="send-progress-live">
              {sendProgress ? `Enviando ${sendProgress.done} de ${sendProgress.total}` : 'Enviando'}
            </span>
          )}
          <Button variant="outline" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />Voltar
          </Button>
          <Button
            className="flex-1 gap-2"
            disabled={!selectedContact || isSending || checkingSendReadiness || !!sendBlockedReason}
            onClick={onSend}
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSending
              ? sendingLabel
              : selectedContact ? `Enviar para ${selectedContact.name}` : 'Selecione um contato'}
          </Button>
        </div>
      </div>
    </>
  );
}
