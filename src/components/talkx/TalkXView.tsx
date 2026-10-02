import { toast } from 'sonner';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { ModuleHeader, IconTile } from './talkxShared';
import { PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { TalkXHelp } from './TalkXHelp';
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
import { duplicateTalkXCampaignDraft } from './talkxCampaignDraft';
import { parseTalkXWizardRoute, pushTalkXWizardRoute, replaceTalkXWizardRoute, type TalkXWizardRoute } from './talkxWizardRoute';
import { goTab, readTab, readSub } from './talkxTabRoute';
import type { WizardStep } from './useCampaignEditor';

export type TalkXTopView = 'tabs' | 'wizard' | 'monitor' | 'scheduled' | 'running';

export default function TalkXView() {
  const { campaigns, isLoading, isError, isLive, startCampaign, pauseCampaign, cancelCampaign, deleteCampaign } = useTalkX();
  const { data: teamProfiles = [] } = useTeamProfiles();
  const { segments } = useTalkXSegments();
  const { templates } = useTalkXTemplates();
  const [topView, setTopView] = useState<TalkXTopView>(() => parseTalkXWizardRoute(window.location.search).route ? 'wizard' : 'tabs');
  const [activeTab, setActiveTab] = useState<string>(() => readTab(window.location.search));
  const [activeSub, setActiveSub] = useState<string | undefined>(() => readSub(window.location.search));
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [scheduledCampaignId, setScheduledCampaignId] = useState<string | null>(null);
  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);
  const [wizardInitial, setWizardInitial] = useState<{ segmentId?: string; templateId?: string } | undefined>();
  const [wizardRoute, setWizardRoute] = useState<TalkXWizardRoute | null>(() => parseTalkXWizardRoute(window.location.search).route);
  const [helpOpen, setHelpOpen] = useState(false);
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
    const parsed = parseTalkXWizardRoute(window.location.search);
    if (parsed.needsNormalization) replaceTalkXWizardRoute(parsed.route);

    // The browser history event, rather than a render effect, is the source of
    // truth for back/forward. Resetting here also guarantees a draft from the
    // previous route cannot survive navigation to another campaign.
    setLocalDraftRouteId(null);
    setWizardRoute(parsed.route);
    setWizardInitial(undefined);

    if (!parsed.route) {
      setEditingCampaign(null);
      setTopView('tabs');
      return;
    }
    if (parsed.route.campaignId === 'new') {
      setEditingCampaign(null);
      setTopView('wizard');
      return;
    }

    const campaign = campaigns.find((candidate) => candidate.id === parsed.route?.campaignId);
    setEditingCampaign(campaign && (campaign.status === 'draft' || campaign.status === 'scheduled') ? campaign : null);
    setTopView('wizard');
  }, [campaigns]);

  useEffect(() => {
    const initial = parseTalkXWizardRoute(window.location.search);
    if (initial.needsNormalization) replaceTalkXWizardRoute(initial.route);
    window.addEventListener('popstate', syncFromBrowserHistory);
    return () => window.removeEventListener('popstate', syncFromBrowserHistory);
  }, [syncFromBrowserHistory]);

  // Aba ativa vem da URL; popstate (inclusive o disparado por goTab) restaura tab/sub.
  useEffect(() => {
    const syncTab = () => {
      setActiveTab(readTab(window.location.search));
      setActiveSub(readSub(window.location.search));
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

  const duplicateCampaign = useCallback((c: TalkXCampaign) => {
    setLocalDraftRouteId(null);
    setEditingCampaign(duplicateTalkXCampaignDraft(c));
    setWizardInitial(undefined);
    setTopView('wizard');
    writeWizardRoute({ campaignId: 'new', step: 1 });
  }, [writeWizardRoute]);

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
        onViewMonitor={(id) => { setRunningCampaignId(null); setMonitorId(id); setTopView('monitor'); }}
      />
    );
  }

  if (topView === 'wizard') {
    const awaitingRoutedCampaign = wizardRoute?.campaignId && wizardRoute.campaignId !== 'new'
      && localDraftRouteId !== wizardRoute.campaignId
      && isLoading;
    if (awaitingRoutedCampaign) {
      return <div className="min-h-full bg-background p-6 text-sm text-muted-foreground" role="status">Carregando campanha…</div>;
    }
    return (
      <div className="min-h-full bg-background p-3 md:p-4 lg:p-6">
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
      </div>
    );
  }

  if (topView === 'monitor' && monitorId) {
    return (
      <div className="min-h-full bg-background p-3 md:p-4 lg:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={backToList} className="h9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bv-muted/50">
            <ArrowLeft className="w-4 h-4" />Voltar à campanhas
          </button>
        </div>
        <TalkXLiveMonitor campaignId={monitorId} onBack={backToList} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-5">
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
      <TalkXHelp open={helpOpen} onOpenChange={setHelpOpen} />

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
                <DropdownMenuItem onSelect={() => openNew()}>Novo template</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TabsTrigger value="suppression"
              className="talkx-glow-ring h-10 px-4 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5
                data-[state=active]:bg-primary/12 data-[state=active]:border-primary/40 data-[state=active]:text-foreground
                data-[state=inactive]:bg-input/40 data-[state=inactive]:border-border/60 data-[state=inactive]:text-muted-foreground
                hover:data-[state=inactive]:text-foreground hover:data-[state=inactive]:border-border"
            >
              <ShieldBan className="w-4 h-4 shrink-0" />Lista de supressão
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <TalkXOverview
            campaigns={campaigns} segments={segments} creators={creators} isLoading={isLoading}
            onNew={() => openNew()} onEdit={openEdit} onView={onView} onViewScheduled={openScheduled} onViewRunning={openRunning} onDuplicate={duplicateCampaign}
            onStart={(id) => { void startCampaign(id); }}
            onPause={async (id) => { try { await pauseCampaign(id); toast.info('Campanha pausada'); } catch { toast.error('Erro ao pausar'); } }}
            onCancel={async (id) => { try { await cancelCampaign(id); toast.info('Campanha cancelada'); } catch { toast.error('Erro ao cancelar'); } }}
            onDelete={(id) => deleteCampaign.mutate(id)}
            onGoTab={(tab) => { if (tab === 'templates') goTab('templates'); else if (tab === 'segments') goTab('segments'); }}
          />
        </TabsContent>
        <TabsContent value="segments" className="mt-4">
          <TalkXSegments onUseCampaign={(segmentId) => openNew({ segmentId })} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TalkXTemplates onUseTemplate={(templateId) => openNew({ templateId })} />
        </TabsContent>
        <TabsContent value="suppression" className="mt-4">
          <TalkXSuppression />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          {activeSub === 'configuracoes'
            ? <TalkXSettings />
            : <TalkXAnalytics campaigns={campaigns} isLoading={isLoading} isError={isError} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
