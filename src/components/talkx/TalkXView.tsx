import React, { useState, useMemo, useCallback } from 'react';
import {
  Zap, Plus, Bookmark, FileText, ShieldBan, BarChart3, ArrowLeft,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTalkX, TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTalkXSegments } from '@/hooks/integrations/useTalkXSegments';
import { useTalkXTemplates } from '@/hooks/integrations/useTalkXTemplates';
import { ModuleHeader, IconTile } from './talkxShared';
import { PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';
import { TalkXOverview } from './TalkXOverview';
import { TalkXCampaignWizard } from './TalkXCampaignWizard';
import { TalkXLiveMonitor } from './TalkXLiveMonitor';
import { TalkXSegments } from './TalkXSegments';
import { TalkXTemplates } from './TalkXTemplates';
import { TalkXSuppression } from './TalkXSuppression';
import { TalkXAnalytics } from './TalkXAnalytics';

export type TalkXTopView = 'tabs' | 'wizard' | 'monitor';

export default function TalkXView() {
  const { campaigns, isLoading, startCampaign, pauseCampaign, cancelCampaign, deleteCampaign } = useTalkX();
  const { segments } = useTalkXSegments();
  const { templates } = useTalkXTemplates();
  const [topView, setTopView] = useState<TalkXTopView>('tabs');
  const [activeTab, setActiveTab] = useState('overview');
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [wizardInitial, setWizardInitial] = useState<{ segmentId?: string; templateId?: string } | undefined>();

  const openNew = useCallback((initial?: { segmentId?: string; templateId?: string }) => { setEditingCampaign(null); setWizardInitial(initial); setTopView('wizard'); }, []);
  const openEdit = useCallback((c: TalkXCampaign) => { setEditingCampaign(c); setWizardInitial(undefined); setTopView('wizard'); }, []);
  const openMonitor = useCallback((c: TalkXCampaign) => { setMonitorId(c.id); setTopView('monitor'); }, []);
  const backToList = useCallback(() => { setTopView('tabs'); setEditingCampaign(null); setMonitorId(null); setWizardInitial(undefined); }, []);

  const creators = useMemo(() => {
    const m: Record<string, string> = {};
    campaigns.forEach((c) => { if (c.created_by) m[c.created_by] = c.name; });
    return m;
  }, [campaigns]);

  const duplicateCampaign = useCallback(async (c: TalkXCampaign) => {
    setEditingCampaign({ ...c, id: '', name: `${c.name} (cópia)`, status: 'draft', sent_count: 0, failed_count: 0, delivered_count: 0, total_recipients: 0, started_at: null, completed_at: null });
    setWizardInitial(undefined);
    setTopView('wizard');
  }, []);

  const onView = useCallback((c: TalkXCampaign) => {
    openMonitor(c);
  }, [openMonitor]);

  if (topView === 'wizard') {
    return (
      <div className="min-h-full bg-background p-3 md:p-4 lg:p-6">
        <TalkXCampaignWizard
          campaign={editingCampaign}
          onClose={backToList}
          onLaunched={(id) => { setMonitorId(id); setTopView('monitor'); }}
          initial={wizardInitial}
        />
      </div>
    );
  }

  if (topView === 'monitor' && monitorId) {
    return (
      <div className="min-h-full bg-background p-3 md:p-4 lg:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={backToList} className="h9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-[12.5px] font-medium text-foreground-secondary hover:bv-muted/50">
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
        title="Talk X"
        subtitle="Campanhas WhatsApp que geram conversas reais e resultados mensuráveis."
        right={<PrimaryButton icon={Plus} onClick={() => openNew()}>Nova campanha</PrimaryButton>}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex gap-1 h-auto bg-transparent border-b border-border/60 rounded-none pb-0 px-0 w-full justify-start">
            {([['overview', 'Visão Geral', BarChart3],['segments', 'Segmentos', Bookmark],['templates', 'Templates', FileText],['suppression', 'Supressão', ShieldBan],['analytics', 'Analytics', BarChart3]] as const).map(([v, label, Icon]) => (
              <TabsTrigger key={v} value={v} className="relative h-9 px-3.5 rounded-none border-b-2 text-[12.5px] font-medium transition-colors data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=inactive]:border-transparent data-[state=inactive]:text-foreground-secondary hover:text-foreground hover:border-border data-[state=active]:bg-transparent data-[state=inactive]:bg-transparent">
                <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <TalkXOverview
            campaigns={campaigns} segments={segments} creators={creators} isLoading={isLoading}
            onNew={() => openNew()} onEdit={openEdit} onView={onView} onDuplicate={duplicateCampaign}
            onStart={(id) => startCampaign(id)} onPause={(id) => pauseCampaign(id)} onCancel={(id) => cancelCampaign(id)} onDelete={(id) => deleteCampaign.mutate(id)}
            onGoTab={(tab) => { if (tab === 'templates') setActiveTab('templates'); else if (tab === 'segments') setActiveTab('segments'); }}
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
          <TalkXAnalytics campaigns={campaigns} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
