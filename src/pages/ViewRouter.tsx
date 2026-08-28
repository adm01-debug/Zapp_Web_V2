import { Construction } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useCurrentModule } from '@/hooks/system/useCurrentModule';
import { useDocumentTitle } from '@/hooks/ui/useDocumentTitle';
import { useAriaAnnouncer } from '@/hooks/ui/useAriaAnnouncer';
import { ErrorBoundaryWithRetry } from '@/components/ui/error-boundary-retry';

import * as Views from './lazyViews';

interface ViewRouterProps {
  currentView: string;
  userId?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  breadcrumbTrail?: string[];
  onNavigateTo?: (viewId: string) => void;
}

// Views that manage their own full-screen layout (no header)
const FULL_SCREEN_VIEWS = new Set(['inbox', 'pipeline', 'omni-inbox', 'team-chat', 'email-chat']);

interface WithHeaderProps {
  viewId: string;
  children: React.ReactNode;
}

function WithHeader({ viewId, children }: WithHeaderProps) {
  if (FULL_SCREEN_VIEWS.has(viewId)) return <>{children}</>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto p-6">{children}</div>
    </div>
  );
}

// Declarative route map — easier to maintain than switch/case
const VIEW_MAP: Record<string, React.LazyExoticComponent<React.ComponentType<Record<string, never>>>> = {
  'inbox': Views.RealtimeInboxView,
  'dashboard': Views.DashboardView,
  'agents': Views.AgentsView,
  'queues': Views.QueuesView,
  'contacts': Views.ContactsView,
  'groups': Views.GroupsView,
  'connections': Views.ConnectionsView,
  'wallet': Views.ClientWalletView,
  'catalog': Views.ProductManagement,
  'transcriptions': Views.TranscriptionsHistoryView,
  'admin': Views.AdminView,
  'tags': Views.TagsView,
  'sentiment': Views.SentimentAlertsDashboard,
  'reports': Views.AdvancedReportsView,
  'security': Views.SecurityView,
  'settings': Views.SettingsView,
  'docs': Views.SystemFeaturesView,
  'campaigns': Views.CampaignsView,
  'chatbot': Views.ChatbotFlowsView,
  'automations': Views.AutomationsManager,
  'integrations': Views.IntegrationsHub,
  'privacy': Views.LGPDComplianceView,
  'pipeline': Views.SalesPipelineView,
  'knowledge': Views.KnowledgeBaseView,
  'payments': Views.PaymentLinksView,
  'wa-flows': Views.WhatsAppFlowsBuilder,
  'meta-capi': Views.MetaCAPIView,
  'diagnostics': Views.DiagnosticsView,
  'voip': Views.VoIPPanel,
  'auto-export': Views.AutoExportManager,
  'google-calendar': Views.GoogleCalendarIntegration,
  'themes': Views.ThemeCustomizer,
  'schedule': Views.ScheduleCalendarView,
  'warroom': Views.WarRoomDashboard,
  'wa-templates': Views.WhatsAppTemplatesManager,
  'omnichannel': Views.OmnichannelManager,
  'churn': Views.ChurnPredictionDashboard,
  'ticket-classifier': Views.AutoTicketClassifier,
  'performance': Views.PerformanceMonitor,
  'omni-inbox': Views.OmnichannelInbox,
  'audit-logs': Views.AuditLogDashboard,
  'telemetry': Views.AdminTelemetriaPage,
  'nps': Views.NPSDashboard,
  'team-chat': Views.TeamChatView,
  'email-chat': Views.EmailChatView,
  'gmail': Views.GmailInboxView,
  'public-api': Views.PublicApiDashboard,
  'gmail-webhook': Views.GmailWebhookMonitor,
  'media-migration': Views.MediaMigrationTool,
  'sicoob-bridge': Views.SicoobBridgeDashboard,
  'crm360': Views.CRM360ExplorerView,
  'ai-usage': Views.AIUsageDashboard,
  'sla': Views.SLADashboardView,
  'talkx': Views.TalkXView,
  'evolution-monitor': Views.EvolutionMonitoringDashboard,
};

// Views that need custom props
const SPECIAL_VIEWS: Record<string, (props: ViewRouterProps) => React.ReactNode> = {
  'achievements': (props) => (
    <ErrorBoundaryView viewId="achievements">
      <Views.AchievementsSystemLazy userId={props.userId} />
    </ErrorBoundaryView>
  ),
};

export function ViewRouter({ currentView, userId, canGoBack, canGoForward, onGoBack, onGoForward, breadcrumbTrail, onNavigateTo }: ViewRouterProps) {
  const mod = useCurrentModule(currentView);
  useDocumentTitle(mod.label);
  const { announce } = useAriaAnnouncer();
  const prefersReduced = useReducedMotion();

  // Announce view changes for screen readers
  useEffect(() => {
    announce(`Navegou para ${mod.label}`);
  }, [currentView, mod.label, announce]);

  const content = useMemo(() => {
    // Check special views first (those needing props)
    if (SPECIAL_VIEWS[currentView]) {
      return SPECIAL_VIEWS[currentView]({ currentView, userId, canGoBack, canGoForward, onGoBack, onGoForward, breadcrumbTrail, onNavigateTo });
    }
    // Standard views from map
    const ViewComponent = VIEW_MAP[currentView];
    if (ViewComponent) {
      return (
        <ErrorBoundaryView viewId={currentView}>
          <ViewComponent />
        </ErrorBoundaryView>
      );
    }
    return <FallbackView currentView={currentView} />;
  }, [currentView, userId]);

  return (
    <WithHeader viewId={currentView}>
      {prefersReduced ? (
        <div key={currentView} className="h-full w-full">{content}</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="h-full w-full"
          >
            {content}
          </motion.div>
        </AnimatePresence>
      )}
    </WithHeader>
  );
}

/** Per-view error boundary with automatic retry */
function ErrorBoundaryView({ viewId, children }: { viewId: string; children: React.ReactNode }) {
  const mod = useCurrentModule(viewId);
  return (
    <ErrorBoundaryWithRetry
      key={viewId}
      moduleName={mod.label}
      maxAutoRetries={2}
    >
      {children}
    </ErrorBoundaryWithRetry>
  );
}

function FallbackView({ currentView }: { currentView: string }) {
  const mod = useCurrentModule(currentView);
  const Icon = mod.icon || Construction;

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-b from-background to-muted/20">
      <div className="text-center max-w-sm px-6 animate-fade-in">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-primary/20"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Icon className="w-9 h-9 text-primary-foreground" />
        </div>

        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          {mod.label}
        </h2>

        {mod.group && (
          <span className="inline-block text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mb-3">
            {mod.group}
          </span>
        )}

        <p className="text-muted-foreground text-sm leading-relaxed">
          Este módulo está em desenvolvimento e será disponibilizado em breve.
        </p>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-muted-foreground/60">
          <Construction className="w-3.5 h-3.5" />
          <span>Em construção</span>
        </div>
      </div>
    </div>
  );
}
