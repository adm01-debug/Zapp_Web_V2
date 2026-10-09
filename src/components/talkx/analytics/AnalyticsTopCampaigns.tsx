import { useMemo, useState } from 'react';
import { ArrowRight, Megaphone, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { IconTile, OBJECTIVES, Th, Td, fmtInt, fmtPct } from '../talkxShared';

/**
 * X187 — Tabela de melhor resultado.
 *
 * Antes a tabela tinha coluna fixa "Canal / WhatsApp" (rótulo que a regra de
 * 07–08/10/2026 proíbe: não se indica canal do arquivo nem da mensagem), não
 * tinha ordenação e não mostrava resposta. Aqui as colunas são as que a tabela
 * promete — envios, entrega, resposta e conversão — com "Ordenar por" e o
 * atalho para a lista completa de campanhas.
 *
 * `converted_count` não existe no banco hoje (grep = 0 em src/ e em
 * supabase/migrations/): a coluna Conversões fica "sem dados ainda" enquanto a
 * fonte não existir, em vez de exibir 0 e afirmar resultado não medido.
 */

export type CampaignSort = 'enviadas' | 'entrega' | 'resposta' | 'conversoes';

const CAMPAIGN_SORTS: { value: CampaignSort; label: string }[] = [
  { value: 'enviadas', label: 'Enviadas' },
  { value: 'entrega', label: 'Taxa de entrega' },
  { value: 'resposta', label: 'Taxa de resposta' },
  { value: 'conversoes', label: 'Conversões' },
];

/** Linhas exibidas na tabela (as demais ficam em "Ver todas as campanhas"). */
const TOP_CAMPAIGNS_LIMIT = 5;

/** Coluna ainda não existente no banco; lida por contrato para o dia em que existir. */
type CampaignWithConversions = TalkXCampaign & { converted_count?: number | null };

const conversionsOf = (c: TalkXCampaign): number | null => {
  const v = (c as CampaignWithConversions).converted_count;
  return typeof v === 'number' ? v : null;
};

/** Taxa (0–1) ou `-1` quando não há base, para a linha sem dado ir para o fim da ordem. */
const ratio = (num: number | null | undefined, den: number | null | undefined) =>
  (den ?? 0) > 0 && num != null ? num / (den as number) : -1;

function sortCampaigns(campaigns: TalkXCampaign[], sort: CampaignSort, limit = TOP_CAMPAIGNS_LIMIT): TalkXCampaign[] {
  const key = (c: TalkXCampaign) => {
    switch (sort) {
      case 'entrega': return ratio(c.delivered_count, c.sent_count);
      case 'resposta': return ratio(c.replied_count, c.sent_count);
      case 'conversoes': return conversionsOf(c) ?? -1;
      default: return c.sent_count ?? 0;
    }
  };
  return [...campaigns]
    .sort((a, b) => key(b) - key(a) || (b.sent_count ?? 0) - (a.sent_count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function objectiveIcon(c: TalkXCampaign): { icon: LucideIcon; label: string } {
  const found = OBJECTIVES.find((o) => o.value === c.objective);
  return found ? { icon: found.icon, label: found.label } : { icon: Megaphone, label: 'Sem objetivo definido' };
}

export function AnalyticsTopCampaigns({
  campaigns,
  onOpenCampaign,
  onViewAll,
  limit = TOP_CAMPAIGNS_LIMIT,
}: {
  campaigns: TalkXCampaign[];
  onOpenCampaign?: (id: string) => void;
  onViewAll?: () => void;
  limit?: number;
}) {
  const [sort, setSort] = useState<CampaignSort>('enviadas');
  const rows = useMemo(() => sortCampaigns(campaigns, sort, limit), [campaigns, sort, limit]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <IconTile icon={Trophy} color="amber" size={36} />
          <div>
            <p className="text-[15px] font-bold text-foreground">Campanhas com melhor resultado</p>
            <p className="text-xs text-foreground-secondary">Ordenação e taxas do período selecionado</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground-secondary">
          Ordenar por
          <select
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => setSort(e.target.value as CampaignSort)}
            className="h-8 rounded-lg border border-border/70 bg-input/40 px-2 text-xs text-foreground"
          >
            {CAMPAIGN_SORTS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <Th className="w-10">#</Th>
              <Th>Campanha</Th>
              <Th className="text-right">Enviadas</Th>
              <Th className="text-right">Taxa de entrega</Th>
              <Th className="text-right">Taxa de resposta</Th>
              <Th className="text-right">Conversões</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const { icon: ObjectiveIcon, label: objectiveLabel } = objectiveIcon(c);
              const converted = conversionsOf(c);
              return (
                <tr key={c.id} className="border-t border-border/40 hover:bg-muted/20">
                  <Td className="text-muted-foreground">{i + 1}</Td>
                  <Td>
                    <span className="flex items-center gap-2 min-w-0">
                      <ObjectiveIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="sr-only">{objectiveLabel}:</span>
                      {onOpenCampaign ? (
                        <button type="button" onClick={() => onOpenCampaign(c.id)} className="text-left text-[13px] font-semibold text-foreground truncate max-w-[240px] hover:text-primary transition-colors">
                          {c.name}
                        </button>
                      ) : (
                        <span className="text-[13px] font-semibold text-foreground truncate max-w-[240px]">{c.name}</span>
                      )}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{fmtInt(c.sent_count)}</Td>
                  <Td className="text-right tabular-nums text-dash-green font-semibold">{(c.sent_count ?? 0) > 0 ? fmtPct(c.delivered_count ?? 0, c.sent_count) : '—'}</Td>
                  <Td className="text-right tabular-nums">{c.replied_count == null ? <span className="text-muted-foreground font-normal">sem dados ainda</span> : (c.sent_count ?? 0) > 0 ? fmtPct(c.replied_count, c.sent_count) : '—'}</Td>
                  <Td className="text-right tabular-nums">{converted === null ? <span className="text-muted-foreground font-normal">sem dados ainda</span> : fmtInt(converted)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onViewAll && (
        <button type="button" onClick={onViewAll} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
          Ver todas as campanhas
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </section>
  );
}
