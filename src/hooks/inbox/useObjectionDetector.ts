import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type ToneKey, getTonePrompt } from '@/components/inbox/ai-tools/ToneSelector';
import { usePeriodFilter } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import { buildPeriodKey, useAiRequestGeneration } from '@/lib/aiRequest/context';

interface Objection {
  objection: string;
  counterArgument: string;
  confidence: number;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  created_at?: string;
}

export function useObjectionDetector(
  contactId: string,
  contactName: string | undefined,
  lastMessages: string[],
  allMessages: ChatMessage[],
) {
  const [objections, setObjections] = useState<Objection[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [selectedTone, setSelectedTone] = useState<ToneKey>('friendly');
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const lastCallRef = useRef(0);

  const normalized = useMemo(() =>
    allMessages.map(m => ({ ...m, created_at: m.created_at || m.timestamp })),
    [allMessages]
  );

  const hasPeriodMessages = normalized.length > 0;

  const periodFilter = usePeriodFilter(normalized, 'all');
  const { analysisPeriod: objectionPeriod, customDateFrom: objectionFrom, customDateTo: objectionTo } = periodFilter;

  // IA-048 — identidade da requisição: contato + período ESCOLHIDO. Não deriva das
  // mensagens vivas, senão uma mensagem nova invalidaria a análise em voo.
  const {
    begin: beginRequest,
    snapshot: snapshotRequest,
    isCurrent: isRequestCurrent,
    invalidate: invalidateRequests,
  } = useAiRequestGeneration({
    contactId,
    periodKey: buildPeriodKey(objectionPeriod, objectionFrom, objectionTo),
  });

  const clientMessages = useMemo(() => {
    if (!hasPeriodMessages) return lastMessages;
    return periodFilter.filteredMessages
      .filter(m => m.sender !== 'agent' && m.content && m.content.trim().length > 0)
      .map(m => m.content);
  }, [hasPeriodMessages, periodFilter.filteredMessages, lastMessages]);

  useEffect(() => {
    // Troca de contato: descarta resposta em voo e zera o estado do contato anterior.
    invalidateRequests();
    setAnalyzed(false); setObjections([]); setError(null); setRewritingIdx(null); setCopiedIdx(null); setSelectedTone('friendly'); setLoading(false);
  }, [contactId, invalidateRequests]);

  useEffect(() => {
    // Troca de período: descarta resposta em voo e zera o resultado do recorte antigo.
    invalidateRequests();
    setAnalyzed(false); setObjections([]); setError(null); setLoading(false);
  }, [objectionPeriod, objectionFrom, objectionTo, invalidateRequests]);

  const analyze = useCallback(async (tone?: ToneKey) => {
    if (clientMessages.length === 0) { toast.warning('Nenhuma mensagem do cliente para analisar.'); return; }
    const now = Date.now();
    if (now - lastCallRef.current < 3000) { toast.warning('Aguarde alguns segundos antes de tentar novamente.'); return; }
    lastCallRef.current = now;
    const request = beginRequest();
    setLoading(true); setError(null);
    const activeTone = tone ?? selectedTone;
    const activePrompt = getTonePrompt(activeTone);

    try {
      const response = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            {
              role: 'system',
              content: `Você é um especialista em inteligência comercial e negociação de uma empresa distribuidora/comercial.

CONTEXTO DO NEGÓCIO — Identifique o tipo de conversa:
• VENDAS: Vendedor ↔ cliente — objeções de preço, prazo, quantidade, condições.
• COMPRAS: Comprador ↔ fornecedor — resistências em negociação de custos, prazos de entrega, MOQ.
• LOGÍSTICA: Logística ↔ transportadora — objeções sobre frete, prazo de coleta, restrições.
• RH: RH ↔ colaborador — resistências sobre políticas, benefícios, procedimentos.
• FINANCEIRO: Cobranças — objeções de pagamento, contestações, renegociações.
• SAC: Reclamações — insatisfação, devoluções, garantia.

Analise as mensagens e identifique objeções/resistências do interlocutor. Para cada uma, sugira um contra-argumento persuasivo e adequado ao contexto do departamento.
${contactName ? `IMPORTANTE: O nome do contato é "${contactName.split(' ')[0]}". TODA resposta (counterArgument) DEVE começar mencionando o nome do contato de forma natural (ex: "${contactName.split(' ')[0]}, entendo sua preocupação..." ou "${contactName.split(' ')[0]}, compreendo perfeitamente..."). Isso é OBRIGATÓRIO para humanizar o atendimento.` : ''}
${activePrompt}
Responda APENAS em JSON válido com este formato:
[{"objection":"texto da objeção","counterArgument":"sugestão de resposta","confidence":0.85}]
Se não houver objeções, retorne []`,
            },
            { role: 'user', content: `Mensagens do cliente:\n${clientMessages.join('\n')}` },
          ],
          model: 'google/gemini-3-flash-preview',
          // IA-051 — o id do clique (IA-048) para o log de consumo do `ai-proxy`.
          requestId: request.requestId,
        },
      });

      // IA-048 — checagem DEPOIS do await: objeções de contato/período antigos
      // não são aplicadas nem disparam toast na tela atual.
      if (!isRequestCurrent(request)) return;

      if (response.error) throw new Error(response.error.message || 'Erro na API');
      const content = response.data?.content || response.data?.choices?.[0]?.message?.content || '[]';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed)) throw new Error('Resposta inválida da IA');
        const valid = parsed.filter((o: unknown) => {
          if (typeof o !== 'object' || o === null) return false;
          const obj = o as Record<string, unknown>;
          return typeof obj.objection === 'string' && typeof obj.counterArgument === 'string';
        }).map((o: Record<string, unknown>) => ({
          objection: String(o.objection),
          counterArgument: String(o.counterArgument),
          confidence: typeof o.confidence === 'number' ? Math.min(1, Math.max(0, o.confidence)) : 0.5,
        }));
        setObjections(valid);
        if (valid.length > 0) toast.success(`${valid.length} objeção(ões) detectada(s)!`);
      } else {
        setObjections([]);
      }
    } catch (err) {
      if (!isRequestCurrent(request)) return;
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(msg); setObjections([]);
      toast.error('Falha ao analisar objeções. Tente novamente.');
    }
    if (!isRequestCurrent(request)) return;
    setAnalyzed(true); setLoading(false);
  }, [beginRequest, clientMessages, contactName, isRequestCurrent, selectedTone]);

  const rewriteSingle = useCallback(async (idx: number) => {
    const target = objections[idx];
    if (!target) return;
    const request = snapshotRequest();
    setRewritingIdx(idx);
    const activePrompt = getTonePrompt(selectedTone);
    try {
      const response = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            { role: 'system', content: `Reescreva o contra-argumento abaixo mantendo o mesmo significado mas mudando o tom. ${activePrompt}${contactName ? ` IMPORTANTE: A resposta DEVE começar com o nome "${contactName.split(' ')[0]}" de forma natural e humana.` : ''} Responda APENAS com o texto reescrito, sem aspas ou explicações.` },
            { role: 'user', content: target.counterArgument },
          ],
          model: 'google/gemini-3-flash-preview',
          // IA-051 — reescrita é requisição derivada (`snapshotRequest`): id próprio,
          // mesma geração do clique original.
          requestId: request.requestId,
        },
      });
      // IA-048 — descarta reescrita de contato/período antigo. O índice pode
      // apontar para um array já trocado: reancoramos pelo texto original.
      if (!isRequestCurrent(request)) return;
      const content = response.data?.content || response.data?.choices?.[0]?.message?.content;
      if (content) {
        const rewritten = content.trim();
        setObjections(prev => {
          const currentIdx = prev.findIndex((o) => o.counterArgument === target.counterArgument);
          if (currentIdx === -1) return prev;
          return prev.map((o, i) => (i === currentIdx ? { ...o, counterArgument: rewritten } : o));
        });
        toast.success('Resposta reescrita!');
      }
    } catch {
      if (!isRequestCurrent(request)) return;
      toast.error('Erro ao reescrever. Tente novamente.');
    }
    if (isRequestCurrent(request)) setRewritingIdx(null);
  }, [contactName, isRequestCurrent, objections, selectedTone, snapshotRequest]);

  const handleSelect = useCallback((text: string, onSelectSuggestion?: (text: string) => void) => {
    onSelectSuggestion?.(text);
    toast.success('Resposta inserida no chat!');
  }, []);

  const handleCopy = useCallback((text: string, idx: number) => {
    void navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success('Copiado!');
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  const resetAnalysis = useCallback(() => {
    setAnalyzed(false); setError(null);
  }, []);

  return {
    objections, loading, analyzed, selectedTone, setSelectedTone,
    rewritingIdx, error, copiedIdx,
    hasPeriodMessages, clientMessages,
    periodFilter,
    analyze, rewriteSingle, handleSelect, handleCopy, resetAnalysis,
  };
}
