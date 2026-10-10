import type { ReactNode } from 'react';
import {
  Ban, CheckCircle2, Database, FileText, Filter, Gauge, Megaphone, Pause,
  Rocket, Send, ShieldOff, SlidersHorizontal, Trash2, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_STATUS, KpiCard, ModuleHeader, RailAction, StatusPill, TalkXFilterBar,
  TalkXTable, fmtInt, type TalkXColumn,
} from '../talkxShared';
import {
  TalkXCrmUnavailableState, TalkXEmptyState, TalkXErrorState, TalkXNoPermissionState,
  TalkXSkeletonRows, TalkXWhatsAppDisconnectedState,
} from '../kit/states';
import {
  TALKX_FORCED_STATE_TITLES, TALKX_FORCED_STATES, currentTalkXForcedState,
  type TalkXForcedState,
} from '../kit/forcedState';

/**
 * X055 — prancha de referência do Talk X (`?view=talkx-kit`).
 *
 * Página SÓ de desenvolvimento (a trava é `import.meta.env.DEV` ou
 * `VITE_TALKX_KIT=1`, em `kit/forcedState.ts`): mostra, num lugar só, os 6
 * estados do sistema, 5 modais críticos desenhados no lugar e a galeria de
 * tabela/KPI/barra de filtros — para conferir contra o mock 17 antes de
 * liberar uma tela. `?talkxState=<empty|loading|error|crm|wa|perm>` força o
 * estado correspondente nas telas do módulo que usam o `TalkXQueryBoundary`.
 */

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

/** Linha de demonstração da galeria de tabela. */
interface LinhaDemo { id: string; nome: string; status: string; enviados: number }

const LINHAS_DEMO: LinhaDemo[] = [
  { id: 'demo-1', nome: 'Promoção Setembro', status: 'sending', enviados: 1280 },
  { id: 'demo-2', nome: 'Reativação Outubro', status: 'scheduled', enviados: 0 },
  { id: 'demo-3', nome: 'Pesquisa de satisfação', status: 'completed', enviados: 640 },
];

const COLUNAS_DEMO: TalkXColumn<LinhaDemo>[] = [
  { key: 'nome', header: 'Campanha', render: (r) => <span className="text-foreground">{r.nome}</span> },
  { key: 'status', header: 'Status', width: 140, render: (r) => <StatusPill status={r.status} map={CAMPAIGN_STATUS} /> },
  { key: 'enviados', header: 'Enviados', width: 110, align: 'right', render: (r) => fmtInt(r.enviados) },
];

/** Moldura do modal crítico desenhada no lugar (sem portal, sem ação real). */
function ModalPreset({
  icone, titulo, descricao, rotuloConfirmar, tom = 'primary', children,
}: {
  icone: ReactNode;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  tom?: 'primary' | 'danger' | 'warning';
  children?: ReactNode;
}) {
  const cor = {
    primary: 'bg-primary text-primary-foreground',
    danger: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  }[tom];
  return (
    <div data-testid="talkx-kit-modal" className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
        <p className="text-[13px] font-semibold text-foreground">{titulo}</p>
        <span aria-hidden="true" className="text-muted-foreground">✕</span>
      </div>
      <div className="flex items-start gap-3 px-4 py-4">
        {icone}
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs leading-relaxed text-foreground-secondary">{descricao}</p>
          {children}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border/70 px-4 py-2.5">
        <span className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">Cancelar</span>
        <span className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', cor)}>{rotuloConfirmar}</span>
      </div>
    </div>
  );
}

function TituloSecao({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
      <p className="text-xs text-foreground-secondary">{subtitulo}</p>
    </div>
  );
}

/** Cartão de estado do sistema, na ordem do mock 17. */
function CartaoEstado({ estado, children }: { estado: TalkXForcedState; children: ReactNode }) {
  return (
    <div data-testid={`talkx-kit-estado-${estado}`} className="space-y-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{estado}</p>
      {children}
    </div>
  );
}

