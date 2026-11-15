import React from 'react';
import { log } from '@/lib/logger';

/**
 * CV-051..060 — isolamento do painel RADAR ao vivo.
 *
 * O RADAR é painel opcional da conversa: se ele falhar, a Inbox tem de seguir
 * funcionando. É o mesmo contrato que `useCopilotSession` já declara ("sem
 * RADAR, sem quebrar a Inbox"), aplicado agora à árvore de render inteira do
 * painel — incluindo o que acontece se um provedor de contexto que ele usa
 * (autenticação, cache de consultas) não estiver montado naquela tela.
 *
 * Diferente do `SectionErrorBoundary`, aqui o fallback é **nada**: um cartão de
 * erro no meio do chat seria ruído para o atendente, que não pediu o painel.
 */
interface Props {
  children: React.ReactNode;
}

interface State {
  falhou: boolean;
}

export class RadarBoundary extends React.Component<Props, State> {
  state: State = { falhou: false };

  static getDerivedStateFromError(): State {
    return { falhou: true };
  }

  componentDidCatch(error: Error) {
    log.error('[RadarBoundary] painel RADAR desligado nesta tela:', error);
  }

  render() {
    if (this.state.falhou) return null;
    return this.props.children;
  }
}
