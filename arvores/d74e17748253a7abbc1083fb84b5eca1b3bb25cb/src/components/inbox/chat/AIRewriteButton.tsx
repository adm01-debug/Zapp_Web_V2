import { useState } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('AIRewriteButton');
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, Briefcase, MessageCircle, Target, Heart, Scissors, BookOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const tones = [
  { id: 'professional', label: 'Profissional', icon: Briefcase, description: 'Formal e corporativo' },
  { id: 'casual', label: 'Casual', icon: MessageCircle, description: 'Amigável e descontraído' },
  { id: 'persuasive', label: 'Persuasivo', icon: Target, description: 'Impactante e convincente' },
  { id: 'empathetic', label: 'Empático', icon: Heart, description: 'Acolhedor e compreensivo' },
  { id: 'concise', label: 'Conciso', icon: Scissors, description: 'Direto ao ponto' },
  { id: 'detailed', label: 'Detalhado', icon: BookOpen, description: 'Completo e explicativo' },
] as const;

interface AIRewriteButtonProps {
  inputValue: string;
  onRewrite: (newText: string) => void;
  contactName?: string;
}

export function AIRewriteButton({ inputValue, onRewrite, contactName }: AIRewriteButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTone, setLoadingTone] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleRewrite = async (tone: string) => {
    if (!inputValue.trim()) {
      toast.warning('Digite uma mensagem primeiro para reescrever com IA.');
      return;
    }

    setIsLoading(true);
    setLoadingTone(tone);

    try {
      const { data, error } = await supabase.functions.invoke('ai-enhance-message', {
        body: { message: inputValue, tone, contactName },
      });

      if (error) throw error;

      if (data?.enhanced) {
        onRewrite(data.enhanced);
        setIsOpen(false);
        toast.success('Mensagem reescrita com IA!');
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      log.error('AI rewrite error:', err);
      toast.error('Erro ao reescrever mensagem. Tente novamente.');
    } finally {
      setIsLoading(false);
      setLoadingTone(null);
    }
  };

  const hasText = inputValue.trim().length > 0;

  return (
    <Tooltip>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-9 h-9 shrink-0 transition-colors",
                hasText
                  ? "text-primary hover:text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-label="Reescrever com IA"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : (
                <Sparkles className="w-[18px] h-[18px]" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Reescrever com IA</TooltipContent>
      <PopoverContent className="w-64 p-2 bg-popover border-border" align="end" side="top">
        <div className="px-2 py-1.5 mb-1">
          <h4 className="text-sm font-medium text-foreground">✨ Reescrever com IA</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Escolha o tom da mensagem</p>
        </div>
        <div className="space-y-0.5">
          {tones.map((tone) => {
            const Icon = tone.icon;
            const isToneLoading = loadingTone === tone.id;
            return (
              <button
                key={tone.id}
                onClick={() => handleRewrite(tone.id)}
                disabled={isLoading || !hasText}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors",
                  "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
                  isToneLoading && "bg-primary/10"
                )}
              >
                {isToneLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                ) : (
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground block">{tone.label}</span>
                  <span className="text-2xs text-muted-foreground">{tone.description}</span>
                </div>
              </button>
            );
          })}
        </div>
        {!hasText && (
          <p className="text-2xs text-warning text-center mt-2 px-2">
            Digite uma mensagem primeiro
          </p>
        )}
      </PopoverContent>
      </Popover>
    </Tooltip>
  );
}