export function TalkXKit() {
  const forced = currentTalkXForcedState();

  return (
    <div data-testid="talkx-kit" className="min-h-full bg-background px-4 py-4 space-y-5 md:px-6">
      <ModuleHeader
        icon={Megaphone}
        color="blue"
        title="Campanhas - Talk X"
        subtitle="Estados do sistema e modais • Referência para implementação e QA"
        right={
          <span className="rounded-full border border-border px-2.5 py-0.5 text-2xs font-medium text-muted-foreground">
            ?view=talkx-kit
          </span>
        }
      />

      {forced && (
        <div data-testid="talkx-kit-forcado" className="rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 space-y-0.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-primary">
            Estado forçado por URL — ?talkxState={forced}
          </p>
          <p data-testid="talkx-kit-forcado-titulo" className="text-sm font-bold text-foreground">
            {TALKX_FORCED_STATE_TITLES[forced]}
          </p>
          <p className="text-xs text-foreground-secondary">
            Enquanto este parâmetro estiver na URL, as telas do Talk X que usam o boundary abrem neste estado.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        <aside data-testid="talkx-kit-trilha" className="flex w-full shrink-0 flex-col gap-2 lg:w-56">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Trilha</p>
          <RailAction icon={Rocket} color="blue" title="Campanhas" subtitle="Visão geral" />
          <RailAction icon={Users} color="violet" title="Segmentos" subtitle="Biblioteca" />
          <RailAction icon={FileText} color="green" title="Templates" subtitle="Mensagens" />
          <RailAction icon={ShieldOff} color="amber" title="Supressão" subtitle="Lista de bloqueio" />
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          <section className="space-y-3">
            <TituloSecao
              titulo="Estados do Sistema"
              subtitulo="Principais estados da interface da listagem de campanhas"
            />
            <div data-testid="talkx-kit-estados" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CartaoEstado estado="empty">
                <TalkXEmptyState preset="emptyCampaigns" />
              </CartaoEstado>
              <CartaoEstado estado="loading">
                <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 px-4 py-6">
                  <TalkXSkeletonRows rows={4} />
                </div>
              </CartaoEstado>
              <CartaoEstado estado="error">
                <TalkXErrorState entity="campanhas" onRetry={() => undefined} />
              </CartaoEstado>
              <CartaoEstado estado="crm">
                <TalkXCrmUnavailableState />
              </CartaoEstado>
              <CartaoEstado estado="wa">
                <TalkXWhatsAppDisconnectedState onConnect={() => undefined} />
              </CartaoEstado>
              <CartaoEstado estado="perm">
                <TalkXNoPermissionState />
              </CartaoEstado>
            </div>
          </section>

          <section className="space-y-3">
            <TituloSecao
              titulo="Modais Críticos"
              subtitulo="Principais modais de ação utilizados no módulo de campanhas"
            />
            <div data-testid="talkx-kit-modais" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <ModalPreset
                icone={<Trash2 className="h-5 w-5 text-destructive" />}
                titulo="Excluir Campanha"
                descricao="Tem certeza que deseja excluir a campanha? Esta ação não pode ser desfeita."
                rotuloConfirmar="Excluir"
                tom="danger"
              />
              <ModalPreset
                icone={<Ban className="h-5 w-5 text-destructive" />}
                titulo="Cancelar Campanha"
                descricao="A campanha para de enviar imediatamente. Os envios já despachados não voltam atrás."
                rotuloConfirmar="Cancelar campanha"
                tom="danger"
              />
              <ModalPreset
                icone={<Pause className="h-5 w-5 text-warning" />}
                titulo="Pausar Campanha"
                descricao="A campanha fica parada e pode ser retomada do ponto em que estava."
                rotuloConfirmar="Pausar"
                tom="warning"
              />
              <ModalPreset
                icone={<Send className="h-5 w-5 text-primary" />}
                titulo="Disparar Campanha"
                descricao="Confira o público e o ritmo antes de iniciar o envio."
                rotuloConfirmar="Disparar agora"
              />
              <ModalPreset
                icone={<Filter className="h-5 w-5 text-muted-foreground" />}
                titulo="Descartar Rascunho"
                descricao="O rascunho é apagado e não aparece mais na listagem de campanhas."
                rotuloConfirmar="Descartar"
                tom="danger"
              />
            </div>
          </section>

          <section className="space-y-3">
            <TituloSecao titulo="Barra de filtros" subtitulo="TalkXFilterBar — busca, filtros, período e atualizar" />
            <div data-testid="talkx-kit-filtros" className="rounded-2xl border border-border/70 bg-card p-3">
              <TalkXFilterBar
                placeholder="Buscar campanhas…"
                filters={[
                  {
                    key: 'status',
                    label: 'Status',
                    allLabel: 'Todos os status',
                    icon: Gauge,
                    options: Object.entries(CAMPAIGN_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
                  },
                  {
                    key: 'segment',
                    label: 'Segmentação',
                    allLabel: 'Todas as segmentações',
                    icon: SlidersHorizontal,
                    options: [{ value: 'vip', label: 'Clientes VIP' }],
                  },
                ]}
                values={{ status: '', segment: '' }}
              />
            </div>
          </section>

          <section className="space-y-3">
            <TituloSecao titulo="KPI e tabela" subtitulo="KpiCard com comparativo e TalkXTable com ordenação" />
            <div data-testid="talkx-kit-kpi" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard icon={Rocket} color="blue" label="Campanhas ativas" value={3} visual="bars" bars={[1, 2, 1, 3, 2]} />
              <KpiCard icon={CheckCircle2} color="green" label="Entregues" value={1920} comparison={{ previous: 1840, kind: 'relative' }} />
              <KpiCard icon={Database} color="violet" label="Base elegível" value={8450} visual="ring" />
            </div>
            <div data-testid="talkx-kit-tabela" className="rounded-2xl border border-border/70 bg-card p-2">
              <TalkXTable
                columns={COLUNAS_DEMO}
                rows={LINHAS_DEMO}
                getId={(r) => r.id}
                emptyState={<TalkXEmptyState preset="emptyCampaigns" />}
              />
            </div>
          </section>
        </div>
      </div>

      <footer className="space-y-0.5 border-t border-border/70 pt-4">
        <p className="text-xs text-foreground-secondary">
          Estes estados e modais seguem o padrão visual do ZAPP e servem como referência para implementação e QA.
        </p>
        <p className="text-2xs text-muted-foreground">ZAPP Talk X • Campanhas • Estados do Sistema e Modais</p>
        <p data-testid="talkx-kit-versao" className="text-2xs text-muted-foreground">v{APP_VERSION}</p>
      </footer>

      <p data-testid="talkx-kit-estados-disponiveis" className="sr-only">
        {TALKX_FORCED_STATES.join(', ')}
      </p>
    </div>
  );
}

export default TalkXKit;
