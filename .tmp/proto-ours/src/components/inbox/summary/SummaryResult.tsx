import { motion, AnimatePresence } from 'framer-motion';
import { Headphones, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SummaryData {
  summary: string;
  keyPoints: string[];
  nextSteps?: string[];
}

interface SummaryResultProps {
  summary: SummaryData;
  isTtsPlaying: boolean;
  isTtsLoading: boolean;
  lastTtsText: string | null;
  onPlayTts: (text: string) => void;
  buildFullNarrationText: () => string;
}

function TtsButton({ text, label, pauseLabel, loadingLabel, isTtsPlaying, isTtsLoading, lastTtsText, onPlayTts }: {
  text: string; label: string; pauseLabel: string; loadingLabel: string; isTtsPlaying: boolean; isTtsLoading: boolean; lastTtsText: string | null; onPlayTts: (t: string) => void;
}) {
  // O nome acessível acompanha o estado: quem usa leitor de tela ouve "Pausar..."
  // quando este texto está tocando, ou o rótulo de carregamento dedicado enquanto
  // o áudio carrega — sem derivar conjugação do rótulo de reprodução.
  const isActive = isTtsPlaying && lastTtsText === text;
  const isBusy = isTtsLoading && lastTtsText === text;
  const accessibleName = isBusy ? loadingLabel : isActive ? pauseLabel : label;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} className="h-6 w-6 shrink-0" onClick={() => onPlayTts(text)} disabled={isTtsLoading}>
            {isTtsPlaying && lastTtsText === text ? <VolumeX className="h-3.5 w-3.5 text-primary" />
              : isTtsLoading && lastTtsText === text ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              : <Volume2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SummaryResult({ summary, isTtsPlaying, isTtsLoading, lastTtsText, onPlayTts, buildFullNarrationText }: SummaryResultProps) {
  // WCAG 2.5.3 (nome na etiqueta): o nome acessível do "Ouvir Tudo" começa com o
  // texto visível do botão ("Ouvir Tudo"/"Parar"), seguido da descrição estendida.
  const ouvirTudoLabel = isTtsPlaying
    ? 'Parar — interromper a leitura do resumo completo'
    : isTtsLoading
      ? 'Ouvir Tudo — carregando a leitura do resumo completo'
      : 'Ouvir Tudo — ouvir o resumo completo em voz alta';
  return (
    <AnimatePresence>
      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }} className="space-y-4 overflow-hidden">
        <div className="flex justify-end">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-2xs"
                  aria-label={ouvirTudoLabel}
                  onClick={() => onPlayTts(buildFullNarrationText())} disabled={isTtsLoading}>
                  {isTtsPlaying ? <><VolumeX className="h-3.5 w-3.5" />Parar</> : <><Headphones className="h-3.5 w-3.5" />Ouvir Tudo</>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{ouvirTudoLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-medium text-muted-foreground">Resumo</h4>
            <TtsButton text={summary.summary} label="Ouvir o resumo em voz alta" pauseLabel="Pausar a leitura do resumo" loadingLabel="Carregando a leitura do resumo" isTtsPlaying={isTtsPlaying} isTtsLoading={isTtsLoading} lastTtsText={lastTtsText} onPlayTts={onPlayTts} />
          </div>
          <p className="text-sm">{summary.summary}</p>
        </div>

        {summary.keyPoints.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-muted-foreground">Pontos-chave</h4>
              <TtsButton text={'Pontos-chave: ' + summary.keyPoints.join('. ')} label="Ouvir os pontos-chave em voz alta" pauseLabel="Pausar a leitura dos pontos-chave" loadingLabel="Carregando a leitura dos pontos-chave" isTtsPlaying={isTtsPlaying} isTtsLoading={isTtsLoading} lastTtsText={lastTtsText} onPlayTts={onPlayTts} />
            </div>
            <ul className="space-y-1">
              {summary.keyPoints.map((point, index) => (
                <li key={index} className="text-sm flex items-start gap-2"><span className="text-primary mt-1">•</span><span>{point}</span></li>
              ))}
            </ul>
          </div>
        )}

        {summary.nextSteps && summary.nextSteps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-muted-foreground">Próximos passos</h4>
              <TtsButton text={'Próximos passos: ' + summary.nextSteps.join('. ')} label="Ouvir os próximos passos em voz alta" pauseLabel="Pausar a leitura dos próximos passos" loadingLabel="Carregando a leitura dos próximos passos" isTtsPlaying={isTtsPlaying} isTtsLoading={isTtsLoading} lastTtsText={lastTtsText} onPlayTts={onPlayTts} />
            </div>
            <ul className="space-y-1">
              {summary.nextSteps.map((step, index) => (
                <li key={index} className="text-sm flex items-start gap-2"><span className="text-secondary mt-1">→</span><span>{step}</span></li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
