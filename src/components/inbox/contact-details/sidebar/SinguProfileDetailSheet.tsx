import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BUDGET_AUTHORITY_LABELS, DECISION_CRITERIA_LABELS, DECISION_ROLE_LABELS,
  DECISION_SPEED_LABELS, labelOrRaw, type MetaprogramScores,
} from '@/lib/singuLabels';
import type { SinguProfile } from '@/types/contactSidebar';

export type SinguDetailKind =
  | 'metaprograms' | 'fears' | 'decision' | 'budget' | 'influencers' | 'rapport' | 'objections';

export interface SinguDetailRow {
  kind: SinguDetailKind;
  label: string;
}

interface SinguProfileDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SinguDetailRow | null;
  profile: SinguProfile | null;
}

const METAPROGRAM_AXES: Array<[keyof MetaprogramScores, keyof MetaprogramScores]> = [
  ['toward', 'away_from'],
  ['internal', 'external'],
  ['options', 'procedures'],
  ['proactive', 'reactive'],
  ['global', 'detail'],
];

const AXIS_LABELS: Record<string, string> = {
  toward: 'Foco em resultados', away_from: 'Foco em evitar problemas',
  internal: 'Referência interna', external: 'Referência externa',
  options: 'Busca opções', procedures: 'Segue procedimentos',
  proactive: 'Pró-ativo', reactive: 'Reativo',
  global: 'Visão global', detail: 'Detalhista',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-3xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-xs text-foreground">{children ?? '—'}</div>
    </div>
  );
}

function ChipList({ items }: { items: string[] | null | undefined }) {
  if (!items?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => <Badge key={item} variant="secondary" className="text-3xs font-normal">{item}</Badge>)}
    </div>
  );
}

function ChannelBar({ label, value, max = 100 }: { label: string; value: number | null | undefined; max?: number }) {
  if (typeof value !== 'number') return null;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-3xs"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>
      <Progress value={Math.min(100, (value / max) * 100)} className="h-1" aria-label={`${label}: ${value}`} />
    </div>
  );
}

/**
 * Sheet lateral (direita, 400px / full em mobile) com o detalhe completo de
 * uma das 7 linhas do Perfil Singu (etapa 77). Esc fecha o Sheet sem fechar
 * o painel — o handler do `ContactDetails` já ignora `defaultPrevented`.
 */
