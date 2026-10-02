import { useState } from 'react';
import {
  BarChart3, Brain, ChevronRight, DollarSign, Eye, Flame, GitBranch, Heart,
  Hexagon, Link2, MessageSquareQuote, Target, UserRound,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarSection } from './SidebarSection';
import { SidebarEmpty } from './SidebarEmpty';
import { SinguProfileTile } from './SinguProfileTile';
import { SinguProfileDetailSheet, type SinguDetailKind } from './SinguProfileDetailSheet';
import {
  BIG_FIVE_LABELS, BUDGET_AUTHORITY_LABELS, DECISION_CRITERIA_LABELS,
  DECISION_SPEED_LABELS, MBTI_LABELS, TEMPERAMENT_LABELS, VAK_LABELS,
  discLabel, enneagramLabel, labelOrRaw, summarizeMetaprograms,
} from '@/lib/singuLabels';
import { formatBirthday } from '@/lib/formatters';
import type {
  ContactSidebarData, ContactSidebarStatus, SinguProfile,
  SidebarBigFive, SidebarMbti, SidebarVak,
} from '@/types/contactSidebar';

interface SinguProfileSectionProps {
  index: number;
  status: ContactSidebarStatus;
  data?: ContactSidebarData | null;
  onBuscarCRM: () => void;
  onRetry: () => void;
}

const VAK_SCORE_KEYS: Record<string, keyof Pick<SidebarVak, 'visual' | 'auditory' | 'kinesthetic'>> = {
  visual: 'visual', V: 'visual', auditory: 'auditory', auditivo: 'auditory', A: 'auditory',
  kinesthetic: 'kinesthetic', cinestesico: 'kinesthetic', K: 'kinesthetic',
};

function vakTile(vak: SidebarVak | null): { value: string | null; bar: number | null } {
  if (!vak?.primary) return { value: null, bar: null };
  const scoreKey = VAK_SCORE_KEYS[vak.primary];
  return { value: labelOrRaw(VAK_LABELS, vak.primary), bar: scoreKey ? (vak[scoreKey] ?? null) : null };
}

function bigFiveTile(bf: SidebarBigFive | null): { value: string | null; bar: number | null } {
  if (!bf) return { value: null, bar: null };
  const axes = (Object.keys(BIG_FIVE_LABELS) as Array<keyof typeof BIG_FIVE_LABELS>)
    .map((key) => ({ label: BIG_FIVE_LABELS[key], score: bf[key] }))
    .filter((x): x is { label: string; score: number } => typeof x.score === 'number');
  if (axes.length === 0) return { value: null, bar: bf.confidence ?? null };
  const top = axes.reduce((a, b) => (b.score > a.score ? b : a));
  const faixa = top.score >= 70 ? 'Alta' : top.score >= 40 ? 'Média' : 'Baixa';
  return { value: `${faixa} ${top.label}`, bar: bf.confidence ?? null };
}

/** Intensidade da preferência: maior |eixo−50| entre os 4 eixos (etapa 73). */
function mbtiIntensity(mbti: SidebarMbti): number | null {
  const dists = [mbti.e_i, mbti.s_n, mbti.t_f, mbti.j_p]
    .filter((v): v is number => typeof v === 'number')
    .map((v) => Math.abs(v - 50));
  return dists.length ? Math.max(...dists) : null;
}

function truncate(text: string | null | undefined, max = 40): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

interface DetailRowSpec {
  kind: SinguDetailKind;
  label: string;
  icon: React.ReactNode;
  preview: string | null;
  hasData: boolean;
}

function buildDetailRows(profile: SinguProfile | null): DetailRowSpec[] {
  const metaprograms = profile?.metaprograms ?? null;
  const fears = profile?.fears_motivation ?? null;
  const decision = profile?.decision ?? null;
  const budget = profile?.budget ?? null;
  const influencers = profile?.influencers ?? [];
  const rapport = profile?.rapport ?? null;
  const scripts = profile?.objection_scripts ?? [];

  const influencerNames = influencers.map((i) => i.name).filter((n): n is string => !!n?.trim());
  const influencersPreview = influencerNames.length === 0 ? null
    : influencerNames.slice(0, 2).join(', ') + (influencerNames.length > 2 ? ` +${influencerNames.length - 2}` : '');

  const speedLabel = decision?.speed ? labelOrRaw(DECISION_SPEED_LABELS, decision.speed) : null;
  const firstCriterion = decision?.criteria?.[0] ? labelOrRaw(DECISION_CRITERIA_LABELS, decision.criteria[0]) : null;
  const decisionPreview = [speedLabel, firstCriterion].filter(Boolean).join(' · ') || null;

  const objectionsPreview = scripts
    .map((s) => s.objection_type)
    .filter((t): t is string => !!t?.trim())
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 3).join(', ') || null;

  const fearsPreview = truncate(fears?.main_fear) ?? truncate(fears?.motivation_primary);
  const rapportPreview = truncate(rapport?.notes) ?? (rapport?.preferred_triggers?.[0] ?? null);

  return [
    { kind: 'metaprograms', label: 'Metaprogramas', icon: <Brain />, preview: summarizeMetaprograms(metaprograms), hasData: metaprograms !== null },
    { kind: 'fears', label: 'Medos & Motivação', icon: <Heart />, preview: fearsPreview, hasData: fears !== null },
    { kind: 'decision', label: 'Estilo de decisão', icon: <Target />, preview: decisionPreview, hasData: decision !== null },
    { kind: 'budget', label: 'Autoridade de orçamento', icon: <DollarSign />, preview: budget?.authority ? labelOrRaw(BUDGET_AUTHORITY_LABELS, budget.authority) : null, hasData: budget !== null },
    { kind: 'influencers', label: 'Influenciadores', icon: <Link2 />, preview: influencersPreview, hasData: influencers.length > 0 },
    { kind: 'rapport', label: 'Rapport & gatilhos', icon: <MessageSquareQuote />, preview: rapportPreview, hasData: rapport !== null },
    { kind: 'objections', label: 'Scripts de objeção', icon: <GitBranch />, preview: objectionsPreview, hasData: scripts.length > 0 },
  ];
}

