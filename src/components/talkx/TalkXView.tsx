import { toast } from 'sonner';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Zap, Plus, FileText, ShieldBan, BarChart3, ArrowLeft,
  LayoutDashboard, HelpCircle, Inbox,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTalkX, TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { useTalkXSegments } from '@/hooks/integrations/useTalkXSegments';
import { useTalkXTemplates } from '@/hooks/integrations/useTalkXTemplates';
import { ModuleHeader, IconTile, TalkXSkeletonRows } from './talkxShared';
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
import { parseTalkXWizardRoute, formatTalkXWizardRoute, replaceTalkXWizardRoute, type TalkXWizardRoute } from './talkxWizardRoute';
import { goTab, readTab, readSub } from './talkxTabRoute';
import {
  parseTalkXRoute, formatTalkXRoute, replaceTalkXRoute, screenForStatus,
  type TalkXRoute, type TalkXScreen, type TalkXScreenTarget,
} from './talkxRoute';
import { TalkXEmptyState } from './kit/states';
import type { WizardStep } from './useCampaignEditor';

export type TalkXTopView = 'tabs' | 'wizard' | TalkXScreen;

export default function TalkXView() {
  const { campaigns, isLoading, isError, error: campaignsError, isLive, startCampaign, pauseCampaign, cancelCampaign, deleteCampaign, duplicateCampaign: duplicateCampaignMutation, refetchCampaigns } = useTalkX();
  const { data: teamProfiles = [] } = useTeamProfiles();
  const { segments } = useTalkXSegments();
  const { templates } = useTalkXTemplates();
  const [activeTab, setActiveTab] = useState<string>(() => readTab(window.location.search));
  const [activeSub, setActiveSub] = useState<string | undefined>(() => readSub(window.location.search));
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [wizardInitial, setWizardInitial] = useState<{ segmentId?: string; templateId?: string } | undefined>();
  const [wizardRoute, setWizardRoute] = useState<TalkXWizardRoute | null>(() => parseTalkXWizardRoute(window.location.search).route);
  // X143: a campanha aberta e a sua tela vivem na URL (?campaign=/?screen=), não em
  // useState por tela. Sem ?screen=, a situação da campanha decide (screenForStatus).
  const [screenRoute, setScreenRoute] = useState<TalkXRoute | null>(() => parseTalkXRoute(window.location.search).route);
  const [helpOpen, setHelpOpen] = useState(false);
  // R2-MOD-039: o item "Novo template" do menu Templates navega para a aba de templates
  // pedindo o editor VAZIO (antes chamava openNew, que é o wizard de campanha). O pedido
  // é limpo quando a aba o atende, para não reabrir o editor sozinho depois.
  const [templateStartNew, setTemplateStartNew] = useState(false);
  // A campaign just created locally may not have reached the campaigns query
  // yet. It is safe to keep the current editor alive, but a reload must still
  // resolve the ID from the canonical query before opening it.
  const [localDraftRouteId, setLocalDraftRouteId] = useState<string | null>(null);

  // Um endereço só para as duas rotas irmãs: escrever uma limpa a outra, para o
  // endereço do wizard (?wizard=/?step=) e o da campanha (?campaign=/?screen=) não
  // ficarem os dois no query string ao mesmo tempo.
  const writeRoutes = useCallback((next: { wizard: TalkXWizardRoute | null; screen: TalkXRoute | null }, replace = false) => {
    const current = new URL(window.location.href);
    const withWizard = formatTalkXWizardRoute(current, next.wizard);
    const path = formatTalkXRoute(new URL(withWizard, current.origin), next.screen);
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setWizardRoute(next.wizard);
    setScreenRoute(next.screen);
  }, []);

  const syncFromBrowserHistory = useCallback(() => {
    const parsed = parseTalkXWizardRoute(window.location.search);
    if (parsed.needsNormalization) replaceTalkXWizardRoute(parsed.route);
    const parsedScreen = parseTalkXRoute(window.location.search);
    if (parsedScreen.needsNormalization) replaceTalkXRoute(parsedScreen.route);

    // The browser history event, rather than a render effect, is the source of
    // truth for back/forward. Resetting here also guarantees a draft from the
    // previous route cannot survive navigation to another campaign.
    setLocalDraftRouteId(null);
    setWizardRoute(parsed.route);
    setScreenRoute(parsedScreen.route);
    setWizardInitial(undefined);

    if (!parsed.route || parsed.route.campaignId === 'new') {
      setEditingCampaign(null);
      return;
    }

    const campaign = campaigns.find((candidate) => candidate.id === parsed.route?.campaignId);
    setEditingCampaign(campaign && (campaign.status === 'draft' || campaign.status === 'scheduled') ? campaign : null);
  }, [campaigns]);

  useEffect(() => {
    const initial = parseTalkXWizardRoute(window.location.search);
    if (initial.needsNormalization) replaceTalkXWizardRoute(initial.route);
    const initialScreen = parseTalkXRoute(window.location.search);
    if (initialScreen.needsNormalization) replaceTalkXRoute(initialScreen.route);
    window.addEventListener('popstate', syncFromBrowserHistory);
    return () => window.removeEventListener('popstate', syncFromBrowserHistory);
  }, [syncFromBrowserHistory]);

  // Aba ativa vem da URL; popstate (inclusive o disparado por goTab) restaura tab/sub.
  useEffect(() => {
    const syncTab = () => {
      const tab = readTab(window.location.search);
      setActiveTab(tab);
      setActiveSub(readSub(window.location.search));
      // R2-MOD-039: o pedido de "novo template" não sobrevive à saída da aba de templates;
      // voltar pela Biblioteca mostra a lista, não o editor que ficou aberto.
      if (tab !== 'templates') setTemplateStartNew(false);
    };
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);

  const routedCampaign = wizardRoute?.campaignId && wizardRoute.campaignId !== 'new'
    ? campaigns.find((candidate) => candidate.id === wizardRoute.campaignId) ?? null
    : null;
  const routedCampaignIsEditable = routedCampaign?.status === 'draft' || routedCampaign?.status === 'scheduled';
  const wizardCampaign = editingCampaign?.id ? editingCampaign : routedCampaignIsEditable ? routedCampaign : editingCampaign;

  // X143: a tela da campanha aberta sai do endereço (?screen=) e, sem ele, da
  // situação da campanha (?campaign=). `statusScreen` é a tela que a situação pede
  // agora — é ela que faz o endereço acompanhar quando o status muda ao vivo.
  const screenCampaign = screenRoute
    ? campaigns.find((candidate) => candidate.id === screenRoute.campaignId) ?? null
    : null;
  const screenCampaignKnown = !!screenCampaign || (!!screenRoute && localDraftRouteId === screenRoute.campaignId);
  const statusScreen: TalkXScreenTarget | null = screenCampaign ? screenForStatus(screenCampaign.status) : null;
  const activeScreen: TalkXScreen | null = screenRoute
    ? (screenRoute.screen ?? (statusScreen === null || statusScreen === 'wizard' ? null : statusScreen))
    : null;
  const topView: TalkXTopView = wizardRoute || (screenRoute && statusScreen === 'wizard')
    ? 'wizard'
    : activeScreen ?? 'tabs';

  useEffect(() => {
    if (!wizardRoute || wizardRoute.campaignId === 'new' || isLoading) return;
    if (localDraftRouteId === wizardRoute.campaignId) return;
    if (routedCampaignIsEditable) return;

    toast.error(routedCampaign ? 'Somente rascunhos ou campanhas agendadas podem ser editados.' : 'Campanha não encontrada ou sem acesso.');
    replaceTalkXWizardRoute(null);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [isLoading, localDraftRouteId, routedCampaign, routedCampaignIsEditable, wizardRoute]);

  // Situação mudou com a tela aberta: o endereço passa a apontar a tela nova (X143).
  // O estado é re-sincronizado pelo próprio evento de histórico, como nas outras rotas.
  useEffect(() => {
    if (!screenRoute || !screenCampaign || statusScreen === null) return;
    if (statusScreen === 'wizard' || statusScreen === screenRoute.screen) return;
    replaceTalkXRoute({ campaignId: screenRoute.campaignId, screen: statusScreen });
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [screenCampaign, screenRoute, statusScreen]);

  // Rascunho com endereço de tela de acompanhamento: o wizard é o endereço certo.
  useEffect(() => {
    if (!screenRoute || !screenCampaign || statusScreen !== 'wizard') return;
    const savedStep = Number(screenCampaign.draft_step);
    const step: WizardStep = savedStep >= 1 && savedStep <= 4 && Number.isInteger(savedStep)
      ? (savedStep as WizardStep)
      : 1;
    replaceTalkXWizardRoute({ campaignId: screenCampaign.id, step });
    replaceTalkXRoute(null);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [screenCampaign, screenRoute, statusScreen]);

  const openNew = useCallback((initial?: { segmentId?: string; templateId?: string }) => {
    setLocalDraftRouteId(null);
    setEditingCampaign(null); setWizardInitial(initial);
    writeRoutes({ wizard: { campaignId: 'new', step: 1 }, screen: null });
  }, [writeRoutes]);
  const openEdit = useCallback((c: TalkXCampaign) => {
    setLocalDraftRouteId(null);
    setEditingCampaign(c); setWizardInitial(undefined);
    // V23: reabre no passo em que o rascunho foi deixado (antes sempre voltava ao 1).
    const savedStep = Number(c.draft_step);
    const step: WizardStep = savedStep >= 1 && savedStep <= 4 && Number.isInteger(savedStep)
      ? (savedStep as WizardStep)
      : 1;
    writeRoutes({ wizard: { campaignId: c.id, step }, screen: null });
  }, [writeRoutes]);
  // X143: clicar na campanha abre a tela da situação dela — rascunho vai ao wizard.
  const openCampaign = useCallback((c: TalkXCampaign) => {
    const target = screenForStatus(c.status);
    if (target === 'wizard') { openEdit(c); return; }
    setLocalDraftRouteId(null);
    setEditingCampaign(null);
    writeRoutes({ wizard: null, screen: { campaignId: c.id, screen: target } });
  }, [openEdit, writeRoutes]);
  const backToList = useCallback(() => {
    setLocalDraftRouteId(null);
    setEditingCampaign(null); setWizardInitial(undefined);
    writeRoutes({ wizard: null, screen: null }, true);
  }, [writeRoutes]);

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
      writeRoutes({ wizard: { campaignId: created.id, step: 1 }, screen: null });
    } catch {
      // A mutation já mostra o toast de erro.
    }
  }, [duplicateCampaignMutation, writeRoutes]);

  const onWizardStepChange = useCallback((step: WizardStep, replace = false) => {
    if (!wizardRoute) return;
    writeRoutes({ wizard: { ...wizardRoute, step }, screen: null }, replace);
  }, [wizardRoute, writeRoutes]);

  const onDraftIdentity = useCallback((campaignId: string) => {
    setLocalDraftRouteId(campaignId);
    if (wizardRoute?.campaignId === 'new') {
      writeRoutes({ wizard: { campaignId, step: wizardRoute.step }, screen: null }, true);
    }
  }, [wizardRoute, writeRoutes]);

  if (screenRoute && !wizardRoute) {
    // A consulta ainda não respondeu sobre a campanha do endereço: esqueleto até ela
    // chegar — e só então o vazio do kit, para não trocar carga por "não encontrada".
    if (!screenCampaignKnown) {
      if (!isLoading) {
        return (
          <div className="min-h-full w-full min-w-0 bg-background p-6" data-talkx-route="not-found">
            <TalkXEmptyState
              icon={Inbox}
              title="Campanha não encontrada"
              description="A campanha aberta não existe mais ou você não tem acesso a ela."
              actionLabel="Voltar para campanhas"
              onAction={backToList}
            />
          </div>
        );
      }
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

    // Rascunho com endereço de acompanhamento: o efeito acima leva ao wizard.
    if (statusScreen === 'wizard' || (!screenRoute.screen && activeScreen === null)) {
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

    if (topView === 'scheduled') {
      return (
        <TalkXCampaignScheduled
          campaignId={screenRoute.campaignId}
          onBack={backToList}
          onEdit={(c) => { openEdit(c); }}
          onStatusChange={(campaign) => {
            const next = screenForStatus(campaign.status);
            if (next === 'wizard' || next === 'scheduled') { backToList(); return; }
            writeRoutes({ wizard: null, screen: { campaignId: campaign.id, screen: next } }, true);
          }}
        />
      );
    }

    if (topView === 'running') {
      return (
        <TalkXCampaignRunning
          initialCampaignId={screenRoute.campaignId}
          onBack={backToList}
          onViewMonitor={(id) => { writeRoutes({ wizard: null, screen: { campaignId: id, screen: 'monitor' } }); }}
        />
      );
    }

    // monitor e relatório (o relatório cai no monitor em leitura até a trilha de
    // dados, relatório e importação existir).
    return (
      <div className="min-h-full w-full min-w-0 bg-background">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={backToList} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50">
            <ArrowLeft className="w-4 h-4" />Voltar para campanhas
          </button>
        </div>
        <TalkXLiveMonitor campaignId={screenRoute.campaignId} onBack={backToList} />
      </div>
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
            // Lançamento imediato abre a tela 12 (Em Andamento); a agendada abre a 10.
            setLocalDraftRouteId(id);
            writeRoutes({ wizard: null, screen: { campaignId: id, screen: status === 'scheduled' ? 'scheduled' : 'running' } }, true);
          }}
          initial={{ ...wizardInitial, step: wizardRoute?.step }}
          routeStep={wizardRoute?.step}
          onRouteStepChange={onWizardStepChange}
          onDraftIdentity={onDraftIdentity}
        />
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
          <TalkXOverview
            campaigns={campaigns} segments={segments} creators={creators} isLoading={isLoading}
            isError={isError} error={campaignsError} onRetry={() => { void refetchCampaigns(); }}
            onNew={() => openNew()} onEdit={openEdit} onView={openCampaign} onViewScheduled={openCampaign} onViewRunning={openCampaign} onDuplicate={duplicateCampaign}
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
          <TalkXTemplates
            onUseTemplate={(templateId) => openNew({ templateId })}
            startNew={templateStartNew}
            onStartNewHandled={() => setTemplateStartNew(false)}
          />
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
