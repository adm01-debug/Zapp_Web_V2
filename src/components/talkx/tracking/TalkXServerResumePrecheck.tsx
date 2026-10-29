/**
 * N-097 (X142) — resultado da pré-checagem de retomada feita no servidor.
 * Mostra `can_resume` e a lista de `blockers`; sem resultado (carregando, sem
 * permissão, erro) não renderiza nada.
 */
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TALKX_RESUME_BLOCKER_LABEL,
  type TalkXResumeBlocker,
  type TalkXServerResumePrecheck,
} from '@/hooks/integrations/useTalkXServerResumePrecheck';

function blockerLabel(code: string, precheck: TalkXServerResumePrecheck): string {
  const base = TALKX_RESUME_BLOCKER_LABEL[code as TalkXResumeBlocker] ?? code;
  return code === 'recipients_suppressed' && precheck.suppressedPendingRecipients > 0
    ? `${base} (${precheck.suppressedPendingRecipients})`
    : base;
}

export function TalkXServerResumePrecheck({
  precheck,
  className,
}: {
  precheck: TalkXServerResumePrecheck | null;
  className?: string;
}) {
  if (!precheck) return null;

  if (precheck.canResume) {
    return (
      <div
        role="status"
        data-testid="talkx-server-precheck"
        className={cn('flex items-center gap-2 rounded-xl border border-dash-green/40 bg-dash-green/10 px-3 py-2 text-xs font-medium text-dash-green', className)}
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        Pré-checagem do servidor: pronta para retomar
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="talkx-server-precheck"
      className={cn('rounded-xl border border-dash-amber/40 bg-dash-amber/10 px-3 py-2 text-xs text-dash-amber', className)}
    >
      <p className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        Pré-checagem do servidor: não é possível retomar agora
      </p>
      <ul className="mt-1 list-disc pl-6">
        {precheck.blockers.map((code) => (
          <li key={code}>{blockerLabel(code, precheck)}</li>
        ))}
      </ul>
    </div>
  );
}