function hasAnyProfile(profile: SinguProfile | null): boolean {
  if (!profile) return false;
  return !!(profile.disc?.primary || profile.vak?.primary || profile.big_five || profile.mbti?.type
    || profile.enneagram?.type || profile.temperament?.primary || profile.metaprograms
    || profile.fears_motivation || profile.decision || profile.budget
    || profile.influencers.length > 0 || profile.rapport || profile.objection_scripts.length > 0);
}

/**
 * Seção 3 — Perfil Singu: grade 2×3 (DISC, VAK, Big Five, MBTI, Eneagrama,
 * Temperamento) + 7 linhas de detalhe que abrem o Sheet lateral
 * (etapas 68–80). Sem dados = "Não avaliado"/"—", nunca inventado.
 */
export function SinguProfileSection({ index, status, data, onBuscarCRM, onRetry }: SinguProfileSectionProps) {
  const profile = status === 'ok' ? (data?.singu_profile ?? null) : null;
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<DetailRowSpec | null>(null);

  const disc = profile?.disc ?? null;
  const vak = vakTile(profile?.vak ?? null);
  const bigFive = bigFiveTile(profile?.big_five ?? null);
  const mbti = profile?.mbti ?? null;
  const mbtiApelido = mbti?.type ? MBTI_LABELS[mbti.type.toUpperCase()] : undefined;
  const mbtiValue = mbti?.type ? `${mbti.type}${mbtiApelido ? ` – ${mbtiApelido}` : ''}` : null;
  const ennea = profile?.enneagram ?? null;
  const enneaBar = ennea?.type !== null && ennea?.type !== undefined && ennea?.scores
    ? (ennea.scores[String(ennea.type)] ?? null)
    : null;
  const temperament = profile?.temperament ?? null;
  const temperamentPrimary = temperament?.primary ? labelOrRaw(TEMPERAMENT_LABELS, temperament.primary) : null;
  const temperamentSecondary = temperament?.secondary ? labelOrRaw(TEMPERAMENT_LABELS, temperament.secondary) : null;
  const temperamentValue = temperamentPrimary
    ? `${temperamentPrimary}${temperamentSecondary ? ` · ${temperamentSecondary}` : ''}`
    : null;

  const rows = buildDetailRows(profile);
  const assessed = formatBirthday(profile?.assessed_at ?? null).label;

  return (
    <SidebarSection index={index} value="singu" tone="green" icon={<BarChart3 />} title="Perfil Singu" subtitle="Análise comportamental e estilo de comunicação">
      {status === 'loading' && (
        <div data-testid="sidebar-singu-loading" className="space-y-2">
          <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      )}
      {status === 'disabled' && <SidebarEmpty cause="disabled" message="Integração com o Singu desligada" />}
      {status === 'error' && <SidebarEmpty cause="error" message="Não foi possível carregar o perfil" cta={{ label: 'Tentar de novo', onClick: onRetry }} />}
      {status === 'not_found' && <SidebarEmpty cause="not-found" message="Contato não vinculado ao Singu" cta={{ label: 'Buscar no CRM', onClick: onBuscarCRM }} />}
      {status === 'ok' && (
        <>
          {!hasAnyProfile(profile) ? (
            <SidebarEmpty cause="empty" message="Sem avaliação no Singu" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <SinguProfileTile name="disc" icon={<UserRound />} label="DISC" value={discLabel(disc?.primary, disc?.blend)} bar={disc?.confidence} />
                <SinguProfileTile name="vak" icon={<Eye />} label="VAK" value={vak.value} bar={vak.bar} />
                <SinguProfileTile name="big_five" icon={<BarChart3 />} label="Big Five" value={bigFive.value} bar={bigFive.bar} />
                <SinguProfileTile name="mbti" icon={<Brain />} label="MBTI" value={mbtiValue} bar={mbti ? mbtiIntensity(mbti) : null} />
                <SinguProfileTile name="enneagram" icon={<Hexagon />} label="Eneagrama" value={enneagramLabel(ennea?.type, ennea?.wing)} bar={enneaBar} />
                <SinguProfileTile name="temperament" icon={<Flame />} label="Temperamento" value={temperamentValue} bar={null} />
              </div>
              <div className="space-y-0.5">
                {rows.map((row) => (
                  <button
                    key={row.kind} type="button"
                    data-testid={`singu-row-${row.kind}`}
                    disabled={!row.hasData}
                    onClick={() => { setDetailRow(row); setDetailOpen(true); }}
                    className="w-full grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 min-h-7 rounded-md px-1 -mx-1 text-left hover:bg-muted/40 disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-muted-foreground [&>svg]:w-4 [&>svg]:h-4">{row.icon}</span>
                    <span className="text-xs min-w-0 truncate">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-foreground"> — {row.preview ?? '—'}</span>
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 ${row.hasData ? 'text-muted-foreground' : 'text-muted-foreground/30'}`} />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-2 pt-2 border-t border-border/50 text-3xs text-muted-foreground text-center" data-testid="singu-assessed-footer">
            {assessed ? `Avaliado em ${assessed}` : 'Sem avaliação no Singu'}
          </div>
        </>
      )}
      <SinguProfileDetailSheet open={detailOpen} onOpenChange={setDetailOpen} row={detailRow} profile={profile} />
    </SidebarSection>
  );
}
