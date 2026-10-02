import { useEffect, useRef, useState, useCallback } from 'react';
import { EditContactDialog } from './contact-details/EditContactDialog';
import { buildEditContactShape } from './contact-details/editContactShape';
import { Conversation } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PanelRightClose } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContactHeaderSection } from './contact-details/ContactHeaderSection';
import { ContactSidebarSections } from './contact-details/sidebar/ContactSidebarSections';
import { useContactEnrichedData } from '@/hooks/crm/useContactEnrichedData';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { Accordion } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { getStoredSidebarState, saveSidebarState } from './contact-details/sidebar/sidebarSections';

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ContactDetails({ conversation, onClose }: ContactDetailsProps) {
  const { contact } = conversation;
  const { enrichedData, aiTags, slaInfo } = useContactEnrichedData(contact.id);
  const { profileId } = useConversationActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string[]>(getStoredSidebarState);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [contact.id]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setShowCompactHeader(scrollRef.current.scrollTop > 180);
  }, []);

  const handleAccordionChange = useCallback((value: string[]) => {
    setAccordionValue(value);
    saveSidebarState(value);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // e.defaultPrevented: o DismissableLayer do Radix (dropdown/tooltip)
      // escuta Escape em fase de capture e chama preventDefault() ao fechar —
      // sem este check, Escape fechava o dropdown de ações E o painel junto
      // (achado na auditoria de 5 agentes, 2026-09-26, rodada 4).
      // SELECT: fechar o dropdown nativo não chama preventDefault(), então sem
      // a exclusão abaixo o Escape colapsa o painel junto com o <select>.
      // isContentEditable: mesma situação em divs/spans editáveis — Esc deve
      // cancelar a edição, não fechar o painel (auditoria 2026-09-27).
      if (e.key === 'Escape' && !e.defaultPrevented && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault(); onClose();
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
      className="w-[323px] h-full min-h-0 shrink-0 bg-inbox-panel border-l border-border flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-inbox-panel shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h3 className="font-semibold text-foreground text-sm">Detalhes do Contato</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Recolher painel de detalhes" className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <PanelRightClose className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recolher painel</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence>
          {showCompactHeader && (
            <ContactHeaderSection contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation} onQuickAction={handleQuickAction} isCompact />
          )}
        </AnimatePresence>

        <ContactHeaderSection
          contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation}
          onQuickAction={handleQuickAction} hasExpandedSections={accordionValue.length > 0}
          onCollapseAll={() => { setAccordionValue([]); saveSidebarState([]); }}
        />

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <Accordion type="multiple" value={accordionValue} onValueChange={handleAccordionChange} className="w-full">
            <ContactSidebarSections
              contact={contact} enrichedData={enrichedData ?? null}
              onQuickAction={handleQuickAction}
            />
          </Accordion>
        </div>
      </div>

      <EditContactDialog
        open={editDialogOpen} onOpenChange={setEditDialogOpen}
        contact={buildEditContactShape({ contact, enrichedData })}
      />
    </motion.div>
  );
}
