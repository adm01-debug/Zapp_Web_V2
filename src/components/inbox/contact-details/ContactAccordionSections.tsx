import { motion } from 'framer-motion';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Tag, Sparkles, User, FileText, Clock, BarChart3, Brain, Info, TagsIcon, Smartphone, Image, ListTodo, Bell, TrendingUp, ShoppingBag, GitBranch, X, BadgeCheck } from 'lucide-react';
import { Conversation, ConversationContact as Contact } from '@/types/chat';

import { ContactInfoSection } from './ContactInfoSection';
import { AssignmentSection } from './AssignmentSection';
import { ContactStatsSection } from './ContactStatsSection';
import { SLAAndAITagsSection } from './SLAAndAITagsSection';
import { ExternalContact360Panel } from './ExternalContact360Panel';
import { ContactIntelligencePanel } from './ContactIntelligencePanel';
import { WhatsAppStatusSection } from './WhatsAppStatusSection';
import { EvolutionContactProfileSection } from './EvolutionContactProfileSection';
import { CustomFieldsSection } from '@/components/contacts/CustomFieldsSection';
import { PrivateNotes } from '../PrivateNotes';
import { ConversationHistory } from '../ConversationHistory';
import { MediaGallery } from '../MediaGallery';
import { ConversationTasksPanel } from '../ConversationTasksPanel';
import { RemindersPanel } from '../RemindersPanel';
import { ConversationMemoryPanel } from '../ConversationMemoryPanel';
import { LeadRiskScorePanel } from '../LeadRiskScorePanel';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';
import { ConversationTimeline } from '../ConversationTimeline';

import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { log } from '@/lib/logger';
import type { EnrichedContactData, AIConversationTag, SLAInfo } from '@/hooks/crm/useContactEnrichedData';

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.08 * i, duration: 0.3, ease: 'easeOut' as const },
  }),
};

interface ContactAccordionSectionsProps {
  contact: Contact;
  conversation: Conversation;
  enrichedData: EnrichedContactData | null;
  aiTags: AIConversationTag[];
  slaInfo: SLAInfo | null;
  profileId: string | null;
}

export function ContactAccordionSections({ contact, conversation, enrichedData, aiTags, slaInfo, profileId }: ContactAccordionSectionsProps) {
  return (
    <>
      <Section index={0} value="info" icon={<Info className="w-3.5 h-3.5 text-primary" />} label="Informações">
        <ContactInfoSection contact={contact} enrichedData={enrichedData} />
      </Section>

      <Section index={1} value="whatsapp-status" icon={<Smartphone className="w-3.5 h-3.5 text-primary" />} label="Status WhatsApp">
        <WhatsAppStatusSection phone={contact.phone} />
      </Section>

      {isExternalConfigured && (
        <Section index={1.5} value="evolution-profile" icon={<BadgeCheck className="w-3.5 h-3.5 text-primary" />} label="Perfil WhatsApp">
          <EvolutionContactProfileSection phone={contact.phone} fallbackName={contact.name} />
        </Section>
      )}

      {(slaInfo || aiTags.length > 0) && (
        <Section index={1} value="sla-ai" icon={<Brain className="w-3.5 h-3.5 text-primary" />} label="SLA & Inteligência">
          <SLAAndAITagsSection slaInfo={slaInfo} aiTags={aiTags} />
        </Section>
      )}

      {isExternalConfigured && (
        <>
          <Section index={2} value="crm-360" icon={<Sparkles className="w-3.5 h-3.5 text-primary" />} label="CRM 360°">
            <ExternalContact360Panel phone={contact.phone} />
          </Section>
          <Section index={2.5} value="intelligence" icon={<Brain className="w-3.5 h-3.5 text-primary" />} label="Inteligência Comercial">
            <ContactIntelligencePanel phone={contact.phone} />
          </Section>
        </>
      )}

      <Section index={3} value="tags" icon={<Tag className="w-3.5 h-3.5 text-primary" />} label="Tags"
        badge={(contact.tags.length + conversation.tags.length) > 0 ? contact.tags.length + conversation.tags.length : undefined}>
        <TagsContent contact={contact} conversation={conversation} />
      </Section>

      <Section index={4} value="assignment" icon={<User className="w-3.5 h-3.5 text-primary" />} label="Atribuição">
        <AssignmentSection conversation={conversation} />
      </Section>

      <Section index={5.5} value="tasks" icon={<ListTodo className="w-3.5 h-3.5 text-primary" />} label="Tarefas">
        <ConversationTasksPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section index={5.7} value="reminders" icon={<Bell className="w-3.5 h-3.5 text-primary" />} label="Lembretes">
        <RemindersPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section index={5.9} value="memory" icon={<Brain className="w-3.5 h-3.5 text-primary" />} label="Memória Viva">
        <ConversationMemoryPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section index={6} value="scoring" icon={<TrendingUp className="w-3.5 h-3.5 text-primary" />} label="Scoring & LGPD">
        <LeadRiskScorePanel contactId={contact.id} />
      </Section>

      <Section index={6.2} value="purchases" icon={<ShoppingBag className="w-3.5 h-3.5 text-primary" />} label="Compras & Propostas">
        <ContactPurchasesPanel contactId={contact.id} profileId={profileId} />
      </Section>

      <Section index={6} value="notes" icon={<FileText className="w-3.5 h-3.5 text-primary" />} label="Notas Privadas">
        <PrivateNotes contactId={contact.id} />
      </Section>

      <Section index={6.8} value="timeline" icon={<GitBranch className="w-3.5 h-3.5 text-primary" />} label="Linha do Tempo">
        <ConversationTimeline contactId={contact.id} />
      </Section>

      <Section index={7} value="history" icon={<Clock className="w-3.5 h-3.5 text-primary" />} label="Histórico">
        <ConversationHistory contactId={contact.id} contactPhone={contact.phone} onSelectConversation={(id) => log.debug('Selected conversation:', id)} />
      </Section>

      <motion.div custom={8} initial="hidden" animate="visible" variants={sectionVariants}>
        <AccordionItem value="stats" className="border-border/30">
          <AccordionTrigger className="px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:no-underline hover:bg-muted/10">
            <div className="flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5 text-primary" />Estatísticas</div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <ContactStatsSection contactId={contact.id} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="media" className="border-border/30">
          <AccordionTrigger className="px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:no-underline hover:bg-muted/10">
            <div className="flex items-center gap-2"><Image className="w-3.5 h-3.5" />Mídia Compartilhada</div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MediaGallery contactId={contact.id} open={true} onOpenChange={() => {}} />
          </AccordionContent>
        </AccordionItem>
      </motion.div>
    </>
  );
}

