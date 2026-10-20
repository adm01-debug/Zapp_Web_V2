import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('AIEnhanceButton');
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { Sparkles, Loader2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';

interface ToneOption {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

const toneOptions: ToneOption[] = [
  { id: 'professional', label: 'Profissional', emoji: '💼', description: 'Formal e corporativo' },
  { id: 'casual', label: 'Casual', emoji: '😊', description: 'Amigável e descontraído' },
  { id: 'persuasive', label: 'Persuasivo', emoji: '🎯', description: 'Convincente e impactante' },
  { id: 'empathetic', label: 'Empático', emoji: '💛', description: 'Acolhedor e compreensivo' },
  { id: 'concise', label: 'Conciso', emoji: '⚡', description: 'Direto e objetivo' },
  { id: 'detailed', label: 'Detalhado', emoji: '📝', description: 'Completo e explicativo' },
];

interface AIEnhanceButtonProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  contactName?: string;
}

export function AIEnhanceButton({ inputValue, onInputChange, contactName }: AIEnhanceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  // Desfazer guarda o par (texto do clique, texto aplicado). O ref do rascunho
  // vivo compara se o campo ainda contém exatamente o que a aplicação escreveu:
  // nem a resposta atrasada nem o desfazer podem apagar uma edição mais nova
  // (R2-INF-025).
  const [desfazer, setDesfazer] = useState<{ original: string; aplicado: string } | null>(null);
  const rascunhoAtual = useRef(inputValue);
  useLayoutEffect(() => { rascunhoAtual.current = inputValue; }, [inputValue]);

  const handleEnhance = useCallback(async (tone: string) => {
    const textoDoClique = inputValue;
    if (!textoDoClique.trim()) {
      toast({ title: 'Digite uma mensagem primeiro', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setIsOpen(false);

    try {
      const { data, error } = await supabase.functions.invoke('ai-enhance-message', {
        body: { message: textoDoClique, tone, contactName },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.enhanced) {
        // Resposta de uma versão antiga do rascunho: descartar preserva a edição
        // mais nova do mesmo rascunho.
        if (rascunhoAtual.current !== textoDoClique) {
          toast({
            title: 'A mensagem mudou durante o aprimoramento',
            description: 'O resultado antigo foi descartado para preservar sua edição.',
          });
          return;
        }
        onInputChange(data.enhanced);
        setDesfazer({ original: textoDoClique, aplicado: data.enhanced });
        toast({
          title: '✨ Mensagem aprimorada!',
          description: 'Clique em ↩ para desfazer',
        });
      }
    } catch (err) {
      log.error('AI enhance error:', err);
      setDesfazer(null);
      toast({
        title: 'Erro ao aprimorar mensagem',
        description: err instanceof Error ? err.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, onInputChange, contactName]);

  const handleUndo = useCallback(() => {
    if (!desfazer) return;
    // O campo já foi editado depois do aprimoramento: restaurar o original aqui
    // trocaria a edição nova por um rascunho anterior, então o desfazer é descartado.
    if (rascunhoAtual.current !== desfazer.aplicado) {
      setDesfazer(null);
      toast({
        title: 'A mensagem foi editada',
        description: 'O desfazer foi descartado para não sobrescrever sua edição.',
      });
      return;
    }
    onInputChange(desfazer.original);
    setDesfazer(null);
    toast({ title: 'Mensagem original restaurada' });
  }, [desfazer, onInputChange]);

  return (
    <div className="flex items-center gap-0.5">
      {/* Undo button */}
      <AnimatePresence>
        {desfazer !== null && !isLoading && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Desfazer aprimoramento"
                  className="w-8 h-8 text-warning hover:text-warning hover:bg-warning/10"
                  onClick={handleUndo}
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Desfazer aprimoramento</TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhance button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Aprimorar mensagem com IA"
                  disabled={isLoading || !inputValue.trim()}
                  className={cn(
                    "w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10",
                    isLoading && "animate-pulse text-primary"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </Button>
              </motion.div>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Aprimorar mensagem com IA</TooltipContent>
        </Tooltip>

        <PopoverContent className="w-64 p-2" align="start" side="top">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1">
              ✨ Escolha o tom da mensagem
            </p>
            {toneOptions.map((tone) => (
              <motion.button
                key={tone.id}
                whileHover={{ x: 4 }}
                onClick={() => handleEnhance(tone.id)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors text-left"
              >
                <span className="text-lg">{tone.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{tone.label}</p>
                  <p className="text-xs text-muted-foreground">{tone.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
