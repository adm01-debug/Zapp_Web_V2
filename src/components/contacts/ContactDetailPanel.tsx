import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  X, MessageSquare, Edit, Phone, Mail, Calendar, Tag, Clock,
  Package, Gauge, ChevronLeft, ChevronRight, ContactRound, Brain, History,
  NotebookPen, Database, MapPin, UserRound, BarChart3, Building, Globe,
} from 'lucide-react';
import { ContactActivityTimeline } from './ContactActivityTimeline';
import { ContactNotes } from './ContactNotes';
import { ContactPortrait } from './ContactPortrait';
import { ContactTypeBadge } from './ContactTypeBadge';
import { toContactDisplay } from './contactDisplay';
import type { Contact } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ContactEngagementScore } from './ContactEngagementScore';
import { ContactHealthIndicator } from './ContactCard';
import { normalizeE164BR } from '@/lib/calls/phone';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
import { useCatalogSendHistory } from '@/hooks/integrations/useCatalogSendHistory';
import { ContactService } from '@/services/contact.service';
import { useContactSidebar } from '@/hooks/crm/useContactSidebar';
import { SinguProfileTile } from '@/components/inbox/contact-details/sidebar/SinguProfileTile';
import { SidebarEmpty } from '@/components/inbox/contact-details/sidebar/SidebarEmpty';
import {
  discLabel, labelOrRaw, enneagramLabel, DECISION_SPEED_LABELS, VAK_LABELS,
  MBTI_LABELS, TEMPERAMENT_LABELS, BIG_FIVE_LABELS, BUDGET_AUTHORITY_LABELS,
} from '@/lib/singuLabels';
import type { SidebarBigFive, SidebarDecision } from '@/types/contactSidebar';
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
  /**
   * Endereço e responsável entram na completude. A lista (`search_contacts`)
   * devolve `address`; o responsável ainda NÃO vem nessa consulta — a chave
   * ausente é "não avaliado" em `src/lib/contactHealth.ts` (não vira "falta").
   */
  address?: string | null;
  assigned_to?: string | null;
}

