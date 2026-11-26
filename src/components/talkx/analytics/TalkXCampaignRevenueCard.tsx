import React, { useId, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { IconTile, TalkXErrorState } from '../talkxShared';
import {
  parseInvestmentInput,
  useTalkXCampaignRevenue,
  type TalkXCampaignRevenueNumbers,
} from '@/hooks/integrations/useTalkXCampaignRevenue';
import { useCRMAdminAccess } from '@/hooks/crm/useCRMAdminAccess';

/**
 * X041 — bloco "Retorno" do painel de campanha (Analytics).
 *
 * O servidor manda conversões, receita e ROI (`talkx_campaign_revenue`); o
 * investimento é editável porque é a única entrada que o banco não deduz — sem
 * ele o ROI fica indefinido, então a tela explica em vez de mostrar 0%.
 */

function fmtRoi(roiPercent: number | null): string {
  if (roiPercent === null) return '—';
  const rounded = Math.round(roiPercent * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export interface TalkXCampaignRevenueCardProps {
  data: TalkXCampaignRevenueNumbers;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  canEditInvestment?: boolean;
  isSavingInvestment?: boolean;
  investmentError?: string | null;
  onSaveInvestment?: (value: number) => Promise<boolean>;
}

export function TalkXCampaignRevenueCard({
  data,
  isLoading = false,
  isError = false,
  onRetry,
  canEditInvestment = false,
  isSavingInvestment = false,
  investmentError = null,
  onSaveInvestment,
}: TalkXCampaignRevenueCardProps) {
  const inputId = useId();
  const hintId = useId();
  // Rascunho do usuário. `null` = campo mostra o valor do banco: assim a troca
  // de campanha (ou um refetch) nunca fica presa a um texto antigo, sem efeito
  // de sincronização.
  const [draftDoUsuario, setDraftDoUsuario] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const draft = draftDoUsuario ?? (data.investment === null ? '' : String(data.investment));

  const parsedDraft = draft.trim() === '' ? null : parseInvestmentInput(draft);
  const draftInvalido = draft.trim() !== '' && parsedDraft === null;
  const semMudanca = parsedDraft === null
    ? data.investment === null
    : data.investment !== null && Math.abs(parsedDraft - data.investment) < 0.005;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveInvestment || parsedDraft === null || draftInvalido) return;
    const ok = await onSaveInvestment(parsedDraft);
    if (ok) {
      setJustSaved(true);
      setDraftDoUsuario(String(parsedDraft));
    }
  };

  const tiles: { label: string; value: string; tone: string; hint?: string }[] = [
    {
      label: 'Conversões',
      value: data.conversions.toLocaleString('pt-BR'),
      tone: 'text-primary',
      hint: 'Negócios ganhos atribuídos a esta campanha.',
    },
    {
      label: 'Receita atribuída',
      value: formatBRL(data.revenue),
      tone: 'text-dash-green',
      hint: 'Soma das conversões registradas nesta campanha.',
    },
    {
      label: 'ROI',
      value: fmtRoi(data.roiPercent),
      tone: data.roiPercent !== null && data.roiPercent < 0 ? 'text-dash-red' : 'text-dash-green',
      hint: 'Receita menos investimento, sobre o investimento.',
    },
  ];

  return (
    <section
      data-testid="talkx-campaign-revenue"
      aria-label="Retorno da campanha"
      className="rounded-xl border border-border/60 bg-input/20 p-3"
    >
      <div className="flex items-center gap-2 mb-3">
        <IconTile icon={Wallet} color="green" size={32} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground">Retorno da campanha</p>
          <p className="text-2xs text-foreground-secondary">Conversões, receita e ROI medidos no servidor</p>
        </div>
      </div>

      {isError ? (
        <TalkXErrorState entity="conversões da campanha" onRetry={onRetry} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border/60 bg-card p-3 text-center" title={tile.hint}>
                {isLoading ? (
                  <div className="h-7 w-16 mx-auto rounded bg-muted/50 animate-pulse" aria-hidden="true" />
                ) : (
                  <p className={cn('text-xl font-bold tabular-nums', tile.tone)}>{tile.value}</p>
                )}
                <p className="text-2xs text-foreground-secondary mt-0.5">{tile.label}</p>
              </div>
            ))}
          </div>

          {!isLoading && data.roiPercent === null && (
            <p className="text-2xs text-foreground-secondary mt-2">
              {data.investment === null
                ? 'Informe o investimento para calcular o ROI.'
                : 'ROI indefinido com investimento zerado.'}
            </p>
          )}
          {!isLoading && data.conversions === 0 && (
            <p className="text-2xs text-foreground-secondary mt-1">
              Nenhuma conversão atribuída ainda: elas entram quando o negócio é marcado como ganho com compra registrada.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1">
              <label htmlFor={inputId} className="block text-2xs font-semibold text-foreground-secondary mb-1">
                Investimento (R$)
              </label>
              <input
                id={inputId}
                value={draft}
                onChange={(event) => { setDraftDoUsuario(event.target.value); setJustSaved(false); }}
                inputMode="decimal"
                placeholder="0,00"
                disabled={!canEditInvestment || isSavingInvestment}
                aria-describedby={hintId}
                aria-invalid={draftInvalido}
                className={cn(
                  'h-9 w-full rounded-lg border bg-input/40 px-3 text-[13px] tabular-nums text-foreground',
                  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40',
                  draftInvalido ? 'border-destructive' : 'border-border/70',
                  !canEditInvestment && 'opacity-60 cursor-not-allowed',
                )}
              />
            </div>
            {canEditInvestment && (
              <button
                type="submit"
                disabled={isSavingInvestment || draftInvalido || semMudanca || parsedDraft === null}
                className={cn(
                  'h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5',
                  'bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {isSavingInvestment && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Salvar
              </button>
            )}
            <p id={hintId} className="basis-full text-2xs text-foreground-secondary">
              {draftInvalido
                ? 'Valor inválido — use apenas números, por exemplo 1.500,00.'
                : canEditInvestment
                  ? 'Somente administradores e supervisores podem alterar o investimento.'
                  : 'Somente administradores e supervisores editam o investimento.'}
            </p>
          </form>

          {investmentError && (
            <p role="alert" className="text-2xs text-destructive mt-1">{investmentError}</p>
          )}
          {justSaved && !investmentError && (
            <p role="status" className="text-2xs text-dash-green mt-1">Investimento salvo.</p>
          )}
        </>
      )}
    </section>
  );
}

/** Container do painel E74: liga a campanha selecionada ao hook do servidor. */
export function TalkXCampaignRevenuePanel({ campaignId }: { campaignId: string | null | undefined }) {
  const revenue = useTalkXCampaignRevenue(campaignId);
  // A RPC de gravação exige admin/supervisor; a tela usa a mesma checagem para
  // não oferecer um campo que o servidor vai recusar (42501).
  const canEdit = useCRMAdminAccess() === true;
  return (
    <TalkXCampaignRevenueCard
      data={revenue}
      isLoading={revenue.isLoading}
      isError={revenue.isError}
      onRetry={revenue.refetch}
      canEditInvestment={canEdit}
      isSavingInvestment={revenue.isSavingInvestment}
      investmentError={revenue.investmentError}
      onSaveInvestment={revenue.saveInvestment}
    />
  );
}
