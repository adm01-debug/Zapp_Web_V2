/**
 * LeadRiskScorePanel — "Score e LGPD" do contato.
 *
 * Restaurado (2026-11-12) do painel que saiu como órfão na #1886: o atendente
 * ajusta lead score, risk score e origem do lead em `contacts`, e vê o
 * consentimento LGPD. Adaptações ao banco atual:
 *  - consentimento só aceita `granted | unknown | revoked`
 *    (CHECK `contacts_consent_status_valores`, migration 20261016010744);
 *  - só admin troca o consentimento (o gatilho
 *    `enforce_contacts_consent_status_guard` descarta a troca de outros papéis),
 *    então para os demais o campo aparece só para leitura;
 *  - o Salvar grava apenas o que mudou e invalida o `contact-lead-score` que a
 *    aba IA lê, para as duas telas mostrarem o mesmo número.
 */
import { useState } from 'react';
import { AlertCircle, MapPin, Save, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useContactLeadRisk, useUpdateContactLeadRisk, type ContactLeadRisk } from '@/hooks/crm/useContactLeadRisk';
import { cn } from '@/lib/utils';

interface LeadRiskScorePanelProps {
  contactId: string;
}

type LeadRiskRow = ContactLeadRisk;

interface LeadRiskDraft {
  leadScore: number;
  riskScore: number;
  leadOrigin: string;
  consentStatus: string;
}

const LEAD_ORIGINS = [
  { value: 'organic', label: 'Orgânico' },
  { value: 'paid_ads', label: 'Anúncios pagos' },
  { value: 'referral', label: 'Indicação' },
  { value: 'social_media', label: 'Redes sociais' },
  { value: 'website', label: 'Website' },
  { value: 'event', label: 'Evento' },
  { value: 'cold_outreach', label: 'Prospecção ativa' },
  { value: 'whatsapp', label: 'WhatsApp direto' },
  { value: 'other', label: 'Outro' },
] as const;

/** Mesmos valores do CHECK do banco e dos rótulos do Talk X (RuleValueInput). */
const CONSENT_OPTIONS = [
  { value: 'granted', label: 'Concedido' },
  { value: 'unknown', label: 'Desconhecido' },
  { value: 'revoked', label: 'Revogado' },
] as const;

function toDraft(row: LeadRiskRow | null): LeadRiskDraft {
  return {
    leadScore: row?.lead_score ?? 0,
    riskScore: row?.risk_score ?? 0,
    leadOrigin: row?.lead_origin ?? '',
    consentStatus: row?.consent_status ?? '',
  };
}

function leadScoreClass(score: number) {
  if (score >= 80) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-destructive';
}

function riskScoreClass(score: number) {
  if (score >= 70) return 'text-destructive';
  if (score >= 40) return 'text-warning';
  return 'text-success';
}

function LeadRiskForm({ contactId, row }: { contactId: string; row: LeadRiskRow | null }) {
  const { isAdmin } = useUserRole();
  const initial = toDraft(row);
  const [draft, setDraft] = useState<LeadRiskDraft>(initial);

  const changes: Partial<LeadRiskRow> = {};
  if (draft.leadScore !== initial.leadScore) changes.lead_score = draft.leadScore;
  if (draft.riskScore !== initial.riskScore) changes.risk_score = draft.riskScore;
  if (draft.leadOrigin !== initial.leadOrigin) changes.lead_origin = draft.leadOrigin || null;
  if (isAdmin && draft.consentStatus !== initial.consentStatus) changes.consent_status = draft.consentStatus || null;
  const dirty = Object.keys(changes).length > 0;

  const save = useUpdateContactLeadRisk(contactId);
  const handleSave = () => {
    save.mutate(changes, {
      onSuccess: () => toast.success('Scores atualizados'),
      onError: () => toast.error('Não foi possível salvar os scores'),
    });
  };

  const consentLabel = CONSENT_OPTIONS.find((o) => o.value === draft.consentStatus)?.label ?? 'Não informado';

  return (
    <div className="space-y-4" data-testid="lead-risk-form">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            <span className="text-xs font-medium">Lead score</span>
          </div>
          <span data-testid="lead-score-value" className={cn('text-lg font-bold tabular-nums', leadScoreClass(draft.leadScore))}>
            {draft.leadScore}
          </span>
        </div>
        <Slider
          value={[draft.leadScore]}
          onValueChange={([v]) => setDraft((d) => ({ ...d, leadScore: v }))}
          max={100}
          step={5}
          thumbLabel="Lead score"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
            <span className="text-xs font-medium">Risk score</span>
          </div>
          <span data-testid="risk-score-value" className={cn('text-lg font-bold tabular-nums', riskScoreClass(draft.riskScore))}>
            {draft.riskScore}
          </span>
        </div>
        <Slider
          value={[draft.riskScore]}
          onValueChange={([v]) => setDraft((d) => ({ ...d, riskScore: v }))}
          max={100}
          step={5}
          thumbLabel="Risk score"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-medium">Origem do lead</span>
        </div>
        <Select value={draft.leadOrigin} onValueChange={(v) => setDraft((d) => ({ ...d, leadOrigin: v }))}>
          <SelectTrigger className="h-8 text-xs" aria-label="Origem do lead">
            <SelectValue placeholder="Selecione a origem" />
          </SelectTrigger>
          <SelectContent>
            {LEAD_ORIGINS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-medium">Consentimento LGPD</span>
        </div>
        {isAdmin ? (
          <Select value={draft.consentStatus} onValueChange={(v) => setDraft((d) => ({ ...d, consentStatus: v }))}>
            <SelectTrigger className="h-8 text-xs" aria-label="Consentimento LGPD">
              <SelectValue placeholder="Status de consentimento" />
            </SelectTrigger>
            <SelectContent>
              {CONSENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div data-testid="consent-readonly" className="rounded-md bg-muted/20 px-2 py-1.5 text-xs">
            <span className="font-medium">{consentLabel}</span>
            <p className="text-3xs text-muted-foreground mt-0.5">Só administrador altera o consentimento.</p>
          </div>
        )}
      </div>

      <Button size="sm" className="w-full h-8 text-xs" onClick={handleSave} disabled={!dirty || save.isPending}>
        <Save className="w-3 h-3 mr-1" aria-hidden="true" />
        {save.isPending ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </div>
  );
}

export function LeadRiskScorePanel({ contactId }: LeadRiskScorePanelProps) {
  const { data, isLoading, isError, refetch } = useContactLeadRisk(contactId);

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="lead-risk-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" data-testid="lead-risk-error" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
        <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
        <div className="text-xs text-destructive">
          <p>Não foi possível ler os scores deste contato.</p>
          <button type="button" className="font-semibold text-primary hover:underline mt-1" onClick={() => { void refetch(); }}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // key: a cada nova leitura do banco o formulário remonta com os valores salvos.
  return <LeadRiskForm key={JSON.stringify(data ?? null)} contactId={contactId} row={data ?? null} />;
}
