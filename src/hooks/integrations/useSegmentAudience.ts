/**
 * X104 — Hook `useSegmentAudience(rules)`.
 *
 * Chama a RPC `talkx_resolve_audience` com debounce de 400 ms,
 * cancela a chamada anterior, mantém o valor anterior enquanto
 * calcula e exclui condições incompletas.
 */

import { useReducer, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeRules, isRuleComplete, type SegmentRulesV2 } from '@/segments/segmentRules';

export interface SegmentAudienceResult {
  count: number;
  sample: Array<{
    id: string;
    name: string;
    nickname: string | null;
    phone: string;
    company: string | null;
    avatar_url: string | null;
    contact_type: string | null;
    tags: string[] | null;
  }>;
  totalBase: number;
  suppressed: number;
}

type TalkXAudienceRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function audienceRulesPayload(rules: SegmentRulesV2 | null | undefined): { groups: unknown[] } {
  return { groups: rules?.groups ?? [] };
}

type AudienceAction =
  | { type: 'RESET' }
  | { type: 'SET_RESULT'; payload: SegmentAudienceResult }
  | { type: 'KEEP_PREV' };

function audienceReducer(
  state: SegmentAudienceResult,
  action: AudienceAction,
): SegmentAudienceResult {
  switch (action.type) {
    case 'RESET':
      return { count: 0, sample: [], totalBase: 0, suppressed: 0 };
    case 'SET_RESULT':
      return action.payload;
    case 'KEEP_PREV':
      return state;
    default:
      return state;
  }
}

/**
 * Retorna a contagem de audiência, uma amostra de 5 contatos e
 * informações sobre a base total e suprimidos.
 *
 * - Debounce de 400 ms
 * - Cancela a chamada anterior (stale ref)
 * - Mantém o valor anterior enquanto calcula
 * - Condições incompletas ficam fora do cálculo
 */
export function useSegmentAudience(
  rules: SegmentRulesV2 | null | undefined,
  enabled = true,
): SegmentAudienceResult {
  const [result, dispatch] = useReducer(audienceReducer, {
    count: 0,
    sample: [],
    totalBase: 0,
    suppressed: 0,
  });

  const prevRef = useRef<SegmentAudienceResult>({
    count: 0,
    sample: [],
    totalBase: 0,
    suppressed: 0,
  });

  const staleRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAudience = useCallback(async (r: SegmentRulesV2) => {
    staleRef.current = false;

    try {
      const rpc = supabase.rpc as unknown as TalkXAudienceRpc;
      const payload = audienceRulesPayload(r);

      const [countData, sampleData] = await Promise.all([
        rpc('talkx_resolve_audience', {
          p_rules: payload,
          p_segment_ids: null,
          p_mode: 'count',
          p_limit: null,
          p_after: null,
        }),
        rpc('talkx_resolve_audience', {
          p_rules: payload,
          p_segment_ids: null,
          p_mode: 'sample',
          p_limit: 5,
          p_after: null,
        }),
      ]);

      if (staleRef.current) return;

      const countResult = (countData.data ?? {}) as { eligible?: number } | null;
      const sampleResult = (sampleData.data ?? {}) as {
        rows?: Array<{
          id: string;
          name: string;
          nickname: string | null;
          phone: string;
          company: string | null;
          avatar_url: string | null;
          contact_type: string | null;
          tags: string[] | null;
        }>;
        total_base?: number;
        suppressed?: number;
      } | null;

      const next: SegmentAudienceResult = {
        count: countResult?.eligible ?? 0,
        sample: (sampleResult?.rows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          nickname: row.nickname,
          phone: row.phone,
          company: row.company,
          avatar_url: row.avatar_url,
          contact_type: row.contact_type,
          tags: row.tags,
        })),
        totalBase: sampleResult?.total_base ?? 0,
        suppressed: sampleResult?.suppressed ?? 0,
      };

      prevRef.current = next;
      dispatch({ type: 'SET_RESULT', payload: next });
    } catch {
      // Silently ignore — keep previous value
    }
  }, []);

  useEffect(() => {
    if (!enabled || !rules) return;

    // Filter out incomplete rules before debounce
    const completeGroups = rules.groups.map((g) => ({
      ...g,
      rules: g.rules.filter(isRuleComplete),
    })).filter((g) => g.rules.length > 0);

    if (completeGroups.length === 0) {
      dispatch({ type: 'KEEP_PREV' });
      return;
    }

    const normalized = normalizeRules({ version: 2, join: rules.join, groups: completeGroups });

    // Debounce 400 ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchAudience(normalized);
    }, 400);

    return () => {
      staleRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [rules, enabled, fetchAudience]);

  // Reset to zero when rules become null or disabled — separate effect avoids
  // calling setState synchronously in the main fetch effect.
  useEffect(() => {
    if (!enabled || !rules) {
      dispatch({ type: 'RESET' });
    }
  }, [enabled, rules]);

  return result;
}