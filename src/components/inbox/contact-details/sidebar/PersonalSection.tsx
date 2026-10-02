import { Cake, Facebook, Instagram, Linkedin, Twitter, User } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarSection } from './SidebarSection';
import { SidebarRow } from './SidebarRow';
import { SidebarEmpty } from './SidebarEmpty';
import { formatBirthday } from '@/lib/formatters';
import { isSafeHttpUrl } from '@/lib/urlSafety';
import type { ContactSidebarData, ContactSidebarStatus, SidebarSocial } from '@/types/contactSidebar';

interface PersonalSectionProps {
  index: number;
  status: ContactSidebarStatus;
  data?: ContactSidebarData | null;
  onBuscarCRM: () => void;
}

const SOCIAL_ORDER: Array<{ plataforma: string; field: string; label: string; icon: React.ReactNode; atPrefix: boolean }> = [
  { plataforma: 'instagram', field: 'instagram', label: 'Instagram', icon: <Instagram />, atPrefix: true },
  { plataforma: 'linkedin', field: 'linkedin', label: 'LinkedIn', icon: <Linkedin />, atPrefix: false },
  { plataforma: 'facebook', field: 'facebook', label: 'Facebook', icon: <Facebook />, atPrefix: false },
  { plataforma: 'x', field: 'x', label: 'X (Twitter)', icon: <Twitter />, atPrefix: true },
];

function socialValue(entry: SidebarSocial | undefined, atPrefix: boolean): string | null {
  if (!entry) return null;
  if (entry.handle?.trim()) return atPrefix ? `@${entry.handle.replace(/^@/, '')}` : entry.handle;
  if (entry.url && isSafeHttpUrl(entry.url)) {
    try {
      const path = new URL(entry.url).pathname.replace(/\/+$/, '');
      return path && path !== '/' ? (atPrefix ? `@${path.split('/').pop()}` : path) : null;
    } catch { return null; }
  }
  return null;
}

/**
 * Seção 2 — Dados Pessoais: Instagram, LinkedIn, Facebook, X e data de
 * nascimento (etapas 61–67). Sem rede → "—" sem ação (D5). Aniversário no
 * mês corrente mostra o ícone Cake em warning.
 */
export function PersonalSection({ index, status, data, onBuscarCRM }: PersonalSectionProps) {
  const personal = status === 'ok' ? (data?.personal ?? null) : null;

  const birthday = formatBirthday(personal?.data_nascimento);
  const birthdayMonth = (() => {
    if (!personal?.data_nascimento || birthday.age === null && birthday.label === null) return false;
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(personal.data_nascimento.trim());
    if (!m) return false;
    return new Date().getMonth() === Number(m[2]) - 1;
  })();

  const notLinked = status === 'not_found';
  const disabled = status === 'disabled';

  return (
    <SidebarSection index={index} value="personal" tone="purple" icon={<User />} title="Dados Pessoais" subtitle="Conecte-se nas redes e saiba mais sobre a pessoa">
      {status === 'loading' ? (
        <div className="space-y-2" data-testid="sidebar-personal-loading">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
      ) : (
        <>
          <div className="space-y-1">
            {SOCIAL_ORDER.map(({ plataforma, field, label, icon, atPrefix }) => {
              const entry = personal?.social.find((s) => s.plataforma === plataforma);
              return (
                <SidebarRow
                  key={plataforma} icon={icon} label={label} field={field}
                  value={socialValue(entry, atPrefix)}
                  href={entry?.url && isSafeHttpUrl(entry.url) ? entry.url : null}
                />
              );
            })}
            <SidebarRow
              icon={<Cake />} label="Data de nascimento" field="birthday" copyable
              value={birthday.label}
              valueNode={birthday.label ? (
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{birthday.label}</span>
                  {birthday.age !== null && (
                    <span className="text-muted-foreground shrink-0">{birthday.age} anos</span>
                  )}
                  {birthdayMonth && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Cake className="w-3.5 h-3.5 text-warning shrink-0" aria-label="Aniversário este mês" />
                        </TooltipTrigger>
                        <TooltipContent>Aniversário este mês</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </span>
              ) : undefined}
            />
          </div>
          {notLinked && (
            <SidebarEmpty cause="not-found" message="Contato não vinculado ao Singu" cta={{ label: 'Buscar no CRM', onClick: onBuscarCRM }} />
          )}
          {disabled && (
            <SidebarEmpty cause="disabled" message="Integração com o Singu desligada" />
          )}
        </>
      )}
    </SidebarSection>
  );
}
