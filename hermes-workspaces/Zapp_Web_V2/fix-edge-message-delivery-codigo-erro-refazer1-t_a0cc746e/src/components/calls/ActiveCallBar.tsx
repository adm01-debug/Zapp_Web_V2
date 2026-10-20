import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { CallChannelBadge } from './CallChannelBadge';
import { useNavigationHistory } from '@/hooks/system/useNavigationHistory';
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
  // Fonte de verdade da view é o useNavigationHistory (o app navega por
  // pushState cru + evento `zapp:navigate`; o useSearchParams do react-router
  // não é atualizado nessa navegação e ficaria com view obsoleto durante a sessão).
  const { currentView } = useNavigationHistory('inbox');
  const sip = useCallSession();

  const isInCall = sip.callStatus === 'calling' || sip.callStatus === 'ringing' || sip.callStatus === 'active';
  if (!isInCall || currentView === 'voip') return null;

  const isIncomingRinging = sip.callStatus === 'ringing' && sip.callDirection === 'inbound';
  const isActive = sip.callStatus === 'active';


  const navegarParaTelefonia = () => {
    // T69: clique na faixa leva o agente para o painel completo da telefonia.
    window.history.pushState({}, '', '/?view=voip');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: 'voip' } }));
  };

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-primary/5 px-3"
      data-testid="tel-active-bar"
    >
      <button
        type="button"
        onClick={navegarParaTelefonia}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label="Abrir a chamada em curso na telefonia"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Phone className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {sip.currentNumber || 'Chamada em curso'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {isIncomingRinging ? 'Chamada recebida' : sip.callStatus === 'active' ? formatTime(sip.callDuration) : 'Chamando...'}
          </span>
        </span>
        <CallChannelBadge channel={sip.session.channel} />
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {isIncomingRinging ? (
          <Button size="icon" className="h-8 w-8 rounded-full bg-success hover:bg-success/90" onClick={sip.accept} aria-label="Atender">
            <Phone className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={sip.toggleMute} disabled={!isActive} aria-pressed={sip.isMuted} aria-label={sip.isMuted ? 'Ativar microfone' : 'Silenciar'}>
            {sip.isMuted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
        <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={sip.hangup} aria-label="Encerrar">
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
