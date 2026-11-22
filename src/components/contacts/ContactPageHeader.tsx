import { Database, ContactRound, UserPlus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContactSource } from '@/hooks/contacts/useContactSource';

interface ContactPageHeaderProps {
  onAddContact: () => void;
  onOpenCRM: () => void;
  crmIntegrationEnabled: boolean;
}

/**
 * ZD-012/ZD-014/ZD-015/ZD-016 — cabeçalho do módulo Contatos no visual do design.
 *
 * Replica o `zc-pagehead`: tile com ícone, título em font-display, subtítulo,
 * selo "Origem dos dados" (estado real do Singu) e ações (Novo contato, CRM 360°).
 * Zero cor literal: tudo por token `--contacts-*`.
 */
export function ContactPageHeader({
  onAddContact, onOpenCRM, crmIntegrationEnabled,
}: ContactPageHeaderProps) {
  const source = useContactSource();

  return (
    <header className="flex items-center justify-between gap-4 rounded-[12px] border border-[hsl(var(--contacts-line))] p-[14px_17px] mb-[14px]"
      style={{ background: 'linear-gradient(140deg, hsl(var(--contacts-panel)), hsl(var(--contacts-page)))', boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.02)' }}
    >
      <div className="flex items-center gap-[13px] min-w-0">
        <span className="grid place-items-center w-[43px] h-[44px] shrink-0 rounded-[11px] text-white"
          style={{ background: 'linear-gradient(140deg, hsl(var(--contacts-blue)) 0%, hsl(var(--contacts-blue)) 55%, hsl(221 83% 32%))', border: '1px solid hsl(221 83% 70% / 0.32)', boxShadow: 'inset 0 1px 0 hsl(221 83% 90% / 0.25), 0 4px 16px hsl(221 83% 53% / 0.12)' }}
        >
          <ContactRound className="w-[23px] h-[23px]" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[29px] font-medium leading-[1.12] tracking-[-0.6px] m-0 text-foreground">Contatos</h1>
          <p className="text-xs text-muted-foreground m-0 hidden md:block">Pessoas e empresas em uma visão completa.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="flex items-center gap-2 px-[10px] py-2 rounded-lg border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] text-[11px] whitespace-nowrap">
          <Database className="w-[15px] h-[15px] text-[hsl(var(--contacts-blue))]" />
          <span className="grid gap-[1px]">
            <small className="text-[11px] text-[hsl(var(--contacts-quiet))]">Origem dos dados</small>
            <strong className="text-xs font-medium text-foreground">{source.label}</strong>
          </span>
        </span>

        <Button
          onClick={onAddContact}
          className="h-10 rounded-lg text-sm font-medium gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="w-[18px] h-[18px]" />
          Novo contato
        </Button>

        {crmIntegrationEnabled && (
          <Button
            onClick={onOpenCRM}
            className="h-10 rounded-lg text-sm font-medium gap-2 bg-primary/20 border border-primary/50 text-[hsl(var(--primary-text))] hover:bg-primary/30"
          >
            <Sparkles className="w-[18px] h-[18px]" />
            CRM 360°
          </Button>
        )}
      </div>
    </header>
  );
}
