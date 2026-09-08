import { useEffect, useRef, useState, useCallback, startTransition } from 'react';
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
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { getStoredAccordionState, saveAccordionState } from './contact-details/contactDetailSections';

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

const TAB_TRIGGER_CLASS =
  'rounded-none border-b-2 border-transparent bg-transparent px-3 h-11 text-sm font-medium text-muted-foreground ' +
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
  const [activeTab, setActiveTab] = useState<string>('contact');

  // Reset da aba ao trocar de contato; startTransition evita setState síncrono no corpo do effect
  // (react-hooks/set-state-in-effect), mesmo padrão de ChatPanel.tsx.
  useEffect(() => {
    startTransition(() => { setActiveTab('contact'); });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [contact.id]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setShowCompactHeader(scrollRef.current.scrollTop > 180);
  }, []);

  const handleAccordionChange = useCallback((value: string[]) => {
    setAccordionValue(value);
    saveAccordionState(value);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && panelRef.current) {
        e.preventDefault();
        panelRef.current.querySelector('textarea')?.focus();
        toast.info('📝 Notas Privadas');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && panelRef.current) {
        e.preventDefault(); toast.info('🏷️ Seção de Tags');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'edit': setEditDialogOpen(true); break;
      case 'vip':
        undoToast({
          message: `${contact.name} marcado como VIP`,
          icon: '⭐',
          onUndo: () => { toast.info('VIP removido'); },
        });
        break;
      case 'archive':
        undoToast({
          message: `${contact.name} arquivado`,
          icon: '📦',
          onUndo: () => { toast.info('Contato restaurado'); },
        });
        break;
      case 'block':
        undoToast({
          message: `${contact.name} bloqueado`,
          icon: '🚫',
          onUndo: () => { toast.info('Contato desbloqueado'); },
        });
        break;
    }
  };

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }} ref={panelRef} role="complementary" aria-label="Detalhes do contato"
      data-testid="contact-panel"
      className="w-[390px] xl:w-[360px] h-full min-h-0 shrink-0 bg-card border-l border-border flex flex-col overflow-hidden"
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

      <AnimatePresence>
        {showCompactHeader && (
          <ContactHeaderSection contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation} onQuickAction={handleQuickAction} isCompact />
        )}
      </AnimatePresence>

      <ContactHeaderSection
        contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation}
        onQuickAction={handleQuickAction} hasExpandedSections={accordionValue.length > 0}
        onCollapseAll={() => { setAccordionValue([]); saveAccordionState([]); }}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
        <TabsList data-testid="contact-panel-tabs" className="w-full h-11 shrink-0 bg-transparent border-b border-border rounded-none p-0 justify-start gap-0">
          {PANEL_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`contact-panel-tab-${tab.value}`} className={TAB_TRIGGER_CLASS}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <TabsContent value="contact" className="mt-0">
            <Accordion type="multiple" value={accordionValue} onValueChange={handleAccordionChange} className="w-full">
              <ContactAccordionSections
                contact={contact} conversation={conversation} enrichedData={enrichedData ?? null}
                aiTags={aiTags} slaInfo={slaInfo ?? null} profileId={profileId}
                onPanelTabChange={setActiveTab}
              />
            </Accordion>
          </TabsContent>

          <TabsContent value="history" className="mt-0"><TabPanelSkeleton /></TabsContent>
          <TabsContent value="tasks" className="mt-0"><TabPanelSkeleton /></TabsContent>
          <TabsContent value="notes" className="mt-0"><TabPanelSkeleton /></TabsContent>
          <TabsContent value="files" className="mt-0"><TabPanelSkeleton /></TabsContent>
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