interface ContactDetailPanelProps<T extends ContactDetail> {
  contact: T | null;
  onClose: () => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: T) => void;
  /**
   * ZD-078 — resultados do filtro atual, na ordem exibida. O painel usa a lista
   * só para saber quem vem antes/depois: a navegação circular fica dentro do
   * recorte que o operador está vendo, como no design. Sem a prop os botões de
   * anterior/próximo não aparecem — nunca inventamos uma vizinhança.
   */
  resultadoAtual?: Array<Pick<ContactDetail, 'id'>>;
  onNavigate?: (contactId: string) => void;
  /**
   * ZD-075 — o card "Origem dos dados / Singu CRM" só aparece quando a
   * integração está ligada (a ficha não afirma uma origem que não existe).
   */
  singuOrigem?: boolean;
  /** Abre o diálogo de busca no CRM (o `ContactCRMDialog` vive no ContactsView). */
  onBuscarCRM?: () => void;
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
      <h3 className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-[hsl(var(--contacts-muted))]">
        <Package className="h-3 w-3" />
        Produtos enviados
      </h3>

      {isLoading ? (
        <div className="space-y-2" data-testid="send-history-loading">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[hsl(var(--contacts-soft-line))]" />
          ))}
        </div>
      ) : error ? (
        <p className="text-2xs text-[hsl(var(--contacts-quiet))]" data-testid="send-history-error">
          Não foi possível carregar o histórico de envios.
        </p>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center" data-testid="send-history-empty">
          <Package className="mx-auto mb-2 h-8 w-8 text-[hsl(var(--contacts-quiet))]" />
          <p className="text-2xs text-[hsl(var(--contacts-quiet))]">Nenhum produto enviado para este contato</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="send-history-list">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-soft-line))] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[hsl(var(--contacts-ink))]">{row.product_name}</p>
                  {row.variant_label && <p className="text-caption">{row.variant_label}</p>}
                </div>
                {row.status && (
                  <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-3xs">
                    {SEND_STATUS_LABEL[row.status] || row.status}
                  </Badge>
                )}
              </div>
              <span className="mt-2 flex items-center gap-1 text-caption">
                <Calendar className="h-2.5 w-2.5" />
                {format(new Date(row.created_at), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/** Ordem canônica das abas da ficha — é a mesma do design: as setas ciclam nela. */
const TAB_ORDER = ['details', 'singu', 'history', 'notes'] as const;
type ProfileTab = (typeof TAB_ORDER)[number];

const TAB_LABEL: Record<ProfileTab, string> = {
  details: 'Visão geral',
  singu: 'Perfil Singu',
  history: 'Histórico',
  notes: 'Anotações',
};

const TAB_ICON: Record<ProfileTab, typeof ContactRound> = {
  details: ContactRound,
  singu: Brain,
  history: History,
  notes: NotebookPen,
};

/** Linha rótulo/valor de um grupo. Campo vazio nunca vira linha na ficha. */
interface ParDetalhe {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}

/**
 * Grupo de detalhe da ficha (`.zc-detail-group`): cartão com cabeçalho de
 * ícone + título. O corpo vem por children para cada grupo escolher a grade.
 */
function DetailGroup({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'mb-[13px] rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-[17px]',
        className,
      )}
    >
      <div className="mb-[17px] flex items-center justify-between gap-[9px]">
        <h3 className="flex items-center gap-[9px] font-display text-[18px] font-medium tracking-[-.2px] text-[hsl(var(--contacts-ink))]">
          <span className="grid h-[28px] w-[27px] shrink-0 place-items-center rounded-[7px] border border-[hsl(221_83%_53%/0.28)] bg-[hsl(var(--contacts-blue-soft))] text-[hsl(var(--contacts-blue))]">
            {icon}
          </span>
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

/** Grade rótulo/valor (`.zc-detail-grid`). */
function DetailPairs({ pares }: { pares: ParDetalhe[] }) {
  const preenchidos = pares.filter((par) => !!par.value);
  if (preenchidos.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-[22px] gap-y-[17px] max-[559px]:grid-cols-1">
      {preenchidos.map((par) => (
        <div key={par.label} className={cn('min-w-0', par.wide && 'col-span-full')}>
          <dt className="mb-[5px] text-2xs text-[hsl(var(--contacts-muted))]">{par.label}</dt>
          <dd className="m-0 break-words text-[13px] leading-[1.65] text-[hsl(var(--contacts-ink))]">{par.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Big Five resumido: só as dimensões que o Singu devolveu. */
function resumoBigFive(bigFive: SidebarBigFive | null): string | null {
  if (!bigFive) return null;
  const partes = (Object.keys(BIG_FIVE_LABELS) as Array<keyof SidebarBigFive>)
    .map((chave) => {
      const valor = bigFive[chave as keyof SidebarBigFive];
      if (typeof valor !== 'number') return null;
      return `${BIG_FIVE_LABELS[String(chave)]} ${Math.round(valor)}`;
    })
    .filter((parte): parte is string => parte !== null);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** Forma de decisão: velocidade + quem aprova, quando o Singu informa. */
function resumoDecisao(decisao: SidebarDecision | null | undefined): string | null {
  if (!decisao) return null;
  const partes = [
    labelOrRaw(DECISION_SPEED_LABELS, decisao.speed),
    decisao.approver_name ? `Aprova com ${decisao.approver_name}` : null,
  ].filter((parte): parte is string => !!parte);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/**
 * ZD-075 — conteúdo da aba "Perfil Singu".
 *
 * Fica num componente próprio porque `useContactSidebar` sobe por
 * `useCRMIntegrationEnabled` até `useAuth`, que lança fora do `AuthProvider`.
 * Como a aba só monta quando o operador a seleciona, a ficha continua montável
 * em teste sem provider — e o consumo real do CRM segue o wiring canônico do
 * inbox (`onBuscarCRM` → `ContactCRMDialog`, `refetch` → nova consulta da RPC).
 */
function SinguTab({ contactId, onBuscarCRM }: { contactId: string; onBuscarCRM?: () => void }) {
  const sidebar = useContactSidebar(contactId);
  const perfil = sidebar.data?.singu_profile ?? null;

  if (sidebar.status === 'loading') {
    return (
      <div className="space-y-2" data-testid="singu-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[10px]" />
        ))}
      </div>
    );
  }

  if (sidebar.status === 'disabled') {
    return (
      <SidebarEmpty
        cause="singu-desligado"
        icon={<Database />}
        message="A integração com o Singu está desligada. Ligue a integração para ver o perfil de relacionamento deste contato."
        cta={onBuscarCRM ? { label: 'Buscar no CRM', onClick: onBuscarCRM } : undefined}
      />
    );
  }

  if (sidebar.status === 'error') {
    return (
      <SidebarEmpty
        cause="singu-erro"
        icon={<Database />}
        message="Não foi possível consultar o Singu agora."
        cta={{ label: 'Tentar de novo', onClick: () => void sidebar.refetch() }}
      />
    );
  }

  if (sidebar.status === 'not_found' || !perfil) {
    return (
      <SidebarEmpty
        cause="singu-nao-encontrado"
        icon={<Database />}
        message="Este contato ainda não tem perfil no Singu."
        cta={onBuscarCRM ? { label: 'Buscar no CRM', onClick: onBuscarCRM } : undefined}
      />
    );
  }

  const foco = [sidebar.data?.professional?.empresa?.nome, sidebar.data?.professional?.cargo]
    .filter((parte): parte is string => !!parte)
    .join(' · ');

  return (
    <>
      <DetailGroup icon={<Brain className="h-[15px] w-[15px]" />} title="Perfil de relacionamento">
        <DetailPairs
          pares={[
            { label: 'Foco profissional', value: foco },
            { label: 'Forma de decisão', value: resumoDecisao(perfil.decision) },
            { label: 'Autoridade de compra', value: labelOrRaw(BUDGET_AUTHORITY_LABELS, perfil.budget?.authority) },
            { label: 'Motivações e objetivos', value: perfil.fears_motivation?.professional_goals },
            { label: 'Pressão atual', value: perfil.fears_motivation?.current_pressure, wide: true },
          ]}
        />
      </DetailGroup>

      <DetailGroup icon={<BarChart3 className="h-[15px] w-[15px]" />} title="Modelos de perfil">
        <div className="grid grid-cols-2 gap-[8px] max-[559px]:grid-cols-1">
          <SinguProfileTile name="disc" icon={<Brain />} label="DISC" value={discLabel(perfil.disc?.primary, perfil.disc?.blend)} />
          <SinguProfileTile name="vak" icon={<Brain />} label="VAK" value={labelOrRaw(VAK_LABELS, perfil.vak?.primary)} />
          <SinguProfileTile name="big_five" icon={<Brain />} label="Big Five" value={resumoBigFive(perfil.big_five)} />
          <SinguProfileTile name="mbti" icon={<Brain />} label="MBTI" value={labelOrRaw(MBTI_LABELS, perfil.mbti?.type)} />
          <SinguProfileTile name="enneagram" icon={<Brain />} label="Eneagrama" value={enneagramLabel(perfil.enneagram?.type, perfil.enneagram?.wing)} />
          <SinguProfileTile name="temperament" icon={<Brain />} label="Temperamento" value={labelOrRaw(TEMPERAMENT_LABELS, perfil.temperament?.primary)} />
        </div>
        <p className="mt-4 text-2xs leading-[1.8] text-[hsl(var(--contacts-quiet))]">
          Os campos aparecem conforme o preenchimento no Singu — modelo sem avaliação fica como “Não avaliado”.
        </p>
      </DetailGroup>
    </>
  );
}
export function ContactDetailPanel<T extends ContactDetail>({
  contact, onClose, onOpenChat, onEdit,
  resultadoAtual, onNavigate, singuOrigem, onBuscarCRM,
}: ContactDetailPanelProps<T>) {
  const activity = useContactActivity(contact?.id);
  const activityReady = !!activity.data && !activity.isError;

  // Aba selecionada. Volta para "Visão geral" quando o operador troca de
  // contato pela navegação anterior/próximo: a aba de um não é a do outro.
  const [aba, setAba] = useState<ProfileTab>('details');
  const idAtualRef = useRef(contact?.id);
  useEffect(() => {
    if (idAtualRef.current !== contact?.id) {
      idAtualRef.current = contact?.id;
      setAba('details');
    }
  }, [contact?.id]);

  const abaRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({
    details: null, singu: null, history: null, notes: null,
  });
  const fecharRef = useRef<HTMLButtonElement | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);

  // O Esc NÃO é tratado aqui: quem fecha o painel é o handler central de
  // atalhos (`useContactsViewState`), que só fecha a camada de topo — com um
  // diálogo Radix aberto por cima, o Esc é do diálogo e a ficha fica. Um
  // listener próprio aqui fechava as duas camadas com um único Esc.

  // Foco entra na ficha (no botão fechar) e volta para quem abriu ao sair.
  useEffect(() => {
    const anterior = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null;
    fecharRef.current?.focus();
    return () => { anterior?.focus?.(); };
  }, []);

  /** Tab fica preso dentro da ficha enquanto ela está aberta. */
  const prenderFoco = useCallback((evento: React.KeyboardEvent<HTMLDivElement>) => {
    const tecla = evento.key;
    if (tecla !== 'Tab') return;
    const focaveis = caixaRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    if (!focaveis || focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;
    if (!evento.shiftKey && ativo === ultimo) { evento.preventDefault(); primeiro.focus(); }
    else if (evento.shiftKey && ativo === primeiro) { evento.preventDefault(); ultimo.focus(); }
  }, []);

  /** Setas ciclam as abas (padrão ARIA de tablist horizontal). */
  const tecladoAba = useCallback((evento: React.KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const tecla = evento.key;
    const paraFrente = tecla === 'ArrowRight' || tecla === 'ArrowDown';
    const paraTras = tecla === 'ArrowLeft' || tecla === 'ArrowUp';
    if (!paraFrente && !paraTras) return;
    evento.preventDefault();
    const total = TAB_ORDER.length;
    const proxima = TAB_ORDER[(indice + (paraFrente ? 1 : total - 1)) % total];
    setAba(proxima);
    abaRefs.current[proxima]?.focus();
  }, []);

  const vizinhos = useMemo(() => {
    if (!contact || !resultadoAtual || resultadoAtual.length < 2) return { anterior: null, proximo: null };
    const indice = resultadoAtual.findIndex((item) => item.id === contact.id);
    if (indice < 0) return { anterior: null, proximo: null };
    const total = resultadoAtual.length;
    return {
      anterior: resultadoAtual[(indice + total - 1) % total]?.id ?? null,
      proximo: resultadoAtual[(indice + 1) % total]?.id ?? null,
    };
  }, [contact, resultadoAtual]);

  const irPara = (id: string | null) => {
    if (!id || !onNavigate) return;
    onNavigate(id);
  };

  if (!contact) return null;

  const display = toContactDisplay(contact);
  // Sem telefone utilizável (E.164 brasileiro) não há WhatsApp de destino, e
  // sem destino não há envio de produto: o gatilho do catálogo fica bloqueado.
  const hasWhatsApp = normalizeE164BR(contact.phone) !== null;
  const criadoEm = format(new Date(contact.created_at), "dd 'de' MMM, yyyy", { locale: ptBR });

  return (
    <AnimatePresence>
      <motion.div
        key="detail-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-start justify-center bg-[hsl(0_0%_2%/0.85)] p-[25px] backdrop-blur-[8px] max-[659px]:p-[12px] max-[559px]:p-[9px]"
        onClick={(evento) => { if (evento.target === evento.currentTarget) onClose(); }}
      >
        <motion.div
          key="detail-panel"
          ref={caixaRef}
          initial={{ opacity: 0, scale: 0.975, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.985, y: 6 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          onKeyDown={prenderFoco}
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes do contato ${contact.name}`}
          className="flex max-h-full w-full max-w-[1050px] flex-col overflow-hidden rounded-[17px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] shadow-[0_30px_90px_hsl(0_0%_0%/0.6)] max-[659px]:rounded-[13px] motion-reduce:transform-none"
        >
          {/* Cabeçalho da ficha */}
          <div className="flex shrink-0 items-center justify-between gap-[13px] border-b border-[hsl(var(--contacts-line))] bg-[linear-gradient(120deg,hsl(var(--contacts-raised)),hsl(var(--contacts-panel)))] p-[15px_20px] max-[659px]:p-[12px_15px] max-[559px]:p-[11px]">
            <div className="flex min-w-0 items-center gap-[8px] text-[12px] text-[hsl(var(--contacts-muted))] max-[659px]:text-[11px] max-[559px]:max-w-[140px]">
              <ContactRound className="h-4 w-4 shrink-0 text-[hsl(var(--contacts-blue))]" aria-hidden="true" />
              <span className="truncate">Contatos / Ficha completa</span>
            </div>

            <div className="flex shrink-0 items-center gap-[6px]">
              {resultadoAtual && resultadoAtual.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => irPara(vizinhos.anterior)}
                    disabled={!vizinhos.anterior}
                    aria-label="Ver contato anterior"
                    className={cn(
                      'grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[hsl(var(--contacts-line))]',
                      'bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-muted))] transition-colors',
                      'hover:bg-[hsl(var(--contacts-soft-line))] hover:text-[hsl(var(--contacts-ink))]',
                      'disabled:pointer-events-none disabled:opacity-40 max-[559px]:h-[28px] max-[559px]:w-[27px]',
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => irPara(vizinhos.proximo)}
                    disabled={!vizinhos.proximo}
                    aria-label="Ver próximo contato"
                    className={cn(
                      'grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[hsl(var(--contacts-line))]',
                      'bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-muted))] transition-colors',
                      'hover:bg-[hsl(var(--contacts-soft-line))] hover:text-[hsl(var(--contacts-ink))]',
                      'disabled:pointer-events-none disabled:opacity-40 max-[559px]:h-[28px] max-[559px]:w-[27px]',
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                ref={fecharRef}
                type="button"
                onClick={onClose}
                aria-label="Fechar detalhes do contato"
                className={cn(
                  'grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[hsl(var(--contacts-line))]',
                  'bg-[hsl(var(--contacts-soft-line))] text-[hsl(var(--contacts-muted))] transition-colors',
                  'hover:bg-[hsl(var(--contacts-line))] hover:text-[hsl(var(--contacts-ink))]',
                  'max-[559px]:h-[28px] max-[559px]:w-[27px]',
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-[280px_minmax(0,1fr)] max-[1199px]:grid-cols-[257px_minmax(0,1fr)] max-[899px]:grid-cols-[226px_minmax(0,1fr)] max-[659px]:grid-cols-1">
              {/* Coluna do retrato e da identidade */}
              <aside
                className={cn(
                  'min-w-0 border-r border-[hsl(var(--contacts-line))] p-5',
                  'bg-[linear-gradient(160deg,hsl(var(--contacts-raised)),hsl(var(--contacts-panel)))]',
                  'max-[899px]:p-4',
                  'max-[659px]:grid max-[659px]:grid-cols-[126px_1fr] max-[659px]:gap-x-[17px] max-[659px]:border-r-0',
                  'max-[659px]:border-b max-[659px]:p-[18px]',
                  'max-[559px]:grid-cols-[112px_1fr] max-[559px]:gap-x-[13px] max-[559px]:p-4',
                )}
              >
                <div className="group/photo relative h-[282px] overflow-hidden rounded-[11px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-soft-line))] max-[1199px]:h-[279px] max-[899px]:h-[251px] max-[659px]:col-start-1 max-[659px]:row-[1/5] max-[659px]:h-[169px] max-[559px]:h-[159px]">
                  <ContactPortrait contact={contact as unknown as Contact} className="h-full w-full" />
                  <span className="absolute bottom-3 left-3">
                    <ContactTypeBadge type={contact.contact_type} size="overlay" />
                  </span>
                </div>

                <div className="max-[659px]:col-start-2">
                  <h2 className="mb-[7px] mt-[18px] font-display text-[29px] font-medium leading-[1.15] tracking-[-.5px] text-[hsl(var(--contacts-ink))] max-[899px]:text-[26px] max-[659px]:mb-[5px] max-[659px]:mt-[3px] max-[659px]:text-[26px] max-[559px]:text-[24px]">
                    {display.nomeCompleto ?? contact.name}
                  </h2>
                  {display.apelido && (
                    <p className="m-0 text-[12px] leading-[1.75] text-[hsl(var(--contacts-muted))] max-[659px]:text-[11px]">
                      “{display.apelido}”
                    </p>
                  )}
                  {display.cargo && (
                    <p className="m-0 text-[12px] leading-[1.75] text-[hsl(var(--contacts-muted))] max-[659px]:text-[11px]">
                      {display.cargo}
                    </p>
                  )}
                  {display.empresa && (
                    <p className="mt-1 text-[13px] font-medium text-[hsl(var(--contacts-ink))] max-[659px]:text-[12px]">
                      {display.empresa}
                    </p>
                  )}
                </div>

                <div
                  className={cn(
                    'mt-5 grid gap-3 border-t border-[hsl(var(--contacts-line))] pt-[18px] text-[12px] text-[hsl(var(--contacts-muted))]',
                    'max-[659px]:col-span-full max-[659px]:mt-[17px] max-[659px]:flex max-[659px]:flex-wrap max-[659px]:gap-[11px_20px]',
                    'max-[659px]:pt-[15px] max-[659px]:text-[11px]',
                  )}
                >
                  {display.regiao && (
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-[14px] w-[14px] shrink-0 text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">{display.regiao}</span>
                    </div>
                  )}
                  {display.telefone && (
                    <div className="flex min-w-0 items-center gap-2">
                      <Phone className="h-[14px] w-[14px] shrink-0 text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">{display.telefone}</span>
                    </div>
                  )}
                  {display.email && (
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail className="h-[14px] w-[14px] shrink-0 text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">{display.email}</span>
                    </div>
                  )}
                </div>

                {singuOrigem && (
                  <div
                    className={cn(
                      'mt-[22px] flex items-center gap-[10px] rounded-[9px] border border-[hsl(var(--contacts-line))] p-3',
                      'bg-[linear-gradient(135deg,hsl(var(--contacts-raised)),hsl(var(--contacts-panel)))]',
                      'text-[12px] text-[hsl(var(--contacts-muted))]',
                      'max-[659px]:col-start-2 max-[659px]:mt-[11px] max-[659px]:self-end max-[659px]:gap-2 max-[659px]:p-2 max-[659px]:text-[11px]',
                      'max-[559px]:gap-[6px] max-[559px]:p-[7px]',
                    )}
                  >
                    <Database className="h-[19px] w-[19px] shrink-0 text-[hsl(var(--contacts-blue))] max-[659px]:h-4 max-[659px]:w-4 max-[559px]:h-[14px] max-[559px]:w-[14px]" aria-hidden="true" />
                    <div className="min-w-0">
                      <small className="mb-[2px] block text-[11px] text-[hsl(var(--contacts-quiet))]">Origem dos dados</small>
                      <span className="truncate">Singu CRM</span>
                    </div>
                  </div>
                )}

                {/* Ações — o "header" do contato é esta ficha. */}
                <div className={cn('mt-5 flex flex-col gap-2', 'max-[659px]:col-span-full')}>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => onOpenChat(contact.id)}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Conversar
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => onEdit(contact)}>
                      <Edit className="h-4 w-4" />
                      Editar
                    </Button>
                  </div>

                  {/* CT-52 — envia um produto do catálogo com ESTE contato já
                      pré-selecionado; o envio grava `catalog_send_events` com o
                      contact_id do perfil (CT-14). Sem WhatsApp o catálogo é
                      forçado fechado e o gatilho fica desabilitado com o motivo
                      no `title` do <span> (o botão desabilitado não recebe hover). */}
                  <ExternalProductCatalog
                    presetContact={{
                      id: contact.id,
                      name: contact.name,
                      phone: contact.phone,
                      avatar_url: contact.avatar_url ?? null,
                    }}
                    open={hasWhatsApp ? undefined : false}
                    onOpenChange={hasWhatsApp ? undefined : () => {}}
                    trigger={
                      hasWhatsApp ? (
                        <Button variant="outline" className="w-full gap-2">
                          <Package className="h-4 w-4" />
                          Enviar produto
                        </Button>
                      ) : (
                        <span className="block w-full" title="Contato sem WhatsApp">
                          <Button variant="outline" className="w-full gap-2" disabled>
                            <Package className="h-4 w-4" />
                            Enviar produto
                          </Button>
                        </span>
                      )
                    }
                  />
                </div>
              </aside>
              {/* Coluna principal: abas + conteúdo */}
              <div className="min-w-0 p-5 max-[899px]:p-[15px]">
                <div
                  role="tablist"
                  aria-label="Informações do contato"
                  className={cn(
                    'mb-4 flex gap-[5px] rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-page))] p-[5px]',
                    'max-[899px]:grid max-[899px]:grid-cols-2',
                    'max-[659px]:flex',
                    'max-[559px]:grid max-[559px]:grid-cols-2',
                  )}
                >
                  {TAB_ORDER.map((id, indice) => {
                    const Icone = TAB_ICON[id];
                    const selecionada = aba === id;
                    return (
                      <button
                        key={id}
                        ref={(elemento) => { abaRefs.current[id] = elemento; }}
                        type="button"
                        role="tab"
                        id={`zc-tab-${id}`}
                        aria-selected={selecionada}
                        aria-controls="zc-profile-content"
                        tabIndex={selecionada ? 0 : -1}
                        onClick={() => setAba(id)}
                        onKeyDown={(evento) => tecladoAba(evento, indice)}
                        className={cn(
                          'flex min-w-0 flex-1 items-center justify-center gap-[6px] whitespace-nowrap rounded-[7px] border border-transparent',
                          'px-[7px] py-[9px] text-[11px] text-[hsl(var(--contacts-muted))] transition-colors',
                          'max-[1199px]:gap-[5px] max-[1199px]:px-[6px]',
                          'max-[559px]:px-[9px]',
                          selecionada
                            ? 'border-[hsl(221_83%_53%/0.55)] bg-[linear-gradient(140deg,hsl(var(--contacts-blue)),hsl(221_83%_45%))] text-white shadow-[0_2px_7px_hsl(0_0%_0%/0.2)]'
                            : 'hover:bg-[hsl(var(--contacts-raised))] hover:text-[hsl(var(--contacts-ink))]',
                        )}
                      >
                        <Icone
                          className={cn(
                            'h-[14px] w-[14px] shrink-0',
                            'max-[1199px]:hidden',
                            'max-[899px]:inline',
                            'max-[659px]:hidden',
                            'max-[559px]:inline',
                          )}
                          aria-hidden="true"
                        />
                        {TAB_LABEL[id]}
                      </button>
                    );
                  })}
                </div>

                <div
                  id="zc-profile-content"
                  role="tabpanel"
                  aria-labelledby={`zc-tab-${aba}`}
                >
                  {aba === 'details' && (
                    <>
                      <DetailGroup icon={<Building className="h-[15px] w-[15px]" />} title="Dados profissionais">
                        <DetailPairs
                          pares={[
                            { label: 'Empresa', value: display.empresa },
                            { label: 'Departamento', value: display.departamento },
                            { label: 'Cargo', value: display.cargo },
                            { label: 'Tipo de relacionamento', value: display.tipo },
                          ]}
                        />

                        <div className="mt-[19px] grid grid-cols-2 gap-[22px] border-t border-[hsl(var(--contacts-line))] pt-[17px] max-[559px]:grid-cols-1">
                          <div>
                            <h4 className="mb-3 flex items-center gap-[7px] font-display text-[15px] font-medium text-[hsl(var(--contacts-ink))]">
                              <Phone className="h-[14px] w-[14px] text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
                              Telefones
                            </h4>
                            {display.telefone ? (
                              <div className="mb-[13px] grid gap-1">
                                <span className="text-2xs text-[hsl(var(--contacts-muted))]">WhatsApp</span>
                                <strong className="text-[12px] font-normal text-[hsl(var(--contacts-ink))]">{display.telefone}</strong>
                              </div>
                            ) : (
                              <p className="m-0 text-2xs text-[hsl(var(--contacts-quiet))]">Nenhum telefone cadastrado.</p>
                            )}
                          </div>
                          <div>
                            <h4 className="mb-3 flex items-center gap-[7px] font-display text-[15px] font-medium text-[hsl(var(--contacts-ink))]">
                              <Mail className="h-[14px] w-[14px] text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
                              E-mails
                            </h4>
                            {display.email ? (
                              <div className="mb-[13px] grid gap-1">
                                <span className="text-2xs text-[hsl(var(--contacts-muted))]">Principal</span>
                                <strong className="break-words text-[12px] font-normal text-[hsl(var(--contacts-ink))]">{display.email}</strong>
                              </div>
                            ) : (
                              <p className="m-0 text-2xs text-[hsl(var(--contacts-quiet))]">Nenhum e-mail cadastrado.</p>
                            )}
                          </div>
                        </div>
                      </DetailGroup>

                      <DetailGroup icon={<UserRound className="h-[15px] w-[15px]" />} title="Dados pessoais">
                        <DetailPairs
                          pares={[
                            { label: 'Nome completo', value: display.nomeCompleto },
                            { label: 'Apelido', value: display.apelido },
                            { label: 'Cidade/Estado', value: display.regiao },
                            { label: 'Cadastrado em', value: criadoEm },
                            { label: 'Endereço', value: contact.address, wide: true },
                          ]}
                        />
                      </DetailGroup>

                      {contact.tags && contact.tags.length > 0 && (
                        <DetailGroup icon={<Tag className="h-[15px] w-[15px]" />} title="Tags">
                          <div className="flex flex-wrap gap-[6px]">
                            {contact.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-2xs">{tag}</Badge>
                            ))}
                          </div>
                        </DetailGroup>
                      )}

                      <DetailGroup icon={<Gauge className="h-[15px] w-[15px]" />} title="Completude do cadastro">
                        <ContactHealthIndicator input={contact} size="md" />
                      </DetailGroup>

                      <div
                        data-testid="activity-summary"
                        data-state={activity.isLoading ? 'loading' : activityReady ? 'ready' : 'unavailable'}
                      >
                        <DetailGroup icon={<Clock className="h-[15px] w-[15px]" />} title="Atividade">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] p-3 text-center">
                              {activity.isLoading ? (
                                <Skeleton className="mx-auto h-6 w-12" data-testid="activity-count-loading" />
                              ) : (
                                <p className="text-lg font-bold text-[hsl(var(--contacts-ink))]" data-testid="activity-message-count">
                                  {activityReady ? activity.data!.messageCount : '—'}
                                </p>
                              )}
                              <p className="text-caption">Mensagens</p>
                            </div>
                            <div className="rounded-lg border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] p-3 text-center">
                              {activity.isLoading ? (
                                <Skeleton className="mx-auto h-4 w-10" data-testid="activity-last-loading" />
                              ) : (
                                <p className="text-sm font-medium text-[hsl(var(--contacts-ink))]" data-testid="activity-last-message">
                                  {activityReady && activity.data!.lastMessageAt
                                    ? format(new Date(activity.data!.lastMessageAt), 'dd/MM', { locale: ptBR })
                                    : '—'}
                                </p>
                              )}
                              <p className="text-caption">Última msg</p>
                            </div>
                          </div>

                          {/* Engajamento só é calculado quando a atividade é
                              conhecida: sem os insumos (nº de mensagens + última),
                              o painel não afirma "Inativo". (#253) */}
                          <div className="mt-3">
                            {activity.isLoading ? (
                              <div
                                data-testid="engagement-loading"
                                role="status"
                                className="h-8 w-28 animate-pulse rounded-full bg-[hsl(var(--contacts-soft-line))]"
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
                                className="text-2xs text-[hsl(var(--contacts-quiet))]"
                              >
                                Atividade indisponível
                              </span>
                            )}
                          </div>
                        </DetailGroup>
                      </div>

                      <DetailGroup icon={<Globe className="h-[15px] w-[15px]" />} title="Redes sociais e links">
                        <p className="m-0 text-2xs leading-[1.8] text-[hsl(var(--contacts-quiet))]">
                          Nenhuma rede social vinculada a este contato.
                        </p>
                      </DetailGroup>

                      <div className="flex flex-wrap items-center justify-between gap-[10px] pt-[3px] text-2xs text-[hsl(var(--contacts-quiet))]">
                        <span className="flex items-center gap-[5px]">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {display.ultimoContato ?? `Cadastrado em ${criadoEm}`}
                        </span>
                      </div>
                    </>
                  )}

                  {aba === 'singu' && (
                    <SinguTab contactId={contact.id} onBuscarCRM={onBuscarCRM} />
                  )}

                  {aba === 'history' && (
                    <ContactActivityTimeline
                      contactId={contact.id}
                      contactCreatedAt={contact.created_at}
                    />
                  )}

                  {aba === 'notes' && <ContactNotes contactId={contact.id} />}

                  {aba === 'details' && (
                    <div className="mt-[13px]">
                      <ContactCatalogSendHistory contactId={contact.id} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}