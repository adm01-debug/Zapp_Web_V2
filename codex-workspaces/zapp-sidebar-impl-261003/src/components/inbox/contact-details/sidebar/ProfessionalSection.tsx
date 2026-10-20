import { BadgeCheck, Briefcase, Building2, Mail, MessageCircle, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CompanyLogo } from '@/components/contacts/CompanyLogo';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarSection } from './SidebarSection';
import { SidebarRow } from './SidebarRow';
import { SidebarEmpty } from './SidebarEmpty';
import { buildProfessionalFallback } from './professionalFallback';
import { cleanPhone, formatBrazilianPhone } from '@/lib/formatters';
import { normalizeE164BR } from '@/lib/calls/phone';
import type { ContactSidebarData, ContactSidebarStatus } from '@/types/contactSidebar';
import type { ConversationContact as Contact } from '@/types/chat';
import type { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';

interface ProfessionalSectionProps {
  index: number;
  status: ContactSidebarStatus;
  data?: ContactSidebarData | null;
  contact: Contact;
  enrichedData?: EnrichedContactData | null;
  onQuickAction: (action: string) => void;
  onBuscarCRM: () => void;
}

/**
 * Seção 1 — Dados Profissionais: WhatsApp, e-mail corporativo, empresa,
 * departamento e cargo (etapas 52–60). Fonte: `professional` da RPC quando
 * `status:'ok'`; senão fallback local do Zapp (tooltip "Dado local do Zapp").
 * Vazio em fallback vira link "Adicionar" que abre o diálogo de edição (D4).
 */
export function ProfessionalSection({ index, status, data, contact, enrichedData, onQuickAction, onBuscarCRM }: ProfessionalSectionProps) {
  const fromRpc = status === 'ok' ? (data?.professional ?? null) : null;
  const fallback = fromRpc ? null : buildProfessionalFallback(contact, enrichedData);
  const fallbackMode = fromRpc === null;

  const whatsappRaw = fromRpc
    ? (fromRpc.whatsapp?.numero_e164 ?? fromRpc.whatsapp?.numero ?? null)
    : (fallback?.whatsapp ?? null);
  // E.164 normalizado (BR nacional ganha +55, tronco 0 e 9º dígito tratados);
  // números não-BR que `normalizeE164BR` não resolve mantêm os dígitos crus.
  const whatsappE164 = whatsappRaw ? normalizeE164BR(whatsappRaw) : null;
  const whatsappDigits = whatsappE164 ? whatsappE164.slice(1) : (whatsappRaw ? cleanPhone(whatsappRaw) : '');
  const whatsappDisplay = whatsappRaw ? formatBrazilianPhone(whatsappRaw) : null;
  const whatsappHref = whatsappDigits ? `https://wa.me/${whatsappDigits}` : null;

  const email = fromRpc ? (fromRpc.email_corporativo?.email ?? null) : (fallback?.email ?? null);
  const emailVerified = fromRpc ? fromRpc.email_corporativo?.is_verified === true : false;

  const empresaNome = fromRpc ? (fromRpc.empresa?.nome ?? null) : (fallback?.empresa ?? null);
  const empresaLogo = fromRpc ? (fromRpc.empresa?.logo_url ?? null) : null;

  const departamento = fromRpc ? (fromRpc.departamento ?? null) : (fallback?.departamento ?? null);
  const cargo = fromRpc ? (fromRpc.cargo ?? null) : (fallback?.cargo ?? null);

  const add = () => onQuickAction('edit');

  return (
    <SidebarSection index={index} value="professional" tone="blue" icon={<Briefcase />} title="Dados Profissionais" subtitle="Informações da sua vida profissional">
      {status === 'loading' ? (
        <div className="space-y-2" data-testid="sidebar-professional-loading">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
      ) : (
        <>
          <div className="space-y-1">
            <SidebarRow
              icon={<MessageCircle />} label="WhatsApp" field="whatsapp"
              value={whatsappDisplay} copyable copyValue={whatsappDigits ? `+${whatsappDigits}` : null}
              href={whatsappHref} local={fallbackMode && whatsappDisplay !== null}
              onAdd={fallbackMode ? add : undefined}
            />
            <SidebarRow
              icon={<Mail />} label="E-mail corporativo" field="email"
              value={email} copyable href={email ? `mailto:${email}` : null}
              local={fallbackMode && email !== null} onAdd={fallbackMode ? add : undefined}
              valueNode={email ? (
                <span className="flex items-center gap-1 min-w-0">
                  <span className="truncate">{email}</span>
                  {emailVerified && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <BadgeCheck className="w-3 h-3 text-kpi-blue-fg shrink-0" aria-label="Verificado no Singu" />
                        </TooltipTrigger>
                        <TooltipContent>Verificado no Singu</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </span>
              ) : undefined}
            />
            <SidebarRow
              icon={<Building2 />} label="Empresa" field="company"
              value={empresaNome} copyable
              local={fallbackMode && empresaNome !== null} onAdd={fallbackMode ? add : undefined}
              valueNode={empresaNome ? (
                <span className="flex items-center gap-1.5 min-w-0">
                  <CompanyLogo logoUrl={empresaLogo} companyName={empresaNome} size="xs" />
                  <span className="truncate">{empresaNome}</span>
                </span>
              ) : undefined}
            />
            <SidebarRow
              icon={<Users />} label="Departamento" field="department"
              value={departamento} copyable
              // Sem `onAdd`: `EditContactDialog` não tem campo de departamento.
              local={fallbackMode && departamento !== null}
            />
            <SidebarRow
              icon={<BadgeCheck />} label="Cargo" field="job_title"
              value={cargo} copyable
              local={fallbackMode && cargo !== null} onAdd={fallbackMode ? add : undefined}
            />
          </div>
          {status === 'not_found' && (
            <SidebarEmpty
              cause="not-found"
              message="Contato não vinculado ao Singu"
              cta={{ label: 'Buscar no CRM', onClick: onBuscarCRM }}
            />
          )}
        </>
      )}
    </SidebarSection>
  );
}
