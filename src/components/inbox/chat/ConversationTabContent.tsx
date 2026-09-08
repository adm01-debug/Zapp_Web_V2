import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import type { Conversation, Message } from '@/types/chat';
import type { AnalysisMessage } from '../ai-tools/analysisConfigs';
import type { ConversationTab } from './ConversationTabs';
import { TabBanner } from '../tabs/TabBanner';

const AIConversationAssistant = lazy(() =>
  import('../AIConversationAssistant').then((m) => ({ default: m.AIConversationAssistant })));
const ContactPurchasesPanel = lazy(() =>
  import('../ContactPurchasesPanel').then((m) => ({ default: m.ContactPurchasesPanel })));
const OrdersTab = lazy(() =>
  import('../tabs/OrdersTab').then((m) => ({ default: m.OrdersTab })));
const ConversationTasksPanel = lazy(() =>
  import('../ConversationTasksPanel').then((m) => ({ default: m.ConversationTasksPanel })));
const PrivateNotes = lazy(() =>
  import('../PrivateNotes').then((m) => ({ default: m.PrivateNotes })));
const MediaGalleryContent = lazy(() =>
  import('../MediaGallery').then((m) => ({ default: m.MediaGalleryContent })));
const ConversationHistory = lazy(() =>
  import('../ConversationHistory').then((m) => ({ default: m.ConversationHistory })));

function PanelFallback() {
  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Wrapper comum: scroll próprio + padding + boundary por seção. */
function Panel({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <SectionErrorBoundary sectionName={name}>
        <Suspense fallback={<PanelFallback />}>{children}</Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

interface ConversationTabContentProps {
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  conversation: Conversation;
  messages: Message[];
  /** Conteúdo da aba Chat — renderizado pelo pai, sempre montado. */
  children: ReactNode;
}

export function ConversationTabContent({
  activeTab, onTabChange, conversation, messages, children,
}: ConversationTabContentProps) {
  const contactId = conversation.contact.id;

  const analysisMessages = useMemo<AnalysisMessage[]>(
    () => messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      content: m.content,
      type: m.type,
      mediaUrl: m.mediaUrl,
      created_at: m.created_at ?? m.timestamp.toISOString(),
    })),
    [messages]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/*
        A aba Chat fica sempre montada e só é escondida — desmontar perderia
        scroll, rascunho de mensagem, gravação de áudio e assinaturas realtime.
        As demais abas montam sob demanda (lazy) e desmontam ao sair.
      */}
      <div className={activeTab === 'chat' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        {activeTab === 'chat' && (
          <div className="px-4 pt-3">
            <TabBanner
              icon={Sparkles}
              title="Assistente IA"
              description="Sugestões de resposta, identificação de intenção e próximos passos."
              action={{ label: 'Ver sugestões', onClick: () => onTabChange('ia') }}
              dismissKey="inbox-ai-banner-dismissed"
              testId="chat-ai-banner"
            />
          </div>
        )}
        {children}
      </div>

      {activeTab === 'ia' && (
        <Panel name="Assistente IA">
          <AIConversationAssistant
            messages={analysisMessages}
            contactId={contactId}
            contactName={conversation.contact.name}
            isOpen
            onClose={() => {}}
          />
        </Panel>
      )}

      {activeTab === 'crm' && (
        <Panel name="CRM 360°">
          <ContactPurchasesPanel contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'orders' && (
        <Panel name="Pedidos">
          <OrdersTab contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'tasks' && (
        <Panel name="Tarefas">
          <ConversationTasksPanel contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'notes' && (
        <Panel name="Notas">
          <PrivateNotes contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'files' && (
        <Panel name="Arquivos">
          <MediaGalleryContent contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'history' && (
        <Panel name="Histórico">
          <ConversationHistory contactId={contactId} contactPhone={conversation.contact.phone} />
        </Panel>
      )}
    </div>
  );
}
