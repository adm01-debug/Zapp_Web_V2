import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Play, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallRecording } from '@/hooks/calls/useCallRecording';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';

interface RecordingPlayerProps {
  callId: string;
  recordingStatus: string | null | undefined;
}

/**
 * O que o player precisa da gravacao: se ela existe e COMO ela chega. Quando o hook entrega os
 * BYTES da Edge (`blob`) e o PLAYER que monta o endereco local - por isso `blob` entra aqui;
 * enquanto o hook so devolver um endereco pronto (`url`), o player usa esse endereco como veio.
 */
interface GravacaoDoPlayer {
  disponivel: boolean;
  url: string | null;
  blob?: Blob | null;
}

/**
 * Registro do endereco `blob:` VIVO deste player. O endereco nao e estado do React: e um
 * registro do NAVEGADOR - `createObjectURL`/`revokeObjectURL` escrevem nele. Guardar o valor
 * atual aqui (e avisar quem assina) e o mesmo padrao que o repositorio ja usa para sistema
 * externo (`useSyncExternalStore` em `mediaVolumeStore`). Sem ele o efeito teria de chamar
 * `setState` no proprio corpo, que a regra `react-hooks/set-state-in-effect` recusa.
 */
interface RegistroDeEndereco {
  ler(): string | null;
  definir(valor: string | null): void;
  assinar(avisar: () => void): () => void;
}

function criarRegistroDeEndereco(): RegistroDeEndereco {
  let atual: string | null = null;
  const assinantes = new Set<() => void>();

  return {
    ler: () => atual,
    definir(valor: string | null) {
      if (valor === atual) return;
      atual = valor;
      for (const avisar of assinantes) avisar();
    },
    assinar(avisar: () => void) {
      assinantes.add(avisar);
      return () => {
        assinantes.delete(avisar);
      };
    },
  };
}

/**
 * Ciclo de vida do endereco `blob:` do player: CRIADO e REVOGADO no MESMO efeito.
 *
 * O endereco vive exatamente enquanto este efeito estiver montado. Derivar o endereco fora
 * daqui (num `useMemo`, por exemplo) cria o `blob:` na renderizacao e deixa a revogacao para
 * outro efeito: sob `StrictMode` o React monta, desmonta e monta de novo o efeito, a limpeza
 * revoga o endereco e a remontagem NAO cria outro - o `<audio>` fica apontando para um `blob:`
 * ja revogado (nao toca) e o endereco criado na renderizacao descartada ainda vaza. Aqui a
 * limpeza revoga e publica `null` no registro, e a remontagem publica um endereco novo, entao
 * uma URL revogada nunca permanece em uso.
 */
function useEnderecoDoBlob(blob: Blob | null): string | null {
  const [registro] = useState(criarRegistroDeEndereco);
  const endereco = useSyncExternalStore(registro.assinar, registro.ler, registro.ler);

  useEffect(() => {
    if (!blob) {
      registro.definir(null);
      return;
    }

    const criado = URL.createObjectURL(blob);
    registro.definir(criado);

    return () => {
      URL.revokeObjectURL(criado);
      registro.definir(null);
    };
  }, [blob, registro]);

  return endereco;
}

/**
 * Player da gravacao (T67). Devolve `null` quando nao ha gravacao para tocar - e essa e
 * a regra, nao um estado de erro: com D3=b (sem servico de gravacao) nem requisicao sai,
 * e a tela nao mostra um controle que nao faria nada.
 *
 * TEL-RECORDING-001: o endereco que o `<audio>` e o link de download usam e um `blob:` local
 * do navegador, montado AQUI a partir dos bytes que o hook entrega - a URL de origem nunca
 * chega ao DOM. O ciclo (criar/revogar) e deste componente, no mesmo efeito.
 *
 * VOL-02 (E35): a gravacao da chamada e midia de conversa, nao alerta - o `<audio>` que
 * de fato toca e ESTE, entao a ligacao ao volume global mora aqui. Antes o hook ficava no
 * shell (TelefoniaView) com uma ref orfa: o contrato textual passava e o elemento tocava
 * no volume cheio, ignorando o slider e o mute. O hook e chamado antes do early return
 * para nao quebrar a ordem dos hooks quando a chamada nao tem gravacao.
 */
export function RecordingPlayer({ callId, recordingStatus }: RecordingPlayerProps) {
  const gravacao: GravacaoDoPlayer = useCallRecording(callId, recordingStatus);
  const audioRef = useRef<HTMLAudioElement>(null);
  useMediaElementVolume(audioRef);

  const enderecoDoBlob = useEnderecoDoBlob(gravacao.blob ?? null);
  const src = enderecoDoBlob ?? gravacao.url ?? null;

  if (!src) return null;

  return (
    <div className="flex items-center gap-2" data-testid="tel-recording-player">
      <audio ref={audioRef} src={src} controls className="h-8 w-full" />
      <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Baixar gravação">
        <a href={src} download>
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
      <span className="sr-only">
        <Play className="h-3 w-3" />
      </span>
    </div>
  );
}
