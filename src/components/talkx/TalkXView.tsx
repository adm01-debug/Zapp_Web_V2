import { toast } from 'sonner';
import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import {
  Zap, Plus, FileText, ShieldBan, BarChart3, ArrowLeft,
  LayoutDashboard, HelpCircle,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTalkX, TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { useTalkXSegments } from '@/hooks/integrations/useTalkXSegments';
import { useTalkXTemplates } from '@/hooks/integrations/useTalkXTemplates';
import { useTalkXServiceStatus } from '@/hooks/integrations/useTalkXServiceStatus';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { ModuleHeader, IconTile, TalkXSkeletonRows, TalkXWhatsAppDisconnectedState } from './talkxShared';
import { PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { TalkXHelpCenter } from './help/TalkXHelpCenter';
import { parseTalkXHelpRoute, pushTalkXHelpRoute, type TalkXHelpRoute } from './help/talkxHelpRoute';
import { TalkXOverview } from './TalkXOverview';
import { TalkXCampaignWizard } from './TalkXCampaignWizard';
import { TalkXLiveMonitor } from './TalkXLiveMonitor';
import { TalkXSegments } from './TalkXSegments';
import { TalkXTemplates } from './TalkXTemplates';
import { TalkXSuppression } from './TalkXSuppression';
import { TalkXAnalytics } from './TalkXAnalytics';
import { TalkXSettings } from './TalkXSettings';
import { TalkXCampaignScheduled } from './TalkXCampaignScheduled';
import { TalkXCampaignRunning } from './TalkXCampaignRunning';
import {
  goTab,
  parseTalkXRoute,
  pushTalkXWizardRoute,
  replaceTalkXTabRoute,
  replaceTalkXWizardRoute,
  type TalkXTab,
  type TalkXWizardRoute,
} from './talkxRoute';
import type { WizardStep } from './useCampaignEditor';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// X194 — carregamento sob demanda: cada tela do módulo vira um chunk próprio e só é
// buscada quando a aba/visão que a usa abre. Antes, TalkXView importava as onze telas
// de uma vez, então a biblioteca de gráficos (recharts, usada por Analytics, Monitor
// ao vivo e Campanha em andamento) entrava no carregamento inicial do módulo.
// lazyWithRetry é o mesmo carregador da entrada do módulo (src/pages/lazyViews.ts):
// repete a busca do chunk 3x com espera antes de desistir.
const TalkXHelp = lazyWithRetry(() => import('./TalkXHelp').then((m) => ({ default: m.TalkXHelp })));
const TalkXCampaignWizard = lazyWithRetry(() => import('./TalkXCampaignWizard').then((m) => ({ default: m.TalkXCampaignWizard })));
const TalkXLiveMonitor = lazyWithRetry(() => import('./TalkXLiveMonitor').then((m) => ({ default: m.TalkXLiveMonitor })));
const TalkXSegments = lazyWithRetry(() => import('./TalkXSegments').then((m) => ({ default: m.TalkXSegments })));
const TalkXTemplates = lazyWithRetry(() => import('./TalkXTemplates').then((m) => ({ default: m.TalkXTemplates })));
const TalkXSuppression = lazyWithRetry(() => import('./TalkXSuppression').then((m) => ({ default: m.TalkXSuppression })));
const TalkXAnalytics = lazyWithRetry(() => import('./TalkXAnalytics').then((m) => ({ default: m.TalkXAnalytics })));
const TalkXSettings = lazyWithRetry(() => import('./TalkXSettings').then((m) => ({ default: m.TalkXSettings })));
const TalkXCampaignScheduled = lazyWithRetry(() => import('./TalkXCampaignScheduled').then((m) => ({ default: m.TalkXCampaignScheduled })));
const TalkXCampaignRunning = lazyWithRetry(() => import('./TalkXCampaignRunning').then((m) => ({ default: m.TalkXCampaignRunning })));

/** X194 — enquanto o chunk da tela chega, o módulo mostra a estrutura (esqueleto). */
function TalkXScreenFallback() {
  return (
    <div className="p-4" role="status" aria-live="polite" aria-busy="true">
      <TalkXSkeletonRows rows={4} />
    </div>
  );
}

export type TalkXTopView = 'tabs' | 'wizard' | 'monitor' | 'scheduled' | 'running';

export default function TalkXView() {
  const { campaigns, isLoading, isError, error: campaignsError, isLive, startCampaign, pauseCampaign, cancelCampaign, deleteCampaign, duplicateCampaign: duplicateCampaignMutation, refetchCampaigns } = useTalkX();
  const { data: teamProfiles = [] } = useTeamProfiles();
  const { segments } = useTalkXSegments();
  const { templates } = useTalkXTemplates();
  // X048 — a Visão geral aplica o estado "Conexão WhatsApp desconectada" acima
  // da tabela quando NÃO existe conexão ativa (o botão leva para a tela que
  // resolve). `null` = ainda checando/consulta falhou: sem resposta confiável o
  // estado não aparece (nunca um falso "desconectado" na tela).
  const { whatsapp: whatsappService } = useTalkXServiceStatus();
  const whatsappDisconnected = whatsappService.connected === false;
  const [topView, setTopView] = useState<TalkXTopView>(() => parseTalkXRoute(window.location.search).wizard.route ? 'wizard' : 'tabs');
  const [activeTab, setActiveTab] = useState<TalkXTab>(() => parseTalkXRoute(window.location.search).tab);
  const [activeSub, setActiveSub] = useState<string | undefined>(() => parseTalkXRoute(window.location.search).sub);
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [scheduledCampaignId, setScheduledCampaignId] = useState<string | null>(null);
  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);
  const [wizardInitial, setWizardInitial] = useState<{ segmentId?: string; templateId?: string } | undefined>();
  const [wizardRoute, setWizardRoute] = useState<TalkXWizardRoute | null>(() => parseTalkXRoute(window.location.search).wizard.route);
  // X189: a Ajuda deixou de ser modal e virou tela com endereço próprio
  // (?screen=help&topic=&article=); o "?" do cabeçalho abre esta rota.
  const [helpRoute, setHelpRoute] = useState<TalkXHelpRoute | null>(() => parseTalkXHelpRoute(window.location.search).route);
  // X194 — o painel de ajuda é carregado sob demanda (lazy) e só aparece quando o usuário clica.
  const [helpOpen, setHelpOpen] = useState(false);
  // R2-MOD-039: o item "Novo template" do menu Templates navega para a aba de templates
  // pedindo o editor VAZIO (antes chamava openNew, que é o wizard de campanha). O pedido
  // é limpo quando a aba o atende, para não reabrir o editor sozinho depois.
  const [templateStartNew, setTemplateStartNew] = useState(false);
  // A campaign just created locally may not have reached the campaigns query
  // yet. It is safe to keep the current editor alive, but a reload must still
  // resolve the ID from the canonical query before opening it.
  const [localDraftRouteId, setLocalDraftRouteId] = useState<string | null>(null);

  const writeWizardRoute = useCallback((route: TalkXWizardRoute | null, replace = false) => {
    if (replace) replaceTalkXWizardRoute(route);
    else pushTalkXWizardRoute(route);
    setWizardRoute(route);
  }, []);

  const syncFromBrowserHistory = useCallback(() => {
    const parsedWizard = parseTalkXRoute(window.location.search).wizard;
    if (parsedWizard.needsNormalization) replaceTalkXWizardRoute(parsedWizard.route);

    // The browser history event, rather than a render effect, is the source of
    // truth for back/forward. Resetting here also guarantees a draft from the
    // previous route cannot survive navigation to another campaign.
    setLocalDraftRouteId(null);
    setWizardRoute(parsedWizard.route);
    setWizardInitial(undefined);

    if (!parsedWizard.route) {
      setEditingCampaign(null);
      setTopView('tabs');
      return;
    }
    if (parsedWizard.route.campaignId === 'new') {
      setEditingCampaign(null);
      setTopView('wizard');
      return;
    }

    const campaign = campaigns.find((candidate) => candidate.id === parsedWizard.route?.campaignId);
    setEditingCampaign(campaign && (campaign.status === 'draft' || campaign.status === 'scheduled') ? campaign : null);
    setTopView('wizard');
  }, [campaigns]);

  useEffect(() => {
    const initialWizard = parseTalkXRoute(window.location.search).wizard;
    if (initialWizard.needsNormalization) replaceTalkXWizardRoute(initialWizard.route);
    // X052: o mesmo rigor vale para o endereço já aberto — aba duplicada ou
    // desconhecida cai na Visão geral e o endereço é reescrito (replace, sem
    // entrada nova no histórico) em vez de mostrar área vazia.
    const initialTab = parseTalkXRoute(window.location.search);
    if (initialTab.needsNormalization) replaceTalkXTabRoute({ tab: initialTab.tab, sub: initialTab.sub });
    window.addEventListener('popstate', syncFromBrowserHistory);
    return () => window.removeEventListener('popstate', syncFromBrowserHistory);
  }, [syncFromBrowserHistory]);

  // Aba ativa vem da URL; popstate (inclusive o disparado por goTab) restaura tab/sub.
  useEffect(() => {
    const syncTab = () => {
      const parsed = parseTalkXRoute(window.location.search);
      if (parsed.needsNormalization) replaceTalkXTabRoute({ tab: parsed.tab, sub: parsed.sub });
      setActiveTab(parsed.tab);
      setActiveSub(parsed.sub);
      setHelpRoute(parseTalkXHelpRoute(window.location.search).route);
      // R2-MOD-039: o pedido de "novo template" não sobrevive à saída da aba de templates;
      // voltar pela Biblioteca mostra a lista, não o editor que ficou aberto.
      if (parsed.tab !== 'templates') setTemplateStartNew(false);
    };
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);

  const routedCampaign = wizardRoute?.campaignId && wizardRoute.campaignId !== 'new'
    ? campaigns.find((candidate) => candidate.id === wizardRoute.campaignId) ?? null
    : null;
  const routedCampaignIsEditable = routedCampaign?.status === 'draft' || routedCampaign?.status === 'scheduled';
  const wizardCampaign = editingCampaign?.id ? editingCampaign : routedCampaignIsEditable ? routedCampaign : editingCampaign;

  useEffect(() => {
    if (!wizardRoute || wizardRoute.campaignId === 'new' || isLoading) return;
    if (localDraftRouteId === wizardRoute.campaignId && topView === 'wizard') return;
    if (routedCampaignIsEditable) return;

    toast.error(routedCampaign ? 'Somente rascunhos ou campanhas agendadas podem ser editados.' : 'Campanha não encontrada ou sem acesso.');
    replaceTalkXWizardRoute(null);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [isLoading, localDraftRouteId, routedCampaign, routedCampaignIsEditable, topView, wizardRoute]);

  const openNew = useCallback((initial?: { segmentId?: string; templateId?: string }) => {
    setLocalDraftRouteId(null);
    setEditingCampaign(null); setWizardInitial(initial); setTopView('wizard');
    writeWizardRoute({ campaignId: 'new', step: 1 });
  }, [writeWizardRoute]);
  const openEdit = useCallback((c: TalkXCampaign) => {
    setLocalDraftRouteId(null);
    setEditingCampaign(c); setWizardInitial(undefined); setTopView('wizard');
    // V23: reabre no passo em que o rascunho foi deixado (antes sempre voltava ao 1).
    const savedStep = Number(c.draft_step);
    const step: WizardStep = savedStep >= 1 && savedStep <= 4 && Number.isInteger(savedStep)
      ? (savedStep as WizardStep)
      : 1;
    writeWizardRoute({ campaignId: c.id, step });
  }, [writeWizardRoute]);
  const openMonitor = useCallback((c: TalkXCampaign) => { setMonitorId(c.id); setTopView('monitor'); }, []);
  const openScheduled = useCallback((c: TalkXCampaign) => { setScheduledCampaignId(c.id); setTopView('scheduled'); }, []);
  const openRunning = useCallback((c: TalkXCampaign) => { setRunningCampaignId(c.id); setTopView('running'); }, []);
  const backToList = useCallback(() => {
    setLocalDraftRouteId(null);
    setTopView('tabs'); setEditingCampaign(null); setMonitorId(null); setScheduledCampaignId(null); setRunningCampaignId(null); setWizardInitial(undefined);
    writeWizardRoute(null, true);
  }, [writeWizardRoute]);

  // X189: a Ajuda é uma tela do módulo com rota própria; o endereço vive na URL
  // para o botão voltar do navegador andar um passo por vez (lista → artigo).
  const changeHelpRoute = useCallback((next: TalkXHelpRoute) => {
    pushTalkXHelpRoute(next);
    setHelpRoute(next);
  }, []);
  const closeHelp = useCallback(() => {
    pushTalkXHelpRoute(null);
    setHelpRoute(null);
  }, []);

  const creators = useMemo(() => {
    const m: Record<string, string> = {};
    for (const rawProfile of teamProfiles) {
      const profile = rawProfile as { id?: unknown; name?: unknown };
      if (typeof profile.id === 'string' && typeof profile.name === 'string' && profile.name.trim()) {
        m[profile.id] = profile.name.trim();
      }
    }
    return m;
  }, [teamProfiles]);

  // X026: duplicar agora cria o rascunho no banco (RPC duplicate_talkx_campaign) e
  // abre o editor sobre a linha devolvida — não é mais um objeto só de cliente.
  const duplicateCampaign = useCallback(async (c: TalkXCampaign) => {
    setLocalDraftRouteId(null);
    setWizardInitial(undefined);
    try {
      const created = await duplicateCampaignMutation.mutateAsync(c.id);
      setEditingCampaign(created);
      setLocalDraftRouteId(created.id);
      setTopView('wizard');
      writeWizardRoute({ campaignId: created.id, step: 1 });
    } catch {
      // A mutation já mostra o toast de erro.
    }
  }, [duplicateCampaignMutation, writeWizardRoute]);

  const onWizardStepChange = useCallback((step: WizardStep, replace = false) => {
    if (!wizardRoute) return;
    writeWizardRoute({ ...wizardRoute, step }, replace);
  }, [wizardRoute, writeWizardRoute]);

  const onDraftIdentity = useCallback((campaignId: string) => {
    setLocalDraftRouteId(campaignId);
    if (wizardRoute?.campaignId === 'new') {
      writeWizardRoute({ campaignId, step: wizardRoute.step }, true);
    }
  }, [wizardRoute, writeWizardRoute]);

  // E72: routing por status
  const onView = useCallback((c: TalkXCampaign) => {
    if (c.status === 'scheduled') { openScheduled(c); return; }
    if (c.status === 'sending' || c.status === 'paused') { openRunning(c); return; }
    openMonitor(c);
  }, [openMonitor, openScheduled, openRunning]);

  if (topView === 'scheduled' && scheduledCampaignId) {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXCampaignScheduled
          campaignId={scheduledCampaignId!}
          onBack={backToList}
          onEdit={(c) => { setScheduledCampaignId(null); openEdit(c); }}
          onStatusChange={(campaign) => {
            setScheduledCampaignId(null);
            if (campaign.status === 'sending') {
              setMonitorId(campaign.id);
              setTopView('monitor');
              return;
            }
            backToList();
          }}
        />
      </Suspense>
    );
  }


  if (topView === 'running') {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXCampaignRunning
          initialCampaignId={runningCampaignId}
          onBack={backToList}
          onViewMonitor={(id) => { setRunningCampaignId(null); setMonitorId(id); setTopView('monitor'); }}
        />
      </Suspense>
    );
  }

  if (topView === 'wizard') {
    const awaitingRoutedCampaign = wizardRoute?.campaignId && wizardRoute.campaignId !== 'new'
      && localDraftRouteId !== wizardRoute.campaignId
      && isLoading;
    if (awaitingRoutedCampaign) {
      // X047 — enquanto a campanha roteada resolve, esqueleto com aria-busy
      // (antes: um texto solto, que parecia carga infinita ou tela vazia).
      return (
        <div
          className="min-h-full w-full min-w-0 bg-background p-6"
          role="status" aria-live="polite" aria-busy="true" data-talkx-query="loading"
        >
          <span className="sr-only">Carregando conteúdo…</span>
          <TalkXSkeletonRows rows={4} />
        </div>
      );
    }
    return (
      <div className="min-h-full w-full min-w-0 bg-background">
        <Suspense fallback={<TalkXScreenFallback />}>
          <TalkXCampaignWizard
            key={`talkx-wizard:${wizardCampaign?.id || 'new'}`}
            campaign={wizardCampaign}
            onClose={backToList}
            onLaunched={(id, status) => {
              writeWizardRoute(null, true);
              if (status === 'scheduled') {
                setScheduledCampaignId(id);
                setTopView('scheduled');
                return;
              }
              setMonitorId(id);
              setTopView('monitor');
            }}
            initial={{ ...wizardInitial, step: wizardRoute?.step }}
            routeStep={wizardRoute?.step}
            onRouteStepChange={onWizardStepChange}
            onDraftIdentity={onDraftIdentity}
          />
        </Suspense>
      </div>
    );
  }

  if (topView === 'monitor' && monitorId) {
    return (
      <div className="min-h-full w-full min-w-0 bg-background">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={backToList} className="h9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bv-muted/50">
            <ArrowLeft className="w-4 h-4" />Voltar à campanhas
          </button>
        </div>
        <Suspense fallback={<TalkXScreenFallback />}>
          <TalkXLiveMonitor campaignId={monitorId} onBack={backToList} />
        </Suspense>
      </div>
    );
  }

  if (helpRoute) {
    return (
      <div className="min-h-full w-full min-w-0 bg-background">
        <TalkXHelpCenter route={helpRoute} onRouteChange={changeHelpRoute} onClose={closeHelp} />
      </div>
    );
  }

  return (
    <div className="min-h-full w-full min-w-0 bg-background space-y-5">
      <ModuleHeader
        icon={Zap}
        title="Campanhas"
        subtitle="Conecte. Engaje. Converta. Comunicação em escala, com resultado real."
        right={
          <div className="flex items-center gap-3">
            {isLive && (
              <span className="flex items-center gap-1.5 text-2xs text-success font-medium">
                <span className="w-2 h-2 rounded-full bg-success talkx-live-dot" />
                Ao vivo
              </span>
            )}
            <button
              type="button" onClick={() => setHelpOpen(true)}
              className="talkx-glow-ring inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 bg-input/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-xs font-medium"
            >
              <HelpCircle className="w-4 h-4" />Ajuda
            </button>
            <PrimaryButton icon={Plus} onClick={() => openNew()} className="shadow-[var(--shadow-glow-primary)]">Nova campanha</PrimaryButton>
          </div>
        }
      />
      {/* X194 — a ajuda (com a sua explicação longa) só é buscada quando é solicitada. */}
      {helpOpen && (
        <Suspense fallback={null}>
          <TalkXHelp open={helpOpen} onOpenChange={setHelpOpen} />
        </Suspense>
      )}

      <Tabs value={activeTab} onValueChange={(tab) => goTab(tab)} className="min-w-0">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex gap-1.5 h-auto bg-transparent pb-0 px-0 w-full justify-start flex-wrap">
            <TabsTrigger value="overview"
              className="talkx-glow-ring h-10 px-4 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5
                data-[state=active]:bg-primary/12 data-[state=active]:border-primary/40 data-[state=active]:text-foreground
                data-[state=inactive]:bg-input/40 data-[state=inactive]:border-border/60 data-[state=inactive]:text-muted-foreground
                hover:data-[state=inactive]:text-foreground hover:data-[state=inactive]:border-border"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />Visão geral
            </TabsTrigger>
            <TabsTrigger value="suppression"
              className="talkx-glow-ring h-10 px-4 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5
                data-[state=active]:bg-primary/12 data-[state=active]:border-primary/40 data-[state=active]:text-foreground
                data-[state=inactive]:bg-input/40 data-[state=inactive]:border-border/60 data-[state=inactive]:text-muted-foreground
                hover:data-[state=inactive]:text-foreground hover:data-[state=inactive]:border-border"
            >
              <ShieldBan className="w-4 h-4 shrink-0" />Lista de supressão
            </TabsTrigger>
          </TabsList>
            <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="talkx-glow-ring h-10 px-4 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 bg-input/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border">
                              <BarChart3 className="w-4 h-4 shrink-0" />Analytics <span className="text-2xs text-muted-foreground">▾</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => goTab('overview')}>Campanhas</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => goTab('segments')}>Segmentos</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => goTab('analytics')}>Comparativo</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => goTab('analytics', 'configuracoes')}>Configurações</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
            <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="talkx-glow-ring h-10 px-4 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 bg-input/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border">
                              <FileText className="w-4 h-4 shrink-0" />Templates <span className="text-2xs text-muted-foreground">▾</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => goTab('templates')}>Biblioteca</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { setTemplateStartNew(true); goTab('templates'); }}>Novo template</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
        </div>

        <TabsContent value="overview" className="mt-4">
          {whatsappDisconnected && (
            <div className="mb-4" data-talkx-whatsapp-state="disconnected">
              <TalkXWhatsAppDisconnectedState onConnect={() => navigateToView('connections')} />
            </div>
          )}
          <TalkXOverview
            campaigns={campaigns} segments={segments} creators={creators} isLoading={isLoading}
            isError={isError} error={campaignsError} onRetry={() => refetchCampaigns()}
            onNew={() => openNew()} onEdit={openEdit} onView={onView} onViewScheduled={openScheduled} onViewRunning={openRunning} onDuplicate={duplicateCampaign}
            onStart={(id) => { void startCampaign(id); }}
            onPause={async (id) => { try { await pauseCampaign(id); toast.info('Campanha pausada'); } catch { toast.error('Erro ao pausar'); } }}
            onCancel={async (id) => { try { await cancelCampaign(id); toast.info('Campanha cancelada'); } catch { toast.error('Erro ao cancelar'); } }}
            onDelete={(id) => deleteCampaign.mutate(id)}
            onGoTab={(tab) => { if (tab === 'templates') goTab('templates'); else if (tab === 'segments') goTab('segments'); }}
          />
        </TabsContent>
        <TabsContent value="segments" className="mt-4">
          <Suspense fallback={<TalkXScreenFallback />}>
            <TalkXSegments onUseCampaign={(segmentId) => openNew({ segmentId })} />
          </Suspense>
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <Suspense fallback={<TalkXScreenFallback />}>
            <TalkXTemplates
              onUseTemplate={(templateId) => openNew({ templateId })}
              startNew={templateStartNew}
              onStartNewHandled={() => setTemplateStartNew(false)}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="suppression" className="mt-4">
          <Suspense fallback={<TalkXScreenFallback />}>
            <TalkXSuppression />
          </Suspense>
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <Suspense fallback={<TalkXScreenFallback />}>
            {activeSub === 'configuracoes'
              ? <TalkXSettings />
              : <TalkXAnalytics campaigns={campaigns} isLoading={isLoading} isError={isError} />}
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
