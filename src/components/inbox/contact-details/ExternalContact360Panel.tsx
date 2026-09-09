/**
 * ExternalContact360Panel — 360° CRM view of a contact
 */
import { memo } from 'react';
import { useExternalContact360 } from '@/hooks/crm/useExternalContact360';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Building, Globe, Phone, User, MessageSquare, Target, Heart, Star, BarChart3, AlertCircle, Sparkles } from 'lucide-react';
import type { Contact360Data } from '@/types/contact360';
import {
  SectionTitle, InfoRow, RFMBadge, CompanyCard, CustomerProfile,
  ContactDetailCard, StakeholderCard, InteractionsTimeline,
  SocialLinks, AddressLine, ContactChannels, BehaviorRadar,
} from './Contact360Helpers';

interface ExternalContact360PanelProps {
  contactId: string;
}

function ExternalContact360PanelInner({ contactId }: ExternalContact360PanelProps) {
  const { data, isLoading, error } = useExternalContact360(contactId);

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-20" />
        <Skeleton className="h-16" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (error || !data) return null;

  if (!data.found) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/10 rounded-lg p-3">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Contato não encontrado no CRM ({data.searched_phone})</span>
      </div>
    );
  }

  const allSocial = [
    ...(data.contact_social || []),
    ...(data.company_social || []),
  ].filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Visão 360° CRM</span>
        {data.contact?.relationship_score != null && data.contact.relationship_score > 0 && (
          <Badge variant="outline" className="ml-auto text-[10px] bg-primary/10 text-primary border-primary/30">
            Score: {data.contact.relationship_score}
          </Badge>
        )}
      </div>

      {data.contact && <div className="space-y-1.5"><SectionTitle icon={User}>Contato</SectionTitle><ContactDetailCard contact={data.contact} /></div>}
      {(data.contact_phones?.length > 0 || data.contact_emails?.length > 0) && <div className="space-y-1.5"><SectionTitle icon={Phone}>Canais do Contato</SectionTitle><ContactChannels phones={data.contact_phones} emails={data.contact_emails} /></div>}
      {data.company && <div className="space-y-1.5"><SectionTitle icon={Building}>Empresa</SectionTitle><CompanyCard company={data.company} /></div>}
      {data.customer && <div className="space-y-1.5"><SectionTitle icon={Target}>Perfil Comercial</SectionTitle><CustomerProfile customer={data.customer} /></div>}
      {data.stakeholder && <div className="space-y-1.5"><SectionTitle icon={Star}>Stakeholder</SectionTitle><StakeholderCard stakeholder={data.stakeholder} /></div>}
      {data.rfm && data.rfm.segment_code && <div className="space-y-1.5"><SectionTitle icon={BarChart3}>Segmento RFM</SectionTitle><RFMBadge rfm={data.rfm} /></div>}

      {data.contact?.behavior && (
        <div className="space-y-2">
          <SectionTitle icon={Heart}>Perfil Comportamental</SectionTitle>
          <div className="flex items-center gap-3">
            <div className="relative w-24 h-24 shrink-0">
              <BehaviorRadar decisionPower={data.contact.behavior.decisionPower ?? 0} formalityLevel={data.contact.behavior.formalityLevel ?? 0} discProfile={data.contact.behavior.discProfile} />
            </div>
            <div className="flex-1 space-y-1 text-xs">
              <InfoRow label="DISC" value={data.contact.behavior.discProfile} />
              <InfoRow label="Canal" value={data.contact.behavior.preferredChannel} />
              <InfoRow label="Decisão" value={`${data.contact.behavior.decisionPower}/10`} />
              <InfoRow label="Formalidade" value={`${data.contact.behavior.formalityLevel}/5`} />
              <InfoRow label="Suporte" value={`${data.contact.behavior.supportLevel}/5`} />
            </div>
          </div>
          {data.contact.behavior.currentChallenges?.length > 0 && <div className="text-[10px] text-muted-foreground">Desafios: {data.contact.behavior.currentChallenges.join(', ')}</div>}
          {data.contact.behavior.competitorsUsed?.length > 0 && <div className="text-[10px] text-muted-foreground">Concorrentes: {data.contact.behavior.competitorsUsed.join(', ')}</div>}
        </div>
      )}

      {data.contact_interactions && data.contact_interactions.length > 0 && <div className="space-y-1.5"><SectionTitle icon={MessageSquare}>Interações ({data.contact_interactions.length})</SectionTitle><InteractionsTimeline interactions={data.contact_interactions} /></div>}
      {allSocial.length > 0 && <div className="space-y-1.5"><SectionTitle icon={Globe}>Redes Sociais</SectionTitle><SocialLinks social={allSocial} /></div>}
      {data.company_address && <AddressLine address={data.company_address} />}
      {(data.company_phones?.length > 0 || data.company_emails?.length > 0) && <div className="space-y-1.5"><SectionTitle icon={Building}>Canais da Empresa</SectionTitle><ContactChannels phones={data.company_phones} emails={data.company_emails} /></div>}
    </motion.div>
  );
}

export const ExternalContact360Panel = memo(ExternalContact360PanelInner);
