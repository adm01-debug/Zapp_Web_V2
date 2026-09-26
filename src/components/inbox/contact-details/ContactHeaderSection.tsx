import { useState, lazy, Suspense } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Briefcase, Crown, Star, Calendar } from 'lucide-react';
import { CompanyLogo } from '@/components/contacts/CompanyLogo';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';
import { ImagePreview } from '../ImagePreview';
import { useExternalContact360 } from '@/hooks/crm/useExternalContact360';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import type { Conversation } from '@/types/chat';
import { CompactContactHeader } from './CompactContactHeader';
import { ContactActionButtons } from './ContactActionButtons';
import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta prioridade', color: 'bg-destructive/15 text-destructive border-destructive/40' },
};

// Labels vêm do config canônico (src/components/contacts/contactTypeConfig.tsx); cores usam
// tokens carvão em vez do badgeClass daquele arquivo (que embute cor literal inline).
const contactTypeColor: Record<string, string> = {
  cliente: 'bg-primary/15 text-primary border-primary/40',
  customer: 'bg-primary/15 text-primary border-primary/40',
  fornecedor: 'bg-warning/15 text-warning border-warning/40',
  supplier: 'bg-warning/15 text-warning border-warning/40',
  colaborador: 'bg-success/15 text-success border-success/40',
  employee: 'bg-success/15 text-success border-success/40',
  lead: 'bg-info/15 text-info border-info/40',
};
const contactTypeLabel: Record<string, string> = { customer: 'Cliente', employee: 'Colaborador', supplier: 'Fornecedor' };
const getContactTypeBadge = (type: string) => ({
  label: CONTACT_TYPE_CONFIG[type]?.label ?? contactTypeLabel[type] ?? type,
  color: contactTypeColor[type] ?? 'bg-muted text-foreground border-transparent',
});

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
  const crmIntegrationEnabled = useCRMIntegrationEnabled();

  const { isFavorite, favoriteContact, unfavoriteContact } = useConversationActions();
  const isFav = isFavorite(contact.id);
  const toggleFavorite = () => { if (isFav) { unfavoriteContact(contact.id); } else { favoriteContact(contact.id); } };

  const { data: crmData } = useExternalContact360(crmIntegrationEnabled ? contact.id : undefined);
  const crmContact = crmData?.found ? crmData.contact : null;
  const crmCompany = crmData?.found ? crmData.company : null;
  const isVip = crmContact ? crmContact.relationship_score >= 70 : false;
  const firstName = contact.name.split(' ')[0];
  // Mesmo apelido (contacts.nickname) que a lista de conversas usa como nome
  // exibido (VirtualizedRealtimeList) — sem isso o mesmo contato mostrava um
  // nome na lista e outro aqui no painel de detalhes, lado a lado na mesma tela.
  const displayName = enrichedData?.nickname?.trim() || firstName;
  const nomeTratamentoRaw = crmContact?.nome_tratamento || crmContact?.apelido;
  // Não repete a legenda quando ela é igual ao nome já exibido no título
  // (comum: quem cadastra o apelido local copia o que o CRM já mostrava).
  const nomeTratamento =
    nomeTratamentoRaw && nomeTratamentoRaw.trim().toLowerCase() !== displayName.trim().toLowerCase()
      ? nomeTratamentoRaw
      : null;
  const companyName = crmCompany?.nome_fantasia ?? enrichedData?.company;

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
    return <CompactContactHeader contact={contact} isVip={isVip} companyName={companyName ?? undefined} firstName={displayName} />;
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="p-4 border-b border-border">
        <div className="flex items-start gap-3">
          {/* Avatar with engagement ring */}
          <div className="relative shrink-0">
            <div className="relative inline-block">
              <svg className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] -rotate-90" viewBox="0 0 108 108">
                <circle cx="54" cy="54" r="50" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" opacity="0.3" />
                <motion.circle cx="54" cy="54" r="50" fill="none" stroke={getScoreColor(engagementScore)} strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50} initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
                  animate={{ strokeDashoffset: ((100 - engagementScore) / 100) * 2 * Math.PI * 50 }} transition={{ duration: 1, ease: 'easeOut' }} />
              </svg>
              <Avatar data-testid="contact-avatar" className="w-[72px] h-[72px] ring-2 ring-background cursor-pointer hover:ring-primary/50 transition-all"
                onClick={() => contact.avatar && setShowAvatarPreview(true)}>
                <AvatarImage src={contact.avatar} alt={contact.name || 'Avatar'} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                  {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full flex items-center justify-center text-3xs font-bold ring-2 ring-background"
                      style={{ backgroundColor: getScoreColor(engagementScore), color: 'white' }}>
                      {engagementScore}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Engajamento: {engagementScore >= 80 ? 'Alto' : engagementScore >= 50 ? 'Médio' : 'Baixo'} ({engagementScore}/100)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {crmCompany?.logo_url && (
                <img src={crmCompany.logo_url} alt={crmCompany.nome_fantasia || ''}
                  className="absolute -top-1 -left-1 w-8 h-8 rounded-md object-contain bg-background border border-border/30 ring-2 ring-background" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="font-bold text-lg text-foreground leading-tight truncate">{displayName}</h4>
              <button type="button" onClick={toggleFavorite} data-testid="contact-favorite-toggle"
                aria-label={isFav ? 'Remover dos favoritos' : 'Favoritar contato'} className="shrink-0 -m-1 p-1">
                <Star className={cn('w-4 h-4 transition-colors', isFav ? 'fill-warning text-warning' : 'text-muted-foreground hover:text-warning')} />
              </button>
            </div>

            {companyName && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <CompanyLogo logoUrl={crmCompany?.logo_url} companyName={crmCompany?.nome_fantasia} fallbackCompanyName={companyName} size="sm" className="rounded-full" />
                <span className="truncate min-w-0 flex-1">{companyName}</span>
              </div>
            )}
            {nomeTratamento && <p className="text-3xs text-primary/70 italic mt-0.5 truncate">"{nomeTratamento}"</p>}
            {enrichedData?.job_title && (
              <p className={companyName
                ? 'text-3xs text-muted-foreground truncate mt-0.5'
                : 'text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5'}>
                {!companyName && <Briefcase className="w-3 h-3 shrink-0" />}{enrichedData.job_title}
              </p>
            )}

            {conversation?.updatedAt && (
              <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-1">
                <Calendar className="w-3.5 h-3.5 shrink-0" />Último contato em {format(conversation.updatedAt, "d MMM yyyy", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>

        {/* Chips do contato */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {contactType && (
            <Badge variant="outline" className={`h-6 px-2.5 rounded-full text-xs font-semibold ${getContactTypeBadge(contactType).color}`}>
              {getContactTypeBadge(contactType).label}
            </Badge>
          )}
          {isVip && (
            <Badge variant="outline" className="h-6 px-2.5 rounded-full text-xs font-semibold bg-warning/15 text-warning border-warning/40">
              <Crown className="w-3 h-3 mr-1" />VIP
            </Badge>
          )}
          {priority === 'high' && (
            <Badge variant="outline" className={`h-6 px-2.5 rounded-full text-xs font-semibold ${priorityConfig.high.color}`}>{priorityConfig.high.label}</Badge>
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
