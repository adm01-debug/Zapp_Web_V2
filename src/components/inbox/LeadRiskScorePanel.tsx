import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, ShieldAlert, Save, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface LeadRiskScorePanelProps {
  contactId: string;
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
];

export function LeadRiskScorePanel({ contactId }: LeadRiskScorePanelProps) {
  const [leadScore, setLeadScore] = useState(0);
  const [riskScore, setRiskScore] = useState(0);
  const [leadOrigin, setLeadOrigin] = useState('');
  const [consentStatus, setConsentStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadData();
  }, [contactId]);

  const loadData = async () => {
    const { data } = await supabase
      .from('contacts')
      .select('lead_score, risk_score, lead_origin, consent_status')
      .eq('id', contactId)
      .single();
    if (data) {
      setLeadScore(data.lead_score ?? 0);
      setRiskScore(data.risk_score ?? 0);
      setLeadOrigin(data.lead_origin ?? '');
      setConsentStatus(data.consent_status ?? '');
    }
    setLoaded(true);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('contacts')
      .update({
        lead_score: leadScore,
        risk_score: riskScore,
        lead_origin: leadOrigin || null,
        consent_status: consentStatus || null,
      })
      .eq('id', contactId);
    if (!error) toast.success('Scores atualizados');
    else toast.error('Erro ao salvar');
    setSaving(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  if (!loaded) return <div className="h-24 bg-muted/20 rounded-lg animate-pulse" />;

  return (
    <div className="space-y-4">
      {/* Lead Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium">Lead Score</span>
          </div>
          <span className={`text-lg font-bold ${getScoreColor(leadScore)}`}>{leadScore}</span>
        </div>
        <Slider value={[leadScore]} onValueChange={([v]) => setLeadScore(v)} max={100} step={5} className="w-full" />
      </div>

      {/* Risk Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-warning" />
            <span className="text-xs font-medium">Risk Score</span>
          </div>
          <span className={`text-lg font-bold ${riskScore >= 70 ? 'text-destructive' : riskScore >= 40 ? 'text-warning' : 'text-success'}`}>{riskScore}</span>
        </div>
        <Slider value={[riskScore]} onValueChange={([v]) => setRiskScore(v)} max={100} step={5} className="w-full" />
      </div>

      {/* Lead Origin */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Origem do Lead</span>
        </div>
        <Select value={leadOrigin} onValueChange={setLeadOrigin}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione a origem" />
          </SelectTrigger>
          <SelectContent>
            {LEAD_ORIGINS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Consent */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium">Consentimento LGPD</span>
        <Select value={consentStatus} onValueChange={setConsentStatus}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Status de consentimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="granted">✅ Concedido</SelectItem>
            <SelectItem value="pending">⏳ Pendente</SelectItem>
            <SelectItem value="denied">❌ Negado</SelectItem>
            <SelectItem value="revoked">🚫 Revogado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" className="w-full h-8 text-xs" onClick={save} disabled={saving}>
        <Save className="w-3 h-3 mr-1" />
        {saving ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </div>
  );
}
