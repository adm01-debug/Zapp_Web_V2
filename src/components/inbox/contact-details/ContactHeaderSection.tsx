import { useState, lazy, Suspense } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building, Briefcase, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';
import { ImagePreview } from '../ImagePreview';
import { useExternalContact360 } from '@/hooks/crm/useExternalContact360';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import type { Conversation } from '@/types/chat';
import { CompactContactHeader } from './CompactContactHeader';
import { ContactActionButtons } from './ContactActionButtons';

const channelIcons: Record<string, string> = {
  whatsapp: '💬', instagram: '📸', facebook: '📘', telegram: '✈️',
  email: '📧', sms: '📱', webchat: '🌐',
};

const sentimentConfig: Record<string, { label: string; color: string; emoji: string }> = {
  positive: { label: 'Positivo', color: 'bg-success/15 text-success border-success/30', emoji: '😊' },
  neutral: { label: 'Neutro', color: 'bg-muted/30 text-muted-foreground border-border/30', emoji: '😐' },
  negative: { label: 'Negativo', color: 'bg-warning/15 text-warning border-warning/30', emoji: '😟' },
  critical: { label: 'Crítico', color: 'bg-destructive/15 text-destructive border-destructive/30', emoji: '🔴' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  medium: { label: 'Média', color: 'bg-warning/15 text-warning border-warning/30' },
  low: { label: 'Baixa', color: 'bg-success/15 text-success border-success/30' },
};

const contactTypeConfig: Record<string, { label: string; color: string }> = {
  customer: { label: 'Cliente', color: 'bg-primary/15 text-primary border-primary/30' },
  cliente: { label: 'Cliente', color: 'bg-primary/15 text-primary border-primary/30' },
  lead: { label: 'Lead', color: 'bg-info/15 text-info border-info/30' },
  employee: { label: 'Colaborador', color: 'bg-success/15 text-success border-success/30' },
  colaborador: { label: 'Colaborador', color: 'bg-success/15 text-success border-success/30' },
  supplier: { label: 'Fornecedor', color: 'bg-warning/15 text-warning border-warning/30' },
  fornecedor: { label: 'Fornecedor', color: 'bg-warning/15 text-warning border-warning/30' },
};

interface ContactHeaderSectionProps {
  contact: { id: string; name: string; phone: string; avatar?: string; email?: string };
  enrichedData: EnrichedContactData | null | undefined;
  conversation?: Conversation;
  onQuickAction?: (action: string) => void;
  isCompact?: boolean;
  hasExpandedSections?: boolean;
  onCollapseAll?: () => void;
}

const CallDialog = lazy(() => import('@/components/calls/CallDialog').then(m => ({ default: m.CallDialog })));

export function ContactHeaderSection({ contact, enrichedData, conversation, onQuickAction, isCompact = false, hasExpandedSections = false, onCollapseAll }: ContactHeaderSectionProps) {
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);

  const { data: crmData } = useExternalContact360(isExternalConfigured ? contact.phone : undefined);
  const crmContact = crmData?.found ? crmData.contact : null;
  const crmCompany = crmData?.found ? crmData.company : null;
  const isVip = crmContact ? crmContact.relationship_score >= 70 : false;
  const nomeTratamento = crmContact?.nome_tratamento || crmContact?.apelido;
  const firstName = contact.name.split(' ')[0];
  const companyName = crmCompany?.nome_fantasia ?? enrichedData?.company;

  const channelEmoji = enrichedData?.channel_type ? channelIcons[enrichedData.channel_type] || '💬' : null;
  const sentiment = enrichedData?.ai_sentiment;
  const priority = enrichedData?.ai_priority;
  const contactType = enrichedData?.contact_type;

  const engagementScore = (() => {
    let s = 50;
    if (sentiment === 'positive') s += 25;
    if (priority === 'high') s += 15;
    if (enrichedData?.company) s += 5;
    if (contactType === 'customer') s += 5;
    return Math.min(s, 100);
  })();

  const getScoreColor = (s: number) => s >= 80 ? 'hsl(var(--success))' : s >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';

  if (isCompact) {
    return <CompactContactHeader contact={contact} isVip={isVip} companyName={companyName ?? undefined} firstName={firstName} />;
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="p-4 flex flex-col items-center text-center border-b border-border">
        {/* Avatar with engagement ring */}
        <div className="relative mb-3">
          <div className="relative inline-block">
            <svg className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] -rotate-90" viewBox="0 0 108 108">
              <circle cx="54" cy="54" r="50" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" opacity="0.3" />
              <motion.circle cx="54" cy="54" r="50" fill="none" stroke={getScoreColor(engagementScore)} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 50} initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
                animate={{ strokeDashoffset: ((100 - engagementScore) / 100) * 2 * Math.PI * 50 }} transition={{ duration: 1, ease: 'easeOut' }} />
            </svg>
            <Avatar className="w-24 h-24 ring-2 ring-background cursor-pointer hover:ring-primary/50 transition-all"
              onClick={() => contact.avatar && setShowAvatarPreview(true)}>
              <AvatarImage src={contact.avatar} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-background"
                    style={{ backgroundColor: getScoreColor(engagementScore), color: 'white' }}>
                    {engagementScore}
                  </div>
                </TooltipTrigger>
                <TooltipContent>Engajamento: {engagementScore >= 80 ? 'Alto' : engagementScore >= 50 ? 'Médio' : 'Baixo'} ({engagementScore}/100)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {channelEmoji && <span className="absolute -bottom-1 -right-1 text-lg bg-card rounded-full p-0.5 ring-2 ring-background">{channelEmoji}</span>}
            {crmCompany?.logo_url && (
              <img src={crmCompany.logo_url} alt={crmCompany.nome_fantasia || ''}
                className="absolute -top-1 -left-1 w-8 h-8 rounded-md object-contain bg-background border border-border/30 ring-2 ring-background" />
            )}
          </div>
        </div>

        <h4 className="font-semibold text-lg text-foreground leading-tight">{firstName}</h4>
        {companyName && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building className="w-3 h-3" />{companyName}</p>}
        {nomeTratamento && <p className="text-[10px] text-primary/70 italic mt-0.5">"{nomeTratamento}"</p>}
        {enrichedData?.job_title && <p className={`text-${companyName ? '[10px]' : 'xs'} text-muted-foreground ${!companyName ? 'flex items-center gap-1' : ''} mt-0.5`}>
          {!companyName && <Briefcase className="w-3 h-3" />}{enrichedData.job_title}
        </p>}
        <p className="text-xs text-muted-foreground mt-0.5 font-mono tracking-tight">{contact.phone}</p>

        {/* Badges */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
          {contactType && contactTypeConfig[contactType] && (
            <Badge variant="outline" className={`text-[10px] font-medium h-5 px-2 ${contactTypeConfig[contactType].color}`}>{contactTypeConfig[contactType].label}</Badge>
          )}
          {isVip && (
            <Badge variant="outline" className="text-[10px] font-medium h-5 px-2 bg-warning/15 text-warning border-warning/30"><Crown className="w-3 h-3 mr-0.5" />VIP</Badge>
          )}
          {sentiment && sentimentConfig[sentiment] && (
            <Badge variant="outline" className={`text-[10px] font-medium h-5 px-2 ${sentimentConfig[sentiment].color}`}>
              <span className="mr-0.5">{sentimentConfig[sentiment].emoji}</span>{sentimentConfig[sentiment].label}
            </Badge>
          )}
          {priority && priorityConfig[priority] && (
            <Badge variant="outline" className={`text-[10px] font-medium h-5 px-2 ${priorityConfig[priority].color}`}>{priorityConfig[priority].label}</Badge>
          )}
        </div>

        <ContactActionButtons
          contact={contact} conversation={conversation}
          hasExpandedSections={hasExpandedSections} onCollapseAll={onCollapseAll}
          onQuickAction={onQuickAction}
          onStartCall={(type) => setShowCallDialog(true)}
        />
      </motion.div>

      {showCallDialog && (
        <Suspense fallback={null}>
          <CallDialog open={showCallDialog} onOpenChange={setShowCallDialog}
            contact={{ id: contact.id, name: contact.name, phone: contact.phone, avatar: contact.avatar }}
            direction="outbound" onEnd={() => setShowCallDialog(false)} />
        </Suspense>
      )}
      {showAvatarPreview && contact.avatar && (
        <ImagePreview src={contact.avatar} alt={contact.name} onClose={() => setShowAvatarPreview(false)} />
      )}
    </>
  );
}
