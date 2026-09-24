import { memo, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Copy, Check, RefreshCw, Loader2, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface AIResponseCardProps {
  response: string;
  onUse?: (text: string) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export const AIResponseCard = memo(function AIResponseCard({
  response,
  onUse,
  onRegenerate,
  isRegenerating,
}: AIResponseCardProps) {
  const [copied, setCopied] = useState(false);

  const wordCount = useMemo(() => response.trim().split(/\s+/).filter(Boolean).length, [response]);

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    toast.success('Copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUse = () => {
    onUse?.(response);
    toast.success('Resposta inserida no chat!');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-2.5 p-3 rounded-xl bg-primary/5 border border-primary/20"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-primary" />
        <span className="text-3xs font-semibold text-primary">Resposta sugerida</span>
      </div>

      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{response}</p>

      <div className="flex items-center justify-between pt-1.5 border-t border-primary/10">
        <span className="text-[9px] text-muted-foreground tabular-nums">
          {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'} · {response.length} chars
        </span>
        <div className="flex items-center gap-1">
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-3xs font-medium gap-1 px-2 text-muted-foreground hover:text-foreground rounded-full"
              onClick={onRegenerate}
              disabled={isRegenerating}
              title="Regenerar resposta"
            >
              {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Reescrever
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-3xs font-medium gap-1 px-2 text-muted-foreground hover:text-foreground rounded-full"
            onClick={handleCopy}
            title="Copiar resposta"
          >
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          {onUse && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-3xs font-medium gap-1.5 px-4 rounded-full"
              onClick={handleUse}
            >
              <Send className="w-3 h-3" />
              Usar
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
});
