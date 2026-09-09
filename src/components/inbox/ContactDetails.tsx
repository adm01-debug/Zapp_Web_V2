import { useEffect, useRef, useState, useCallback, startTransition, lazy, Suspense } from 'react';
import { EditContactDialog } from './contact-details/EditContactDialog';
import { Conversation } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContactHeaderSection } from './contact-details/ContactHeaderSection';
import { ContactAccordionSections } from './contact-details/ContactAccordionSections';
import { useContactEnrichedData } from '@/hooks/crm/useContactEnrichedData';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { Accordion } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { log } from '@/lib/logger';
import { getStoredAccordionState, saveAccordionState } from './contact-details/contactDetailSections';

const ConversationHistory = lazy(() => import('./ConversationHistory').then((m) => ({ default: m.ConversationHistory })));
const ConversationTasksPanel = lazy(() => import('./ConversationTasksPanel').then((m) => ({ default: m.ConversationTasksPanel })));
const RemindersPanel = lazy(() => import('./RemindersPanel').then((m) => ({ default: m.RemindersPanel })));
const PrivateNotes = lazy(() => import('./PrivateNotes').then((m) => ({ default: m.PrivateNotes })));
const MediaGalleryContent = lazy(() => import('./MediaGallery').then((m) => ({ default: m.MediaGalleryContent })));

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
}

const PANEL_TABS = [
  { value: 'contact', label: 'Contato' },
  { value: 'history', label: 'Histórico' },
  { value: 'tasks', label: 'Tarefas' },
  { value: 'notes', label: 'Notas' },
  { value: 'files', label: 'Arquivos' },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]['value'];

const TAB_TRIGGER_CLASS =
  'shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 h-11 text-xs sm:flex-1 sm:min-w-0 sm:px-2 sm:text-[13px] font-medium text-muted-foreground ' +
  'data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary';

function TabPanelSkeleton() {
  return (
    <div className="p-4 space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function ContactDetails({ conversation, onClose }: ContactDetailsProps) {
  const { contact } = conversation;
  const { enrichedData, aiTags, slaInfo } = useContactEnrichedData(contact.id);
  const { profileId } = useConversationActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string[]>(getStoredAccordionState);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('contact');

  // Reset da aba ao trocar de contato; startTransition evita setState síncrono no corpo do effect
  // (react-hooks/set-state-in-effect), mesmo padrão de ChatPanel.tsx.
  useEffect(() => {
    startTransition(() => {
      setActiveTab('contact');
      setShowCompactHeader(false);
    });
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [contact.id]);

  const handleTabChange = useCallback((value: string) => {
    const nextTab = PANEL_TABS.some((tab) => tab.value === value) ? value as PanelTab : 'contact';
    setActiveTab(nextTab);
    setShowCompactHeader(false);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setShowCompactHeader(scrollRef.current.scrollTop > 180);
  }, []);

  const handleAccordionChange = useCallback((value: string[]) => {
    setAccordionValue(value);
    saveAccordionState(value);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && panelRef.current) {
        e.preventDefault();
        handleTabChange('notes');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && panelRef.current) {
        e.preventDefault();
        handleTabChange('contact');
        setAccordionValue((current) => {
          const next = current.includes('tags') ? current : [...current, 'tags'];
          saveAccordionState(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleTabChange, onClose]);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'edit': setEditDialogOpen(true); break;
    }
  };

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }} ref={panelRef} role="complementary" aria-label="Detalhes do contato"
      data-testid="contact-panel"
      className="w-full max-w-full sm:w-[380px] h-full min-h-0 shrink-0 bg-card border-l border-border flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-card to-card/95 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h3 className="font-semibold text-foreground text-sm">Detalhes do Contato</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar painel de detalhes" className="w-7 h-7 hover:bg-destructive/10 hover:text-destructive transition-colors">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col">
        <TabsList data-testid="contact-panel-tabs" aria-label="Seções do contato" className="w-full h-11 shrink-0 bg-transparent border-b border-border rounded-none p-0 justify-start gap-0 overflow-x-auto scrollbar-none">
          {PANEL_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`contact-panel-tab-${tab.value}`} className={TAB_TRIGGER_CLASS}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <AnimatePresence>
          {activeTab === 'contact' && showCompactHeader && (
            <ContactHeaderSection contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation} onQuickAction={handleQuickAction} isCompact />
          )}
        </AnimatePresence>

        <div data-testid="contact-panel-scroll" ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <TabsContent value="contact" className="mt-0">
            <ContactHeaderSection
              contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation}
              onQuickAction={handleQuickAction} hasExpandedSections={accordionValue.length > 0}
              onCollapseAll={() => { setAccordionValue([]); saveAccordionState([]); }}
            />
            <Accordion type="multiple" value={accordionValue} onValueChange={handleAccordionChange} className="w-full">
              <ContactAccordionSections
                contact={contact} conversation={conversation} enrichedData={enrichedData ?? null}
                aiTags={aiTags} slaInfo={slaInfo ?? null} profileId={profileId}
                onPanelTabChange={handleTabChange}
              />
            </Accordion>
          </TabsContent>

          <TabsContent value="history" className="mt-0 px-3 pb-3">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ConversationHistory contactId={contact.id} contactPhone={contact.phone} onSelectConversation={(id) => log.debug('Selected conversation:', id)} />
            </Suspense>
          </TabsContent>

          <TabsContent value="tasks" className="mt-0 px-3 pb-3 space-y-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ConversationTasksPanel contactId={contact.id} profileId={profileId} />
              <RemindersPanel contactId={contact.id} profileId={profileId} />
            </Suspense>
          </TabsContent>

          <TabsContent value="notes" className="mt-0 px-3 pb-3">
            <Suspense fallback={<TabPanelSkeleton />}>
              <PrivateNotes contactId={contact.id} />
            </Suspense>
          </TabsContent>

          <TabsContent value="files" className="mt-0 px-3 pb-3">
            <Suspense fallback={<TabPanelSkeleton />}>
              <MediaGalleryContent contactId={contact.id} />
            </Suspense>
          </TabsContent>
        </div>
      </Tabs>

      <EditContactDialog
        open={editDialogOpen} onOpenChange={setEditDialogOpen}
        contact={{
          id: contact.id, name: contact.name, phone: contact.phone, avatar: contact.avatar ?? undefined,
          email: contact.email ?? undefined, nickname: enrichedData?.nickname ?? undefined,
          surname: enrichedData?.surname ?? undefined, job_title: enrichedData?.job_title ?? undefined,
          company: enrichedData?.company ?? undefined, contact_type: enrichedData?.contact_type,
        }}
      />
    </motion.div>
  );
}
