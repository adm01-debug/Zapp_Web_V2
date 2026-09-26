import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCallSession } from '@/providers/CallSessionProvider';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Mantém a chamada visível (e controlável) enquanto o usuário navega para
// outros módulos — a tela de Telefonia já mostra os mesmos controles.
export function ActiveCallBar() {
  const [searchParams] = useSearchParams();
  const sip = useCallSession();

  const isInCall = sip.callStatus === 'calling' || sip.callStatus === 'ringing' || sip.callStatus === 'active';
  if (!isInCall || searchParams.get('view') === 'voip') return null;

  const isIncomingRinging = sip.callStatus === 'ringing' && sip.callDirection === 'inbound';

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-72 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-2 bg-primary/10">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{sip.currentNumber || 'Chamada'}</p>
          <p className="text-xs text-muted-foreground">
            {sip.callStatus === 'calling' && 'Chamando...'}
            {isIncomingRinging && 'Chamada recebida...'}
            {sip.callStatus === 'ringing' && !isIncomingRinging && 'Tocando...'}
            {sip.callStatus === 'active' && formatTime(sip.callDuration)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isIncomingRinging ? (
            <Button
              size="icon"
              className="w-8 h-8 rounded-full bg-success hover:bg-success/90"
              onClick={sip.acceptIncomingCall}
              aria-label="Atender"
            >
              <Phone className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full"
              onClick={sip.toggleMute}
              disabled={sip.callStatus !== 'active'}
              aria-label={sip.isMuted ? 'Ativar microfone' : 'Silenciar'}
            >
              {sip.isMuted ? <MicOff className="w-4 h-4 text-destructive" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon"
            className="w-8 h-8 rounded-full"
            onClick={sip.hangUp}
            aria-label="Encerrar"
          >
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
