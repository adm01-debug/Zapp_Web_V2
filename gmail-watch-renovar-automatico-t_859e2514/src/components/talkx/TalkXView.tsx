import { toast } from 'sonner';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import {
  goTab,
  parseTalkXRoute,
  pushTalkXWizardRoute,
  replaceTalkXTabRoute,
  replaceTalkXWizardRoute,
  parseTalkXScreenRoute,
  screenForStatus,
  replaceTalkXRoute,
  type TalkXScreen,
  type TalkXTab,
  type TalkXWizardRoute,
} from './talkxRoute';
import type { WizardStep } from './useCampaignEditor';

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
  // TL-152: a mesma precedência do syncFromBrowserHistory (?campaign= com
  // screen explícito vence o wizard) — load e popstate abrem a mesma tela
  // para o mesmo endereço.
  const [topView, setTopView] = useState<TalkXTopView>(() => {
    const screenRoute = parseTalkXScreenRoute(window.location.search).route;
    if (screenRoute?.screen) return screenRoute.screen;
    const wizard = parseTalkXRoute(window.location.search).wizard.route;
    if (wizard) return 'wizard';
    return 'tabs';
  });
  const [activeTab, setActiveTab] = useState<TalkXTab>(() => parseTalkXRoute(window.location.search).tab);
  const [activeSub, setActiveSub] = useState<string | undefined>(() => parseTalkXRoute(window.location.search).sub);
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [scheduledCampaignId, setScheduledCampaignId] = useState<string | null>(null);
  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);
  const [wizardInitial, setWizardInitial] = useState<{ segmentIds?: string[]; templateId?: string } | undefined>();
  const [wizardRoute, setWizardRoute] = useState<TalkXWizardRoute | null>(() => parseTalkXRoute(window.location.search).wizard.route);
  // TL-152: a rota de tela resolve os ids quando as campanhas chegam
  // (primeira pintura); uma vez só, para não puxar a View de volta a
  // cada recarregamento das campanhas.
  const didInitialScreenSync = useRef(false);
  // X189: a Ajuda deixou de ser modal e virou tela com endereço próprio
  // (?screen=help&topic=&article=); o "?" do cabeçalho abre esta rota.
  const [helpRoute, setHelpRoute] = useState<TalkXHelpRoute | null>(() => parseTalkXHelpRoute(window.location.search).route);
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
    const parsedScreen = parseTalkXScreenRoute(window.location.search);

    if (parsedWizard.needsNormalization) replaceTalkXWizardRoute(parsedWizard.route);
    // TL-152: ?screen= inválido (ex.: report, que não tem tela) é normalizado
    // aqui também — o parâmetro é removido sem abrir outra tela no lugar.
    if (parsedScreen.needsNormalization) replaceTalkXRoute(null);

    // The browser history event, rather than a render effect, is the source of
    // truth for back/forward. Resetting here also guarantees a draft from the
    // previous route cannot survive navigation to another campaign.
    setLocalDraftRouteId(null);
    setWizardRoute(parsedWizard.route);
    setWizardInitial(undefined);

    // TL-152: screen routing takes priority over wizard routing when
    // ?campaign= is present in the URL. Sem screen, a situação decide
    // (screenForStatus); campanha inexistente cai na lista, como hoje.
    if (parsedScreen.route) {
      const campaignId = parsedScreen.route.campaignId;
      const campaign = campaigns.find((candidate) => candidate.id === campaignId) ?? null;
      const screen = parsedScreen.route.screen ?? (campaign ? screenForStatus(campaign.status) : undefined);
      if (screen === 'wizard') {
        setEditingCampaign(campaign && (campaign.status === 'draft' || campaign.status === 'scheduled') ? campaign : null);
        setTopView('wizard');
        return;
      }
      if (screen) {
        setEditingCampaign(null);
        setMonitorId(null);
        setScheduledCampaignId(null);
        setRunningCampaignId(null);
        switch (screen) {
          case 'scheduled': setScheduledCampaignId(campaignId); break;
          case 'running': setRunningCampaignId(campaignId); break;
          default: setMonitorId(campaignId); break;
        }
        setTopView(screen === 'scheduled' || screen === 'running' ? screen : 'monitor');
        return;
      }
    }

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
    // TL-152: normaliza ?screen= desconhecido (remove o parâmetro sem
    // entrar no histórico, para não criar entradas inúteis).
    const initialScreen = parseTalkXScreenRoute(window.location.search);
    if (initialScreen.needsNormalization) replaceTalkXRoute(null);
    // TL-152: o init só define o topView — os ids da tela roteada resolvem
    // aqui, quando as campanhas chegam (primeira pintura, uma vez só).
    if (!didInitialScreenSync.current && !isLoading) {
      didInitialScreenSync.current = true;
      syncFromBrowserHistory();
    }
    window.addEventListener('popstate', syncFromBrowserHistory);
    return () => window.removeEventListener('popstate', syncFromBrowserHistory);
  }, [isLoading, syncFromBrowserHistory]);

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

  const openNew = useCallback((initial?: { segmentIds?: string[]; templateId?: string }) => {
    setLocalDraftRouteId(null);
    setEditingCampaign(null); setWizardInitial(initial); setTopView('wizard');
    writeWizardRoute({ campaignId: 'new', step: 1 });
    replaceTalkXRoute(null);
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
    replaceTalkXRoute(null);
  }, [writeWizardRoute]);
  // TL-152: cada tela de acompanhamento tem endereço próprio (?campaign= e
  // ?screen=). Abrir a tela grava a rota (push: voltar retorna à lista) e
  // limpa a rota do wizard — um endereço nunca aponta para duas telas.
  // Transições reativas (mudança de status, pós-lançamento) usam replace.
  const writeScreenRoute = useCallback((campaignId: string, screen: TalkXScreen, replace = false) => {
    const url = new URL(window.location.href);
    url.searchParams.set('campaign', campaignId);
    url.searchParams.set('screen', screen);
    url.searchParams.delete('wizard');
    url.searchParams.delete('step');
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
    setWizardRoute(null);
  }, []);

  const openMonitor = useCallback((c: TalkXCampaign) => { setMonitorId(c.id); setTopView('monitor'); writeScreenRoute(c.id, 'monitor'); }, [writeScreenRoute]);
  const openScheduled = useCallback((c: TalkXCampaign) => { setScheduledCampaignId(c.id); setTopView('scheduled'); writeScreenRoute(c.id, 'scheduled'); }, [writeScreenRoute]);
  const openRunning = useCallback((c: TalkXCampaign) => { setRunningCampaignId(c.id); setTopView('running'); writeScreenRoute(c.id, 'running'); }, [writeScreenRoute]);
  const backToList = useCallback(() => {
    setLocalDraftRouteId(null);
    setTopView('tabs'); setEditingCampaign(null); setMonitorId(null); setScheduledCampaignId(null); setRunningCampaignId(null); setWizardInitial(undefined);
    writeWizardRoute(null, true);
    replaceTalkXRoute(null);
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
      replaceTalkXRoute(null);
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
      <TalkXCampaignScheduled
        campaignId={scheduledCampaignId!}
        onBack={backToList}
        onEdit={(c) => { setScheduledCampaignId(null); openEdit(c); }}
        onStatusChange={(campaign) => {
          setScheduledCampaignId(null);
          if (campaign.status === 'sending') {
            setMonitorId(campaign.id);
            setTopView('monitor');
            writeScreenRoute(campaign.id, 'monitor', true);
            return;
          }
          backToList();
        }}
      />
    );
  }


  if (topView === 'running') {
    return (
      <TalkXCampaignRunning
        initialCampaignId={runningCampaignId}
        onBack={backToList}
        onViewMonitor={(id) => { setRunningCampaignId(null); setMonitorId(id); setTopView('monitor'); writeScreenRoute(id, 'monitor', true); }}
      />
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
        <TalkXCampaignWizard
          key={`talkx-wizard:${wizardCampaign?.id || 'new'}`}
          campaign={wizardCampaign}
          onClose={backToList}
          onLaunched={(id, status) => {
            writeWizardRoute(null, true);
            if (status === 'scheduled') {
              setScheduledCampaignId(id);
              setTopView('scheduled');
              writeScreenRoute(id, 'scheduled', true);
              return;
            }
            setMonitorId(id);
            setTopView('monitor');
            writeScreenRoute(id, 'monitor', true);
          }}
          initial={{ ...wizardInitial, step: wizardRoute?.step }}
          routeStep={wizardRoute?.step}
          onRouteStepChange={onWizardStepChange}
          onDraftIdentity={onDraftIdentity}
        />
      </div>
    );
  }

  if (topView === 'monitor' && monitorId) {
    return (
      <div className="min-h-full w-full min-w-0 bg-background">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={backToList} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50">
            <ArrowLeft className="w-4 h-4" />Voltar à campanhas
          </button>
        </div>
        <SectionErrorBoundary sectionName="Monitor ao vivo">
          <TalkXLiveMonitor campaignId={monitorId} onBack={backToList} />
        </SectionErrorBoundary>
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
              type="button" onClick={() => changeHelpRoute({})}
              className="talkx-glow-ring inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 bg-input/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-xs font-medium"
            >
              <HelpCircle className="w-4 h-4" />Ajuda
            </button>
            <PrimaryButton icon={Plus} onClick={() => openNew()} className="shadow-[var(--shadow-glow-primary)]">Nova campanha</PrimaryButton>
          </div>
        }
      />
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
          <TalkXSegments onUseCampaign={(segmentIds) => openNew({ segmentIds })} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TalkXTemplates
            onUseTemplate={(templateId) => openNew({ templateId })}
            startNew={templateStartNew}
            onStartNewHandled={() => setTemplateStartNew(false)}
            onOpenMonitor={(id) => { const c = campaigns.find((x) => x.id === id); if (c) openMonitor(c); }}
          />
        </TabsContent>
        <TabsContent value="suppression" className="mt-4">
          <TalkXSuppression />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          {activeSub === 'configuracoes'
            ? <TalkXSettings />
            : (
              <SectionErrorBoundary sectionName="Analytics de campanhas">
                <TalkXAnalytics campaigns={campaigns} isLoading={isLoading} isError={isError} />
              </SectionErrorBoundary>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
