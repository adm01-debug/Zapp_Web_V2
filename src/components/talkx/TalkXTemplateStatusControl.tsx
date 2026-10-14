/**
 * X090 — controle de STATUS do template (aprovação), um só para o cartão, a
 * lista e o editor. Substitui o `<Select>` livre de status (`EDT:397`), que
 * deixava qualquer pessoa marcar "Aprovado" sem passar por revisão.
 *
 * Regra do plano, com o papel de quem está logado (`useUserRole`):
 *  - autor (sem admin/supervisor): vê "Enviar para revisão" enquanto o template
 *    está em rascunho;
 *  - admin/supervisor: vê "Aprovar" e "Devolver".
 *
 * A tela mostra o SELO do status. "Quem aprovou e quando" não é mostrado porque
 * `approved_by`/`approved_at` (CAP-078) ainda não existem no banco — em vez de
 * inventar autor/data, mostra só o estado.
 */
import React from 'react';
import { Check, Undo2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { TEMPLATE_STATUS } from './talkxShared';
import { useTalkXTemplateActions, type TalkXTemplateStatus } from '@/hooks/integrations/useTalkXTemplateActions';
import type { TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';

const BUTTON = 'h-7 px-2.5 rounded-lg border text-2xs font-semibold inline-flex items-center gap-1 disabled:opacity-50';

interface Props {
  template: TalkXTemplate;
  /** Compacto (cartão/lista) ou com rótulo (cabeçalho do editor). */
  size?: 'sm' | 'md';
  /**
   * Chamado depois de a transição confirmar — o editor usa para o campo de
   * status não voltar ao valor antigo no próximo "Salvar template".
   */
  onChanged?: (status: TalkXTemplateStatus) => void;
  className?: string;
}

export function TalkXTemplateStatusControl({ template, onChanged, className }: Props) {
  const { canApprove, setStatus, busy } = useTalkXTemplateActions();
  const meta = TEMPLATE_STATUS[template.status] ?? TEMPLATE_STATUS.draft;

  // A falha já vira toast dentro da mutation (`updateTemplate.onError`); o catch
  // aqui existe só para não deixar a promessa rejeitada solta.
  const apply = (next: TalkXTemplateStatus) => {
    void setStatus(template, next)
      .then(() => onChanged?.(next))
      .catch(() => { /* avisado no toast da mutation */ });
  };

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      <Pill label={meta.label} tone={meta.tone} dot />
      {canApprove ? (
        <>
          {template.status !== 'approved' && (
            <button type="button" disabled={busy} onClick={() => apply('approved')} className={cn(BUTTON, 'border-dash-green/40 bg-dash-green/10 text-dash-green hover:bg-dash-green/20')}>
              <Check className="w-3 h-3" /> Aprovar
            </button>
          )}
          {template.status !== 'draft' && (
            <button type="button" disabled={busy} onClick={() => apply('draft')} className={cn(BUTTON, 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>
              <Undo2 className="w-3 h-3" /> Devolver
            </button>
          )}
        </>
      ) : (
        template.status === 'draft' && (
          <button type="button" disabled={busy} onClick={() => apply('review')} className={cn(BUTTON, 'border-dash-amber/40 bg-dash-amber/10 text-dash-amber hover:bg-dash-amber/20')}>
            <Send className="w-3 h-3" /> Enviar para revisão
          </button>
        )
      )}
    </div>
  );
}
