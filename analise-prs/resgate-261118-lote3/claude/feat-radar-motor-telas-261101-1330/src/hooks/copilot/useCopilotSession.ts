/**
 * CV-032 — Sessão do Copiloto RADAR do contato aberto.
 *
 * Lê `copilot_sessions` (uma por conversa: `UNIQUE(conversation_id)`) e
 * entrega o estado no formato das telas: etapa, temperatura 0–100 e as
 * letras B·R·I·N·D·E vindas das colunas `brinde_*`.
 * Quando o contato tem mais de uma sessão (mais de uma conversa aberta),
 * retorna a mais recente por `started_at DESC`.
 * RLS: o vendedor só enxerga a própria sessão (`profile_id = auth.uid()`).
 *
 * `copilot_sessions` não está na publicação do Realtime; quem avisa que o
 * estado mudou é o insight novo (ver useLiveSuggestions → `refresh`).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSaleStage, type SaleStage } from '@/data/copilot/sale-stages';

export type BrindeLetter = 'B' | 'R' | 'I' | 'N' | 'D' | 'E';

export interface Stakeholder {
  name: string;
  role?: string;
}

export interface CopilotSessionState {
  id: string;
  stage: SaleStage;
  temperature: number;
  brindeMeter: number;
  brinde_state: Record<BrindeLetter, string | null>;
  brinde_evidence: Record<BrindeLetter, string | null>;
  state_version: number;
  decision_role: string | null;
  occasion: string | null;
  comm_style: string | null;
  intent: string | null;
  sentiment: string | null;
  stakeholders: Stakeholder[];
  last_tick_at: string | null;
}

/** Coluna `brinde_*` e chave de evidência gravadas pelo motor, por letra. */
const LETRAS: Record<BrindeLetter, { coluna: string; evidencia: string }> = {
  B: { coluna: 'brinde_budget', evidencia: 'budget' },
  R: { coluna: 'brinde_responsible', evidencia: 'responsible' },
  I: { coluna: 'brinde_intention', evidencia: 'intention' },
  N: { coluna: 'brinde_quantity', evidencia: 'quantity' },
  D: { coluna: 'brinde_deadline', evidencia: 'deadline' },
  E: { coluna: 'brinde_delivery', evidencia: 'delivery' },
};

const COLUNAS = [
  'id', 'sale_stage', 'temperature', 'brinde_meter', 'state_version', 'last_tick_at',
  'decision_role', 'occasion', 'comm_style', 'intent', 'sentiment', 'stakeholders', 'brinde_evidence',
  ...Object.values(LETRAS).map((l) => l.coluna),
].join(', ');

function texto(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/** Converte a linha do banco no estado das telas. Exportado para teste. */
export function toCopilotSessionState(row: Record<string, unknown>): CopilotSessionState {
  const evid = (row.brinde_evidence && typeof row.brinde_evidence === 'object' ? row.brinde_evidence : {}) as Record<string, unknown>;
  const letras = Object.keys(LETRAS) as BrindeLetter[];
  const stakeholders = Array.isArray(row.stakeholders)
    ? (row.stakeholders as Array<Record<string, unknown>>)
        .filter((s) => typeof s?.name === 'string' && s.name !== '')
        .map((s) => ({ name: s.name as string, role: typeof s.role === 'string' ? s.role : undefined }))
    : [];
  return {
    id: String(row.id),
    stage: isSaleStage(row.sale_stage) ? row.sale_stage : 'novo_contato',
    temperature: typeof row.temperature === 'number' ? row.temperature : 0,
    brindeMeter: typeof row.brinde_meter === 'number' ? row.brinde_meter : 0,
    brinde_state: Object.fromEntries(letras.map((l) => [l, texto(row[LETRAS[l].coluna])])) as Record<BrindeLetter, string | null>,
    brinde_evidence: Object.fromEntries(letras.map((l) => [l, texto(evid[LETRAS[l].evidencia])])) as Record<BrindeLetter, string | null>,
    state_version: typeof row.state_version === 'number' ? row.state_version : 0,
    decision_role: texto(row.decision_role),
    occasion: texto(row.occasion),
    comm_style: texto(row.comm_style),
    intent: texto(row.intent),
    sentiment: texto(row.sentiment),
    stakeholders,
    last_tick_at: texto(row.last_tick_at),
  };
}

export interface UseCopilotSessionResult {
  session: CopilotSessionState | null;
  loading: boolean;
  refresh: () => void;
}

export function useCopilotSession(contactId: string | undefined): UseCopilotSessionResult {
  const [versao, setVersao] = useState(0);
  // Resultado guardado com a chave que o produziu: troca de contato não mostra a sessão do anterior.
  const [lido, setLido] = useState<{ chave: string; contactId: string; session: CopilotSessionState | null } | null>(null);
  const chave = contactId ? `${contactId}:${versao}` : null;

  const refresh = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!contactId || !chave) return;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase
        .from('copilot_sessions')
        .select(COLUNAS)
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelado) return;
      // Erro (ex.: tabela ainda sem as colunas do motor) = sem RADAR, sem quebrar a Inbox.
      const session = !error && data ? toCopilotSessionState(data as unknown as Record<string, unknown>) : null;
      setLido({ chave, contactId, session });
    })();
    return () => {
      cancelado = true;
    };
  }, [contactId, chave]);

  const session = contactId && lido?.contactId === contactId ? lido.session : null;
  const loading = chave !== null && lido?.chave !== chave;
  return { session, loading, refresh };
}