// Reusable accordion section wrapper
function Section({ index, value, icon, label, badge, children }: {
  index: number; value: string; icon: React.ReactNode; label: string; badge?: number; children: React.ReactNode;
}) {
  return (
    <motion.div custom={index} initial="hidden" animate="visible" variants={sectionVariants}>
      <AccordionItem value={value} className="border-border/30">
        <AccordionTrigger className="px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:no-underline hover:bg-muted/10">
          <div className="flex items-center gap-2">
            {icon}
            {label}
            {badge !== undefined && (
              <span className="ml-auto text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-semibold">{badge}</span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">{children}</AccordionContent>
      </AccordionItem>
    </motion.div>
  );
}

function TagsContent({ contact, conversation }: { contact: Contact; conversation: Conversation }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {contact.tags.map((tag, i) => (
        <motion.div key={`contact-${tag}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
          <Badge variant="secondary" className="flex items-center gap-1 bg-primary/10 border border-primary/20 text-foreground hover:bg-primary/20 hover:scale-105 transition-all cursor-default group/tag">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />{tag}
            <X className="w-3 h-3 cursor-pointer opacity-0 group-hover/tag:opacity-100 hover:text-destructive transition-all" />
          </Badge>
        </motion.div>
      ))}
      {conversation.tags.map((tag, i) => (
        <motion.div key={`conv-${tag}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (contact.tags.length + i) * 0.03 }}>
          <Badge variant="outline" className="flex items-center gap-1 border-border/30 hover:border-primary/30 hover:scale-105 transition-all cursor-default group/tag">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />{tag}
            <X className="w-3 h-3 cursor-pointer opacity-0 group-hover/tag:opacity-100 hover:text-destructive transition-all" />
          </Badge>
        </motion.div>
      ))}
      {contact.tags.length === 0 && conversation.tags.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 w-full py-4 text-center">
          <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center"><TagsIcon className="w-5 h-5 text-muted-foreground/30" /></div>
          <p className="text-xs text-muted-foreground/60">Nenhuma tag adicionada</p>
        </div>
      )}
      <Button variant="ghost" size="sm" className="h-6 text-xs hover:bg-primary/10 hover:text-primary border border-dashed border-border/40 hover:border-primary/30">
        <Plus className="w-3 h-3 mr-1" />Adicionar
      </Button>
    </div>
  );
}
