import { Play, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallRecording } from '@/hooks/calls/useCallRecording';

interface RecordingPlayerProps {
  callId: string;
  recordingStatus: string | null | undefined;
}

/**
 * Player da gravacao (T67). Devolve `null` quando nao ha gravacao para tocar - e essa e
 * a regra, nao um estado de erro: com D3=b (sem servico de gravacao) nem requisicao sai,
 * e a tela nao mostra um controle que nao faria nada.
 */
export function RecordingPlayer({ callId, recordingStatus }: RecordingPlayerProps) {
  const { disponivel, url } = useCallRecording(callId, recordingStatus);

  if (!disponivel || !url) return null;

  return (
    <div className="flex items-center gap-2" data-testid="tel-recording-player">
      <audio src={url} controls className="h-8 w-full" />
      <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Baixar gravação">
        <a href={url} download>
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
      <span className="sr-only">
        <Play className="h-3 w-3" />
      </span>
    </div>
  );
}
