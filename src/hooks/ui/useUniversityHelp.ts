import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ToneKey, getTonePrompt } from '@/components/inbox/ai-tools/ToneSelector';
import { usePeriodFilter } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import { buildPeriodKey, useAiRequestGeneration } from '@/lib/aiRequest/context';

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  created_at?: string;
}

type FilterMode = 'all' | 'client' | 'agent';

function normalizeMessages(messages: ChatMessage[]) {
  return messages.map(m => ({
    ...m,
    created_at: m.created_at || m.timestamp,
  }));
}

export function useUniversityHelp(contactId: string, contactName: string | undefined, messages: ChatMessage[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<ToneKey>('friendly');
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const lastCallRef = useRef(0);
  // Requisições em voo: o spinner só sai quando a requisição vigente termina ou
  // quando não sobrou nenhuma em voo (a resposta descartada ainda limpa o loading).
  const inFlightRef = useRef(0);

  const normalized = useMemo(() => normalizeMessages(messages), [messages]);

  const periodFilter = usePeriodFilter(normalized, 'all');
  const { analysisPeriod, customDateFrom, customDateTo } = periodFilter;

  // IA-048 — identidade da requisição: contato + período ESCOLHIDO. Não deriva
  // das mensagens vivas, senão uma mensagem nova invalidaria a resposta em voo.
  const {
    begin: beginRequest,
    isCurrent: isRequestCurrent,
    invalidate: invalidateRequests,
  } = useAiRequestGeneration({
    contactId,
    periodKey: buildPeriodKey(analysisPeriod, customDateFrom, customDateTo),
  });

  const recentMessages = useMemo(() => {
    return periodFilter.filteredMessages
      .filter(m => m.content && m.content.trim().length > 0)
      .slice(-30)
      .reverse();
  }, [periodFilter.filteredMessages]);

  const filteredMessages = useMemo(() => {
    if (filterMode === 'client') return recentMessages.filter(m => m.sender !== 'agent');
    if (filterMode === 'agent') return recentMessages.filter(m => m.sender === 'agent');
    return recentMessages;
  }, [recentMessages, filterMode]);

  const selectedInOrder = useMemo(() => {
    return normalized.filter(m => selectedIds.has(m.id));
  }, [normalized, selectedIds]);

  // Reset on contact change
  useEffect(() => {
    setSelectedIds(new Set());
    setResponse(null);
    setError(null);
    setSelectedTone('friendly');
    setFilterMode('all');
  }, [contactId]);

  // Clear selection when period changes
  useEffect(() => {
    setSelectedIds(new Set());
    setResponse(null);
    setError(null);
  }, [periodFilter.analysisPeriod, periodFilter.customDateFrom, periodFilter.customDateTo]);

  // IA-048 — troca de contato/período descarta a resposta de IA em voo: a geração
  // é invalidada antes que qualquer callback assíncrono pendente termine. Efeito
  // sem `setState` (os resets de estado continuam nos dois efeitos acima): aqui só
  // se marca a requisição em voo como obsoleta.
  useEffect(() => {
    invalidateRequests();
  }, [contactId, analysisPeriod, customDateFrom, customDateTo, invalidateRequests]);

  const toggleMessage = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === filteredMessages.length && filteredMessages.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMessages.map(m => m.id)));
    }
  }, [selectedIds.size, filteredMessages]);

  const generateResponse = useCallback(async (toneOverride?: ToneKey) => {
    const tone = toneOverride ?? selectedTone;
    if (selectedIds.size === 0) {
      toast.warning('Selecione pelo menos uma mensagem.');
      return;
    }
    const now = Date.now();
    if (now - lastCallRef.current < 3000) {
      toast.warning('Aguarde alguns segundos antes de tentar novamente.');
      return;
    }
    lastCallRef.current = now;
    const request = beginRequest();
    inFlightRef.current += 1;
    setLoading(true);
    setResponse(null);
    setError(null);
    const tonePrompt = getTonePrompt(tone);
    try {
      const result = await supabase.functions.invoke('ai-proxy', {
        body: {
          messages: [
            {
              role: 'system',
              content: `Você é um assistente especialista em comunicação empresarial de uma empresa distribuidora/comercial.\n\nCONTEXTO DO NEGÓCIO — Identifique o tipo de conversa e adapte a resposta:\n• VENDAS: Vendedor ↔ cliente — tom comercial, foco em solução e fechamento.\n• COMPRAS: Comprador ↔ fornecedor — tom negociador, foco em condições e prazos.\n• LOGÍSTICA: Logística ↔ transportadora — tom operacional, foco em eficiência.\n• RH: RH ↔ colaborador — tom institucional e acolhedor.\n• FINANCEIRO: Tom profissional, foco em resolução financeira.\n• SAC: Tom empático, foco em satisfação e resolução.\n\nAnalise as mensagens selecionadas e crie uma resposta inteligente e adequada ao contexto do departamento identificado.\n${contactName ? `IMPORTANTE: O nome do contato é "${contactName.split(' ')[0]}". A resposta DEVE começar mencionando o nome de forma natural e humana (ex: "${contactName.split(' ')[0]}, entendo sua dúvida..." ou "${contactName.split(' ')[0]}, vou te ajudar com isso..."). Isso é OBRIGATÓRIO.` : ''}\n${tonePrompt}\nConsidere o contexto completo das mensagens selecionadas. Crie UMA resposta pronta para envio, sem explicações adicionais ou meta-comentários. A resposta deve ser direta e natural.`,
            },
            {
              role: 'user',
              content: `Mensagens selecionadas da conversa:\n${selectedInOrder.map(m => `[${m.sender === 'agent' ? 'Atendente' : 'Cliente'}]: ${m.content}`).join('\n')}`,
            },
          ],
          model: 'google/gemini-3-flash-preview',
          // IA-051 — o id do clique (IA-048) para o log de consumo do `ai-proxy`.
          requestId: request.requestId,
        },
      });
      // IA-048 — a resposta só vale se contato/período ainda forem os do clique.
      // A checagem vem DEPOIS do await, que é onde a resposta chega: texto gerado
      // para o período antigo não é aplicado nem dispara toast na tela atual.
      if (!isRequestCurrent(request)) return;

      if (result.error) throw new Error(result.error.message || 'Erro na API');
      const content = result.data?.content || result.data?.choices?.[0]?.message?.content;
      if (content && content.trim().length > 0) {
        setResponse(content.trim());
        toast.success('Resposta gerada com sucesso!');
      } else {
        throw new Error('Resposta vazia da IA');
      }
    } catch (err) {
      if (!isRequestCurrent(request)) return;
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(msg);
      setResponse(null);
      toast.error('Falha ao gerar resposta. Tente novamente.');
    } finally {
      // O spinner (IA-048) só sai quando a requisição ainda é a vigente ou quando
      // não sobrou nenhuma em voo: a resposta descartada não deixa o loading preso.
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      if (isRequestCurrent(request) || inFlightRef.current === 0) setLoading(false);
    }
  }, [beginRequest, isRequestCurrent, selectedIds, selectedInOrder, selectedTone, contactName]);

  const handleRegenerate = useCallback(() => {
    setResponse(null);
    setError(null);
    generateResponse();
  }, [generateResponse]);

  return {
    selectedIds,
    loading,
    response,
    selectedTone,
    setSelectedTone,
    error,
    filterMode,
    setFilterMode,
    filteredMessages,
    periodFilter,
    toggleMessage,
    selectAll,
    generateResponse,
    handleRegenerate,
    lastCallRef,
  };
}
