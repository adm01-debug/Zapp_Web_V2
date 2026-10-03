import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordingPlayer } from '../RecordingPlayer';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

const renderPlayer = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('RecordingPlayer (T67)', () => {
  beforeEach(() => invoke.mockReset().mockResolvedValue({ data: { url: 'https://exemplo/g.mp3' }, error: null }));

  it('nao renderiza nada quando a chamada nao tem gravacao', () => {
    renderPlayer(<RecordingPlayer callId="c1" recordingStatus="none" />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
  });

  it('nao renderiza nem requisita quando a chamada nao diz que tem', () => {
    renderPlayer(<RecordingPlayer callId="c2" recordingStatus={null} />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('com gravacao disponivel mas sem servico ligado (D3=b) continua devolvendo null', () => {
    renderPlayer(<RecordingPlayer callId="c3" recordingStatus="available" />);
    expect(screen.queryByTestId('tel-recording-player')).toBeNull();
    // O servico esta desligado: nao se chama a funcao que nao existe.
    expect(invoke).not.toHaveBeenCalled();
  });
});