export function SinguProfileDetailSheet({ open, onOpenChange, row, profile }: SinguProfileDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[400px] max-w-full sm:max-w-[400px] overflow-y-auto" data-testid="singu-detail-sheet">
        <SheetHeader>
          <SheetTitle>{row?.label ?? 'Detalhe'}</SheetTitle>
          <SheetDescription>Detalhe do Perfil Singu deste contato</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-6">
          {row?.kind === 'metaprograms' && <MetaprogramsDetail profile={profile} />}
          {row?.kind === 'fears' && <FearsDetail profile={profile} />}
          {row?.kind === 'decision' && <DecisionDetail profile={profile} />}
          {row?.kind === 'budget' && <BudgetDetail profile={profile} />}
          {row?.kind === 'influencers' && <InfluencersDetail profile={profile} />}
          {row?.kind === 'rapport' && <RapportDetail profile={profile} />}
          {row?.kind === 'objections' && <ObjectionsDetail profile={profile} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetaprogramsDetail({ profile }: { profile: SinguProfile | null }) {
  const mp = profile?.metaprograms;
  if (!mp) return <EmptyDetail />;
  return (
    <>
      {METAPROGRAM_AXES.map(([a, b]) => {
        const aScore = mp[a as keyof typeof mp];
        const bScore = mp[b as keyof typeof mp];
        if (typeof aScore !== 'number' && typeof bScore !== 'number') return null;
        return (
          <div key={`${a}-${b}`} className="space-y-1">
            <div className="flex justify-between text-3xs text-muted-foreground">
              <span>{AXIS_LABELS[a]}</span><span>{AXIS_LABELS[b]}</span>
            </div>
            <div className="flex gap-1">
              <Progress value={typeof aScore === 'number' ? aScore : 0} className="h-1.5 flex-1" aria-label={`${AXIS_LABELS[a]}: ${aScore ?? 0}`} />
              <Progress value={typeof bScore === 'number' ? bScore : 0} className="h-1.5 flex-1 rotate-180" aria-label={`${AXIS_LABELS[b]}: ${bScore ?? 0}`} />
            </div>
          </div>
        );
      })}
      {mp.notes && <Field label="Notas">{mp.notes}</Field>}
    </>
  );
}

function FearsDetail({ profile }: { profile: SinguProfile | null }) {
  const f = profile?.fears_motivation;
  if (!f) return <EmptyDetail />;
  return (
    <>
      <Field label="Principal medo">{f.main_fear}</Field>
      <Field label="Motivação principal">{f.motivation_primary}</Field>
      <Field label="Pressão atual">{f.current_pressure}</Field>
      <Field label="Objetivos profissionais">{f.professional_goals}</Field>
    </>
  );
}

function DecisionDetail({ profile }: { profile: SinguProfile | null }) {
  const d = profile?.decision;
  if (!d) return <EmptyDetail />;
  return (
    <>
      <Field label="Velocidade de decisão">{labelOrRaw(DECISION_SPEED_LABELS, d.speed)}</Field>
      <Field label="Critérios">
        <ChipList items={d.criteria?.map((c) => labelOrRaw(DECISION_CRITERIA_LABELS, c) ?? c)} />
      </Field>
      <Field label="Precisa de aprovação">
        {d.needs_approval === null || d.needs_approval === undefined ? null : d.needs_approval ? 'Sim' : 'Não'}
      </Field>
      <Field label="Aprovador">{d.approver_name}</Field>
    </>
  );
}

function BudgetDetail({ profile }: { profile: SinguProfile | null }) {
  const b = profile?.budget;
  if (!b) return <EmptyDetail />;
  return (
    <>
      <Field label="Autoridade">{labelOrRaw(BUDGET_AUTHORITY_LABELS, b.authority)}</Field>
      <Field label="Papel na decisão">{labelOrRaw(DECISION_ROLE_LABELS, b.decision_role)}</Field>
      <Field label="Poder de decisão (1–10)">
        {typeof b.decision_power === 'number' ? (
          <div className="space-y-1">
            <ChannelBar label="Poder de decisão" value={b.decision_power} max={10} />
          </div>
        ) : null}
      </Field>
    </>
  );
}

function InfluencersDetail({ profile }: { profile: SinguProfile | null }) {
  const list = profile?.influencers ?? [];
  if (list.length === 0) return <EmptyDetail />;
  return (
    <div className="space-y-2">
      {list.map((inf) => (
        <div key={inf.contact_id} className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-xs font-medium text-foreground">{inf.name ?? '—'}</div>
          <div className="text-3xs text-muted-foreground">{inf.cargo ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

function RapportDetail({ profile }: { profile: SinguProfile | null }) {
  const r = profile?.rapport;
  if (!r) return <EmptyDetail />;
  const scores = r.channel_scores;
  return (
    <>
      {scores && (
        <div className="space-y-2">
          <div className="text-3xs font-medium text-muted-foreground uppercase tracking-wider">Canais de comunicação</div>
          <ChannelBar label="Visual" value={scores.visual} />
          <ChannelBar label="Auditivo" value={scores.auditory} />
          <ChannelBar label="Cinestésico" value={scores.kinesthetic} />
          <ChannelBar label="Digital" value={scores.digital} />
        </div>
      )}
      <Field label="Gatilhos preferidos"><ChipList items={r.preferred_triggers} /></Field>
      <Field label="Âncoras emocionais"><ChipList items={r.emotional_anchors} /></Field>
      <Field label="Gatilhos de resistência"><ChipList items={r.resistance_triggers} /></Field>
      <Field label="Ritmo (pacing)">{r.pacing_speed}</Field>
      <Field label="Tom de voz preferido">{r.voice_tone_preferred}</Field>
      <Field label="Técnica de espelhamento">{r.mirroring_technique}</Field>
      <Field label="Notas">{r.notes}</Field>
    </>
  );
}

function ObjectionsDetail({ profile }: { profile: SinguProfile | null }) {
  const list = profile?.objection_scripts ?? [];
  if (list.length === 0) return <EmptyDetail />;
  return (
    <div className="space-y-2">
      {list.map((script, i) => (
        <div key={`${script.objection_type}-${i}`} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">{script.objection_type ?? 'Objeção'}</span>
            {typeof script.effectiveness_score === 'number' && (
              <Badge variant="secondary" className="text-3xs font-normal">eficácia {script.effectiveness_score}</Badge>
            )}
          </div>
          {script.neurological_bias && (
            <div className="text-3xs text-muted-foreground">Viés: {script.neurological_bias}</div>
          )}
          {script.script_content && (
            <p className="text-xs text-foreground whitespace-pre-wrap">{script.script_content}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyDetail() {
  return <p className="text-xs text-muted-foreground">Sem dados deste bloco no Singu.</p>;
}
