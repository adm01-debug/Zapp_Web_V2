import { toast } from 'sonner';
import React, { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
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
import { ModuleHeader, ModuleBreadcrumb, IconTile, TalkXSkeletonRows, TalkXWhatsAppDisconnectedState } from './talkxShared';
import { ActiveCampaignIndicator } from './kit/ActiveCampaignIndicator';
import { PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { parseTalkXHelpRoute, pushTalkXHelpRoute, type TalkXHelpRoute } from './help/talkxHelpRoute';
import { TalkXOverview } from './TalkXOverview';
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
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// X194 ‚Äî carregamento sob demanda: cada tela do m√≥dulo vira um chunk pr√≥prio e s√≥ √©
// buscada quando a aba/vis√£o que a usa abre. Antes, TalkXView importava as onze telas
// diretamente (mesmo as n√£o usadas no render atual) e o bundle carregava todo codigo
// de uma s√≥ vez, incluindo charts do Analytics e tabelas pesadas do Monitor.
const TalkXSegments = lazyWithRetry(() => import('./TalkXSegments').then((m) => ({ default: m.TalkXSegments })));
const TalkXTemplates = lazyWithRetry(() => import('./TalkXTemplates').then((m) => ({ default: m.TalkXTemplates })));
const TalkXSuppression = lazyWithRetry(() => import('./TalkXSuppression').then((m) => ({ default: m.TalkXSuppression })));
const TalkXAnalytics = lazyWithRetry(() => import('./TalkXAnalytics').then((m) => ({ default: m.TalkXAnalytics })));
const TalkXCampaignWizard = lazyWithRetry(() => import('./TalkXCampaignWizard').then((m) => ({ default: m.TalkXCampaignWizard })));
const TalkXLiveMonitor = lazyWithRetry(() => import('./TalkXLiveMonitor').then((m) => ({ default: m.TalkXLiveMonitor })));
const TalkXCampaignScheduled = lazyWithRetry(() => import('./TalkXCampaignScheduled').then((m) => ({ default: m.TalkXCampaignScheduled })));
const TalkXCampaignRunning = lazyWithRetry(() => import('./TalkXCampaignRunning').then((m) => ({ default: m.TalkXCampaignRunning })));
const TalkXCampaignPaused = lazyWithRetry(() => import('./TalkXCampaignPaused').then((m) => ({ default: m.TalkXCampaignPaused })));
const TalkXHelp = lazyWithRetry(() => import('./help/TalkXHelp').then((m) => ({ default: m.TalkXHelp })));
const TalkXWizardDelivery = lazyWithRetry(() => import('./TalkXWizardDelivery').then((m) => ({ default: m.TalkXWizardDelivery })));

function TalkXScreenFallback() {
  return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>;
}

const TABS: { value: TalkXTab; label: string; icon: React.ReactNode }[] = [
  { value: 'overview', label: 'Vis√£o Geral', icon: <LayoutDashboard className="h-5 w-5" /> },
  { value: 'segments', label: 'Segmentos', icon: <Zap className="h-5 w-5" /> },
  { value: 'templates', label: 'Templates', icon: <FileText className="h-5 w-5" /> },
  { value: 'suppression', label: 'Supress√£o', icon: <ShieldBan className="h-5 w-5" /> },
  { value: 'analytics', label: 'Analitics', icon: <BarChart3 className="h-5 w-5" /> },
];

function useScreenRoute(): { id: string; screen: TalkXScreen } | null {
  try {
    return parseTalkXScreenRoute(location.hash);
  } catch {
    return null;
  }
}

function writeScreenRoute(id: string, screen: TalkXScreen, push: boolean = false) {
  if (push) {
    pushTalkXWizardRoute(`,${id},screen:${screen}`);
  } else {
    replaceTalkXWizardRoute(`,${id},screen:${screen}`);
  }
}

export function TalkXView() {
  const [activeTab, setActiveTab] = useState<TalkXTab>('overview');
  const [topView, setTopView] = useState<'list' | 'monitor' | 'scheduled' | 'running' | 'paused' | 'wizard' | 'help' | 'tabs'>('list');
  const [wizardRoute, setWizardRoute] = useState<TalkXWizardRoute | null>(null);
  const [monitorCampaignId, setMonitorCampaignId] = useState<string | null>(null);
  const [scheduledCampaignId, setScheduledCampaignId] = useState<string | null>(null);
  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);
  const [pausedCampaignId, setPausedCampaignId] = useState<string | null>(null);
  const helpRouteRef = useRef<TalkXHelpRoute | null>(null);

  const { campaigns, isLoading, isError } = useTalkX();
  const { teamProfiles } = useTeamProfiles();
  const { segments } = useTalkXSegments();
  const { templates } = useTalkXTemplates();
  const { serviceStatus } = useTalkXServiceStatus();

  const creators = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of teamProfiles ?? []) {
      if (p.id) map[p.id] = p.full_name ?? p.email ?? p.id;
    }
    return map;
  }, [teamProfiles]);

  useEffect(() => {
    const route = parseTalkXRoute(location.hash);
    if (route.tab) setActiveTab(route.tab);
  }, []);

  const backToList = useCallback(() => {
    setTopView('list');
    setMonitorCampaignId(null);
    setScheduledCampaignId(null);
    setRunningCampaignId(null);
    setPausedCampaignId(null);
    setWizardRoute(null);
    replaceTalkXRoute(`#/talkx/tab:${activeTab}`);
  }, [activeTab]);

  const openMonitor = useCallback((c: { id: string }) => {
    setMonitorCampaignId(c.id);
    setTopView('monitor');
    writeScreenRoute(c.id, 'monitor', true);
  }, []);

  const openScheduled = useCallback((c: { id: string }) => {
    setScheduledCampaignId(c.id);
    setTopView('scheduled');
    writeScreenRoute(c.id, 'scheduled', true);
  }, []);

  const openRunning = useCallback((c: { id: string }) => {
    setRunningCampaignId(c.id);
    setTopView('running');
    writeScreenRoute(c.id, 'running', true);
  }, []);

  const openPaused = useCallback((c: { id: string }) => {
    setPausedCampaignId(c.id);
    setTopView('paused');
    writeScreenRoute(c.id, 'paused', true);
  }, []);

  const onViewRunning = useCallback((c: { id: string; status?: string }) => {
    if (c.status === 'paused') {
      openPaused(c);
    } else {
      openRunning(c);
    }
  }, [openPaused, openRunning]);

  useEffect(() => {
    const sr = useScreenRoute();
    if (!sr || !campaigns.length) return;
    const c = campaigns.find((x) => x.status === 'sending' || x.status === 'paused');
    if (!c) return;
    if (sr.screen === 'running' && c.status === 'sending') {
      setRunningCampaignId(c.id);
      setTopView('running');
    } else if (sr.screen === 'paused' && c.status === 'paused') {
      setPausedCampaignId(c.id);
      setTopView('paused');
    }
  }, [campaigns]);

  const onView = useCallback((c: TalkXCampaign) => {
    if (c.status === 'sending' || c.status === 'paused') {
      if (c.status === 'paused') {
        openPaused(c);
        return;
      }
      openRunning(c);
      return;
    }
    if (c.status === 'scheduled') {
      openScheduled(c);
      return;
    }
    openMonitor(c);
  }, [openRunning, openPaused, openScheduled, openMonitor]);

  const onWizardStep = useCallback((step: WizardStep) => {
    setWizardRoute((prev) => {
      if (!prev) return null;
      return { ...prev, step };
    });
    replaceTalkXWizardRoute(`,${wizardRoute?.id ?? ''},step:${step}`);
  }, [wizardRoute?.id]);

  if (topView === 'monitor' && monitorCampaignId) {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXLiveMonitor
          campaignId={monitorCampaignId}
          onBack={backToList}
          onViewRunning={onViewRunning}
        />
      </Suspense>
    );
  }

  if (topView === 'scheduled' && scheduledCampaignId) {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXCampaignScheduled
          campaignId={scheduledCampaignId}
          onBack={backToList}
          onStatusChange={(campaign) => {
            setScheduledCampaignId(null);
            if (campaign.status === 'sending') {
              setRunningCampaignId(campaign.id);
              setTopView('running');
              writeScreenRoute(campaign.id, 'running', true);
              return;
            }
            backToList();
          }}
        />
      </Suspense>
    );
  }

  if (topView === 'running' && runningCampaignId) {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXCampaignRunning
          campaignId={runningCampaignId}
          onBack={backToList}
          onStatusChange={(campaign) => {
            setRunningCampaignId(null);
            if (campaign.status === 'paused') {
              setPausedCampaignId(campaign.id);
              setTopView('paused');
              writeScreenRoute(campaign.id, 'paused', true);
              return;
            }
            backToList();
          }}
        />
      </Suspense>
    );
  }


  if (topView === 'paused' && pausedCampaignId) {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXCampaignPaused
          campaignId={pausedCampaignId}
          onBack={backToList}
          onStatusChange={(campaign) => {
            setPausedCampaignId(null);
            if (campaign.status === 'sending') {
              setRunningCampaignId(campaign.id);
              setTopView('running');
              writeScreenRoute(campaign.id, 'running', true);
              return;
            }
            backToList();
          }}
        />
      </Suspense>
    );
  }

  if (topView === 'wizard' && wizardRoute) {
    if (wizardRoute.step === 'delivery') {
      return (
        <Suspense fallback={<TalkXScreenFallback />}>
          <TalkXWizardDelivery
            campaignId={wizardRoute.id}
            onBack={() => {
              setWizardRoute((prev) => prev ? { ...prev, step: 'edit' } : null);
              replaceTalkXWizardRoute(`,${wizardRoute.id},step:edit`);
            }}
            onConfirm={(campaign) => {
              setWizardRoute(null);
              if (campaign.status === 'sending') {
                openRunning(campaign);
              } else if (campaign.status === 'scheduled') {
                openScheduled(campaign);
              } else {
                backToList();
              }
            }}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXCampaignWizard
          route={wizardRoute}
          onStep={onWizardStep}
          onCancel={backToList}
          onDelivery={() => {
            setWizardRoute((prev) => prev ? { ...prev, step: 'delivery' } : null);
            replaceTalkXWizardRoute(`,${wizardRoute?.id ?? ''},step:delivery`);
          }}
        />
      </Suspense>
    );
  }

  if (topView === 'help') {
    return (
      <Suspense fallback={<TalkXScreenFallback />}>
        <TalkXHelp
          initialRoute={helpRouteRef.current ?? {}}
          onBack={backToList}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader>
        <ModuleBreadcrumb>
          <span className="text-muted-foreground">Campanhas</span>
        </ModuleBreadcrumb>
        <div className="flex items-center gap-2">
          <ActiveCampaignIndicator
            campaigns={campaigns}
            onView={onView}
          />
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PrimaryButton
                  icon={<Plus className="h-oHKMàœüBà€ê€X⁄œ^›[ôYö[ôYBàÇàõ›òHÿ[\[öBà‘ö[X\ûPù]€èÇà—õ‹›€ìY[ùUöYŸŸ\èÇàõ‹›€ìY[ùP€€ù[ù[Y€èHô[ôèÇàõ‹›€ìY[ùR][Bà€ê€X⁄œ^ 
HOà¬à€€ú›ô]‘õ›]HH\⁄[÷⁄^ò\ôõ›]J	À›\ôY]	 N¬àŸ]⁄^ò\ôõ›]Jô]‘õ›]JN¬àŸ]‹öY] 	›⁄^ò\ô	 N¬à_BàÇà\»€\‹”ò[YOHö_FR—â2”R"Û‡¢Ê˜f6◊ÊÜ¢¬ÙG&˜F˜v‰÷VÁTóFV”‡¢¬ÙG&˜F˜v‰÷VÁT6ˆÁFVÁC‡¢¬ÙG&˜F˜v‰÷VÁS‡¢ƒñÊñÁEFñ∆P¢ñ6ˆ„◊≥ƒÜV«6ó&6∆R6∆74Ê÷S“&Ç”Br”B"ÛÁ–¢∆&V√“$ßVF ¢ˆ‰6∆ñ6≥◊≤Çí”‚∞¢ÜV«&˜WFU&VbÊ7W'&VÁB“'6UF∆µÑÜV«&˜WFRÜ∆ˆ6Fñˆ‚ÊÜ6Çì∞¢6WEF˜fñWrÇvÜV«rì∞¢W6ÖF∆µÑÜV«&˜WFRÜ∆ˆ6Fñˆ‚ÊÜ6Çì∞¢◊–¢Û‡¢¬ˆFóc‡¢¬ˆFóc‡¢¬Ù÷ˆGV∆TÜVFW#‡¢≈F'0¢f«VS◊∂7FófUF'–¢ˆÂf«VT6ÜÊvS◊≤ábí”‚∞¢6WD7FófUF"áb2F∆µÖF"ì∞¢&W∆6UF∆µÖF%&˜WFRábì∞¢◊–¢6∆74Ê÷S“&f∆WÇ”f∆WÇf∆WÇ÷6ˆ¬÷ñ‚÷Ç” ¢‡¢≈F'4∆ó7B6∆74Ê÷S“'Ç”bf∆WÇ◊6á&ñÊ≤”#‡¢µD%2Ê÷ÇáF"í”‚Ä¢≈F'5G&ñvvW"∂Wì◊∑F"Áf«VW“f«VS◊∑F"Áf«VW”‡¢∑F"Êñ6ˆÁ–¢∑F"Ê∆&V«–¢¬ıF'5G&ñvvW#‡¢íó–¢¬ıF'4∆ó7C‡¢≈F'46ˆÁFVÁBf«VS“&˜fW'fñWr"6∆74Ê÷S“&f∆WÇ”÷ñ‚÷Ç”˜fW&f∆˜r◊í÷WFÚ#‡¢≈6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢≈F∆µÑ˜fW'fñWp¢6◊ñvÁ3◊∂6◊ñvÁ7–¢ó4∆ˆFñÊs◊∂ó4∆ˆFñÊw–¢ó4W'&˜#◊∂ó4W'&˜'–¢7&VF˜'3◊∂7&VF˜'7–¢ˆÂfñWs◊∂ˆÂfñWw–¢ˆ‰ÊWs◊≤Çí”‚∞¢6ˆÁ7BÊWu&˜WFR“W6ÖF∆µÖvó¶&E&˜WFRÇr¬«7FW¶VFóBrì∞¢6WEvó¶&E&˜WFRÜÊWu&˜WFRì∞¢6WEF˜fñWrÇwvó¶&Brì∞¢◊–¢ˆ‰GW∆ñ6FS◊≤Çí”‚∞¢6ˆÁ7BÊWu&˜WFR“W6ÖF∆µÖvó¶&E&˜WFRÇr¬«7FW¶VFóBrì∞¢6WEvó¶&E&˜WFRÜÊWu&˜WFRì∞¢6WEF˜fñWrÇwvó¶&Brì∞¢◊–¢Û‡¢¬ı6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢¬ıF'46ˆÁFVÁC‡¢≈F'46ˆÁFVÁBf«VS“'6Vv÷VÁG2"6∆74Ê÷S“&f∆WÇ”÷ñ‚÷Ç”˜fW&f∆˜r◊í÷WFÚ#‡¢≈6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢≈F∆µÖ6Vv÷VÁG0¢6Vv÷VÁG3◊∑6Vv÷VÁG7–¢6◊ñvÁ3◊∂6◊ñvÁ7–¢7&VF˜'3◊∂7&VF˜'7–¢Û‡¢¬ı6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢¬ıF'46ˆÁFVÁC‡¢≈F'46ˆÁFVÁBf«VS“'FV◊∆FW2"6∆74Ê÷S“&f∆WÇ”÷ñ‚÷Ç”˜fW&f∆˜r◊í÷WFÚ#‡¢≈6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢≈F∆µÖFV◊∆FW0¢FV◊∆FW3◊∑FV◊∆FW7–¢Û‡¢¬ı6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢¬ıF'46ˆÁFVÁC‡¢≈F'46ˆÁFVÁBf«VS“'7W&W76ñˆ‚"6∆74Ê÷S“&f∆WÇ”÷ñ‚÷Ç”˜fW&f∆˜r◊í÷WFÚ#‡¢≈6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢≈F∆µÖ7W&W76ñˆ‚Û‡¢¬ı6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢¬ıF'46ˆÁFVÁC‡¢≈F'46ˆÁFVÁBf«VS“&Ê«óFñ72"6∆74Ê÷S“&f∆WÇ”÷ñ‚÷Ç”˜fW&f∆˜r◊í÷WFÚ#‡¢≈6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢≈F∆µÑÊ«óFñ72Û‡¢¬ı6V7Fñˆ‰W'&˜$&˜VÊF'ì‡¢¬ıF'46ˆÁFVÁC‡¢¬ıF'3‡¢¬ˆFóc‡¢ì∞ß–