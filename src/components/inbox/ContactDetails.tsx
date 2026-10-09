import { useEffect, useRef, useState, useCallback } from 'react';
import { EditContactDialog } from './contact-details/EditContactDialog';
import { buildEditContactShape } from './contact-details/editContactShape';
import { Conversation } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PanelRightClose, Plus, Tag, TagsIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContactHeaderSection } from './contact-details/ContactHeaderSection';
import { ContactSidebarSections } from './contact-details/sidebar/ContactSidebarSections';
import { useContactEnrichedData } from '@/hooks/crm/useContactEnrichedData';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { useContactQuickActions } from '@/hooks/inbox/useContactQuickActions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getStoredSidebarState, saveSidebarState } from './contact-details/sidebar/sidebarSections';

interface ContactDetailsProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ContactDetails({ conversation, onClose }: ContactDetailsProps) {
  const { contact } = conversation;
  const { enrichedData, aiTags, slaInfo } = useContactEnrichedData(contact.id);
  const { archiveContact } = useConversationActions();
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

  const quickActions = useContactQuickActions(contact);

  // VIP/bloquear/tags gravam via useContactQuickActions; Arquivar delega ao
  // archiveContact (semântica única: zera assigned_to e o Desfazer restaura o
  // valor anterior real — decisão do dono em 06/10, cartão #241).
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'edit': setEditDialogOpen(true); break;
      case 'vip': void quickActions.markVip(); break;
      case 'archive': void archiveContact(contact.id); break;
      case 'block': void quickActions.block(); break;
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
            <ContactHeaderSection contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation} onQuickAction={handleQuickAction} isCompact tags={quickActions.tags} />
          )}
        </AnimatePresence>

        <ContactHeaderSection
          contact={{ ...contact, avatar: contact.avatar ?? undefined, email: contact.email ?? undefined }} enrichedData={enrichedData} conversation={conversation}
          onQuickAction={handleQuickAction} hasExpandedSections={accordionValue.length > 0}
          onCollapseAll={() => { setAccordionValue([]); saveSidebarState([]); }}
          tags={quickActions.tags}
        />

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <Accordion type="multiple" value={accordionValue} onValueChange={handleAccordionChange} className="w-full">
            <ContactSidebarSections
              contact={contact} enrichedData={enrichedData ?? null}
              onQuickAction={handleQuickAction}
            />
            <ContactTagsSection
              tags={quickActions.tags}
              onAddTag={quickActions.addTag} onRemoveTag={quickActions.removeTag}
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

interface ContactTagsSectionProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

function ContactTagsSection({ tags, onAddTag, onRemoveTag }: ContactTagsSectionProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const tag = draft.trim();
    if (!tag) return;
    setDraft('');
    onAddTag(tag);
  };

  return (
    <AccordionItem value="tags" data-testid="sidebar-section-tags" className="mx-4 mb-3 rounded-xl border border-border bg-muted/20 overflow-hidden">
      <AccordionTrigger className="px-3 py-3 hover:no-underline hover:bg-transparent [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-muted-foreground">
        <div className="flex items-center gap-2.5 text-left min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/15 text-primary [&>svg]:w-4 [&>svg]:h-4"><Tag /></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground leading-tight">Tags</div>
            <div className="text-xs text-muted-foreground truncate">Marcadores locais do contato</div>
          </div>
          {tags.length > 0 && (
            <span className="text-3xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-semibold shrink-0">{tags.length}</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="flex items-center gap-1 bg-primary/10 border border-primary/20 text-foreground hover:bg-primary/20 transition-all cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />{tag}
              <button type="button" aria-label={`Remover tag ${tag}`} onClick={() => onRemoveTag(tag)} className="ml-0.5 rounded-full hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {tags.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 w-full py-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center"><TagsIcon className="w-5 h-5 text-muted-foreground/30" /></div>
              <p className="text-xs text-muted-foreground">Nenhuma tag adicionada</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Nova tag"
            aria-label="Nova tag"
            className="h-7 text-xs"
          />
          <Button type="button" variant="ghost" size="sm" aria-label="Adicionar tag" onClick={submit} className="h-7 text-xs shrink-0 hover:bg-primary/10 hover:text-primary border border-dashed border-border/40 hover:border-primary/30">
            <Plus className="w-3 h-3 mr-1" />Adicionar
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
