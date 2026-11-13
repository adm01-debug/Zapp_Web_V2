/**
 * AtendimentoSection — seção recolhível "Atendimento" do painel do contato.
 *
 * Junta três painéis que estavam prontos e saíram como órfãos na #1886
 * (plano Sidebar 3 seções, D6), agora ligados no layout atual como mais uma
 * `SidebarSection` (começa recolhida; o conteúdo só monta — e só busca dado —
 * quando o atendente abre):
 *  - SLA da 1ª resposta (`conversation_sla`);
 *  - Score e LGPD (lead/risk score, origem do lead e consentimento em `contacts`);
 *  - Perfil do WhatsApp (`evolution_contacts`, via `external-db-proxy`).
 */
import type { ReactNode } from 'react';
import { Headset, MessageCircle, Shield, TrendingUp } from 'lucide-react';
import { SidebarSection } from './sidebar/SidebarSection';
import { ContactFirstResponseSLA } from './ContactFirstResponseSLA';
import { LeadRiskScorePanel } from './LeadRiskScorePanel';
import { EvolutionContactProfileSection } from './EvolutionContactProfileSection';

interface AtendimentoSectionProps {
  contactId: string;
  phone: string;
  name?: string;
  index?: number;
}

function Block({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="space-y-1.5">
      <h5 className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wide [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-primary">
        {icon}
        {label}
      </h5>
      {children}
    </section>
  );
}

export function AtendimentoSection({ contactId, phone, name, index = 6 }: AtendimentoSectionProps) {
  return (
    <SidebarSection
      index={index}
      value="atendimento"
      tone="blue"
      icon={<Headset />}
      title="Atendimento"
      subtitle="SLA da 1ª resposta, score e LGPD, perfil do WhatsApp"
    >
      <div className="space-y-4">
        <Block icon={<Shield aria-hidden="true" />} label="SLA da 1ª resposta">
          <ContactFirstResponseSLA contactId={contactId} />
        </Block>
        <Block icon={<TrendingUp aria-hidden="true" />} label="Score e LGPD">
          <LeadRiskScorePanel contactId={contactId} />
        </Block>
        <Block icon={<MessageCircle aria-hidden="true" />} label="Perfil do WhatsApp">
          <EvolutionContactProfileSection phone={phone} fallbackName={name} />
        </Block>
      </div>
    </SidebarSection>
  );
}
