import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, Check, Bell, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useReminderOffer } from '@/hooks/assistant/useReminderOffer';
import { SectionCard } from './SectionCard';

interface AssistantAgendaCardProps {
  contactId: string;
  contactName: string;
  /** Última mensagem RECEBIDA do cliente — é dela que sai a oferta de lembrete. */
  lastContactMessage?: string | null;
  onCreated?: () => void;
}

function fmt(iso: string): string {
  return format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR });
}

/**
 * Fase 2 do assistente pessoal — Memória (agenda).
 *
 * Duas metades da mesma capacidade:
 *  - LER: mostra os compromissos futuros já marcados com este contato.
 *  - ESCREVER: quando a última mensagem do cliente traz uma data ("me liga na
 *    quinta"), oferece o lembrete pronto para aceitar com UM clique.
 */
export function AssistantAgendaCard({ contactId, contactName, lastContactMessage, onCreated }: AssistantAgendaCardProps) {
  const { offer, agendaItems, agendaLoading, agendaError, isSaving, saveError, accept, dismiss } = useReminderOffer(
    contactId,
    contactName,
    lastContactMessage
  );

  const temAgenda = agendaItems.length > 0;

  return (
    <SectionCard
      icon={CalendarClock}
      title="Agenda do contato"
      subtitle={temAgenda ? `${agendaItems.length} compromisso(s) futuro(s)` : 'Lembretes marcados com este contato'}
      tone="yellow"
    >
      {offer && (
        <div
          className="rounded-lg border border-primary/30 bg-primary/10 p-3 flex flex-col gap-2"
          data-testid="reminder-offer"
          role="group"
          aria-label="Oferta de lembrete"
        >
          <div className="flex items-start gap-2">
            <span className="w-7 h-7 rounded-lg bg-kpi-purple text-kpi-purple-fg flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Criar lembrete?</p>
              <p className="text-xs text-muted-foreground">
                O cliente mencionou <span className="font-medium text-foreground">{offer.matchedText}</span> — {fmt(offer.remindAt)}.
              </p>
            </div>
          </div>
          <Input
            value={offer.title}
            readOnly
            aria-label="Título do lembrete sugerido"
            data-testid="reminder-offer-title"
            className="h-8 text-xs bg-background"
          />
          {saveError && (
            <p role="alert" className="text-xs text-destructive" data-testid="reminder-offer-error">
              {saveError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={isSaving}
              data-testid="reminder-offer-accept"
              onClick={() => {
                void accept().then((id) => {
                  if (id) onCreated?.();
                });
              }}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
              Criar lembrete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={isSaving}
              data-testid="reminder-offer-dismiss"
              onClick={dismiss}
            >
              <X className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Agora não
            </Button>
          </div>
        </div>
      )}

      {agendaLoading ? (
        <div className="h-12 rounded-lg bg-muted/30 motion-safe:animate-pulse" role="status" aria-label="Carregando agenda" />
      ) : agendaError ? (
        <p role="alert" className="text-xs text-destructive" data-testid="agenda-error">
          Não foi possível ler a agenda deste contato. Confirme os compromissos manualmente.
        </p>
      ) : !temAgenda && !offer ? (
        <p className="text-xs text-muted-foreground" data-testid="agenda-empty">
          Nenhum compromisso futuro com {contactName}.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="agenda-list">
          {agendaItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5">
              <Bell className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
              <span className="text-xs truncate flex-1" title={item.title}>{item.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{fmt(item.remindAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}