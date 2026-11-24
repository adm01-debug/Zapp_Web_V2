/**
 * CV-102 — painel de análise de imagem (multimodal).
 *
 * A Edge `ai-multimodal-analysis` está em produção, mas o hook `useImageAnalysis`
 * só era exportado pelo barrel (`src/hooks/copilot/index.ts`): nenhum componente
 * o chamava, então o recurso não existia para o vendedor. Este painel é o
 * consumidor — recebe as imagens que o cliente mandou na conversa e mostra
 * descrição, texto extraído, cores, elementos, oportunidade de branding e a
 * resposta sugerida para o agente.
 */
import { useState } from 'react';
import { AlertCircle, Copy, ImageOff, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useImageAnalysis } from '@/hooks/copilot';
import { log } from '@/lib/logger';

export interface ConversationImage {
  /** URL da imagem no storage da conversa. */
  url: string;
  /** Rótulo humano (quem mandou e quando). */
  label: string;
}

export interface ImageAnalysisPanelProps {
  images: ConversationImage[];
  /** Contexto da conversa já mascarado; a Edge limita a 1000 caracteres. */
  conversationContext?: string;
}

export function ImageAnalysisPanel({ images, conversationContext }: ImageAnalysisPanelProps) {
  // Imagem escolhida pelo vendedor; se ela sair da conversa, a primeira assume.
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const selecionada = images.some((i) => i.url === escolhida) ? (escolhida as string) : (images[0]?.url ?? '');
  const {
    description,
    extractedText,
    dominantColors,
    keyElements,
    brandingOpportunity,
    suggestedReply,
    confidence,
    isLoading,
    error,
    analyze,
  } = useImageAnalysis();

  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 p-3">
        <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">Nenhuma imagem nesta conversa para analisar</p>
      </div>
    );
  }

  const temResultado = description !== '' || suggestedReply !== '';

  const copiarResposta = async () => {
    try {
      await navigator.clipboard.writeText(suggestedReply);
      toast.success('Resposta sugerida copiada');
    } catch (err) {
      log.warn('Nao foi possivel copiar a resposta sugerida', { erro: String(err) });
      toast.error('Nao foi possivel copiar');
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-xs font-semibold text-foreground">Análise de imagem</h3>
      </div>

      {images.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Imagens da conversa">
          {images.map((img) => (
            <button
              key={img.url}
              type="button"
              aria-pressed={img.url === selecionada}
              onClick={() => setEscolhida(img.url)}
              className={`h-12 w-12 overflow-hidden rounded-lg border transition-colors ${
                img.url === selecionada ? 'border-primary ring-2 ring-primary/40' : 'border-border/60 hover:border-primary/50'
              }`}
              title={img.label}
            >
              <img src={img.url} alt={img.label} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <Button
        size="sm"
        variant={temResultado ? 'outline' : 'default'}
        className="w-full gap-2 rounded-xl text-xs"
        disabled={isLoading || selecionada === ''}
        onClick={() => analyze(selecionada, conversationContext?.slice(0, 1000))}
      >
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {isLoading ? 'Analisando imagem...' : temResultado ? 'Analisar outra imagem' : 'Analisar imagem'}
      </Button>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {temResultado && !isLoading && (
        <div className="space-y-3" aria-live="polite">
          <div className="space-y-1">
            <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">O que a imagem mostra</p>
            <p className="text-xs leading-relaxed text-foreground">{description}</p>
          </div>

          {extractedText.length > 0 && (
            <div className="space-y-1">
              <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Texto visível</p>
              <ul className="list-inside list-disc text-xs text-foreground">
                {extractedText.map((t, i) => (
                  <li key={`${t}-${i}`}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {dominantColors.length > 0 && (
            <div className="space-y-1">
              <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Cores dominantes</p>
              <div className="flex flex-wrap gap-2">
                {dominantColors.map((cor, i) => (
                  <span key={`${cor}-${i}`} className="flex items-center gap-1.5 text-xs text-foreground">
                    <span className="h-3 w-3 rounded-full border border-border/60" style={{ backgroundColor: cor }} aria-hidden="true" />
                    {cor}
                  </span>
                ))}
              </div>
            </div>
          )}

          {keyElements.length > 0 && (
            <div className="space-y-1">
              <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Elementos-chave</p>
              <div className="flex flex-wrap gap-1.5">
                {keyElements.map((e, i) => (
                  <span key={`${e}-${i}`} className="rounded-full bg-muted/60 px-2 py-0.5 text-3xs text-foreground">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {brandingOpportunity !== '' && (
            <div className="space-y-1">
              <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Oportunidade de brinde</p>
              <p className="text-xs leading-relaxed text-foreground">{brandingOpportunity}</p>
            </div>
          )}

          {suggestedReply !== '' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">Resposta sugerida</p>
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-3xs" onClick={copiarResposta}>
                  <Copy className="h-3 w-3" />
                  Copiar
                </Button>
              </div>
              <p className="rounded-lg bg-muted/50 p-2 text-xs leading-relaxed text-foreground">{suggestedReply}</p>
            </div>
          )}

          <p className="text-3xs text-muted-foreground">Confiança da análise: {Math.round(confidence * 100)}%</p>
        </div>
      )}
    </div>
  );
}