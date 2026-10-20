import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import { Sparkles, Loader2, Check, MessageCircle, HelpCircle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/ui/use-toast';
import { useAiRequestGeneration } from '@/lib/aiRequest/context';

/**
 * SL-063 — chips de tom da sugestão. Cada clique RE-GERA a sugestão pedindo o
 * tom ao endpoint. O `ai-suggest-reply` não tem campo `tone` (o schema não o
 * conhece e descartaria o campo em silêncio), então o tom viaja pelo `context`,
 * que é o campo de texto livre que o handler injeta no prompt do modelo.
 */
const TONE_CHIPS = [
  { key: 'mais-formal', label: 'Mais formal', prompt: 'Use tom mais formal, profissional e corporativo.' },
  { key: 'mais-casual', label: 'Mais casual', prompt: 'Use tom mais casual, leve e informal.' },
  { key: 'mais-curta', label: 'Mais curta', prompt: 'Seja mais curto: direto ao ponto, com menos palavras.' },
  { key: 'mais-detalhada', label: 'Mais detalhada', prompt: 'Traga mais detalhes e contexto, de forma completa e explicativa.' },
] as const;

type ToneChipKey = typeof TONE_CHIPS[number]['key'];

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'agent' | 'contact';
  timestamp: Date;
}

interface Suggestion {
  type: 'direct' | 'empathetic' | 'followup';
  text: string;
  emoji: string;
  source?: string | null;
}

interface AISuggestionsProps {
  messages: Message[];
  contactName: string;
  contactId?: string;
  onSelectSuggestion: (text: string) => void;
}

export function AISuggestions({ messages, contactName, contactId, onSelectSuggestion }: AISuggestionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeTone, setActiveTone] = useState<ToneChipKey | null>(null);
  const { toast } = useToast();

  // IA-048 — a sugestão pertence ao contato de origem. Sem reset por contato, a
  // sugestão do contato A sobrevive à troca e "Usar" insere o texto de A no
  // rascunho de B. A versão inclui só o contato (não há período aqui) e NUNCA
  // as mensagens vivas.
  const {
    begin: beginRequest,
    isCurrent: isRequestCurrent,
    invalidate: invalidateRequests,
  } = useAiRequestGeneration({ contactId: contactId ?? '', periodKey: 'current' });

  useEffect(() => {
    // Troca de contato invalida a requisição em voo e zera as sugestões do
    // contato anterior — o painel pode continuar aberto, mas nunca mostra nem
    // deixa "Usar" aplicar um texto que pertence a outro contato.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de estado ancorado na identidade do contato; o hook de geração já vive fora do React.
    invalidateRequests();
    setSuggestions([]);
    setIsLoading(false);
  }, [contactId, invalidateRequests]);

  useEffect(() => {
    // Desmontar (troca de aba) também descarta resposta que ainda não chegou.
    return () => { invalidateRequests(); };
  }, [invalidateRequests]);

  const fetchSuggestions = async (tone: ToneChipKey | null) => {
    if (messages.length === 0) {
      toast({
        title: "Sem mensagens",
        description: "É necessário ter mensagens na conversa para gerar sugestões.",
        variant: "destructive"
      });
      return;
    }

    const request = beginRequest();
    const previousTone = activeTone;
    setActiveTone(tone);
    setIsLoading(true);
    setIsOpen(true);

    // SL-063 — o tom pedido pelo chip entra no `context` (único campo de texto
    // livre que o `ai-suggest-reply` injeta no prompt). Sem tom, a requisição
    // sai exatamente como antes.
    const toneChip = tone ? TONE_CHIPS.find((chip) => chip.key === tone) : undefined;

    try {
      const { data, error } = await supabase.functions.invoke('ai-suggest-reply', {
        body: {
          messages: messages.slice(-10).map(m => ({
            content: m.content,
            sender: m.sender
          })),
          contactName,
          contactId,
          ...(toneChip ? { context: `Tom da sugestão — ${toneChip.label}: ${toneChip.prompt}` } : {}),
          // IA-051 — o id do clique (IA-048) viaja junto para o log de consumo
          // poder responder de qual requisição veio o gasto. É uuid opaco: nada
          // de conteúdo de conversa nem de contato.
          requestId: request.requestId,
        }
      });

      // IA-048 — checagem DEPOIS do await: resposta de contato antigo é descartada.
      if (!isRequestCurrent(request)) return;
      if (error) throw error;

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (err) {
      if (!isRequestCurrent(request)) return;
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error fetching suggestions:', error);
      // Geração falhou: o chip não pode continuar marcado como se o tom tivesse
      // sido aplicado na tela.
      setActiveTone(previousTone);
      toast({
        title: "Erro ao gerar sugestões",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive"
      });
      setIsOpen(false);
    } finally {
      if (isRequestCurrent(request)) setIsLoading(false);
    }
  };

  const handleSelect = (text: string) => {
    onSelectSuggestion(text);
    setIsOpen(false);
    setSuggestions([]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'direct': return <Check className="h-4 w-4" />;
      case 'empathetic': return <MessageCircle className="h-4 w-4" />;
      case 'followup': return <HelpCircle className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const getLabel = (type: string) => {
    switch (type) {
      case 'direct': return 'Direta';
      case 'empathetic': return 'Empática';
      case 'followup': return 'Follow-up';
      default: return type;
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => fetchSuggestions(null)}
        disabled={isLoading}
        className="relative text-primary hover:text-primary/80 hover:bg-primary/10"
        title="Sugestões de IA"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full right-0 mb-2 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
          >
             <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Copilot IA</span>
                <Badge variant="secondary" className="text-3xs">KB</Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-2 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Gerando sugestões...</span>
                  </div>
                </div>
              ) : suggestions.length > 0 ? (
                <div className="space-y-2">
                  {suggestions.map((suggestion, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleSelect(suggestion.text)}
                      className="w-full text-left p-3 rounded-lg bg-background hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-primary">{getIcon(suggestion.type)}</span>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {getLabel(suggestion.type)}
                        </span>
                        <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary">
                          Usar ↵
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-3">
                        {suggestion.emoji} {suggestion.text}
                      </p>
                      {suggestion.source && (
                        <p className="text-3xs text-primary/70 mt-1 flex items-center gap-1">
                          📚 Fonte: {suggestion.source}
                        </p>
                      )}
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Clique para gerar sugestões
                </div>
              )}
            </div>

            {suggestions.length > 0 && (
              // SL-063 — rodapé de tons: cada chip re-gera a sugestão pedindo o
              // tom ao endpoint (não é reescrita local). Sem sugestão na tela
              // não há o que regenerar, então o rodapé só aparece com resultado.
              <div
                role="group"
                aria-label="Tom da sugestão"
                className="flex flex-wrap items-center gap-1.5 p-2 border-t border-border bg-muted/20"
              >
                {TONE_CHIPS.map((chip) => {
                  const isActive = activeTone === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      aria-pressed={isActive}
                      disabled={isLoading}
                      onClick={() => fetchSuggestions(isActive ? null : chip.key)}
                      className={`h-7 px-2.5 rounded-lg border text-xs transition-colors ${
                        isActive
                          ? 'border-primary bg-primary text-primary-foreground font-medium'
                          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
