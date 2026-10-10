import { useRef } from 'react';
import { Play, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallRecording } from '@/hooks/calls/useCallRecording';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';

interface RecordingPlayerProps {
  callId: string;
  recordingStatus: string | null | undefined;
}

/**
 * Player da gravacao (T67). Devolve `null` quando nao ha gravacao para tocar - e essa e
 * a regra, nao um estado de erro: com D3=b (sem servico de gravacao) nem requisicao sai,
 * e a tela nao mostra um controle que nao faria nada.
 *
 * VOL-02 (E35): a gravacao da chamada e midia de conversa, nao alerta - o `<audio>` que
 * de fato toca e ESTE, entao a ligacao ao volume global mora aqui. Antes o hook ficava no
 * shell (TelefoniaView) com uma ref orfa: o contrato textual passava e o elemento tocava
 * no volume cheio, ignorando o slider e o mute. O hook e chamado antes do early return
 * para nao quebrar a ordem dos hooks quando a chamada nao tem gravacao.
 */
export function RecordingPlayer({ callId, recordingStatus }: RecordingPlayerProps) {
  const { disponivel, url } = useCallRecording(callId, recordingStatus);
  const audioRef = useRef<HTMLAudioElement>(null);
  useMediaElementVolume(audioRef);

  if (!disponivel || !url) return null;

  return (
    <div className="flex items-center gap-2" data-testid="tel-recording-player">
      <audio ref={audioRef} src={url} controls className="h-8 w-full" />
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
