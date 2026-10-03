import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('com gravacao disponivel o player existe e pede o audio pela Edge (nunca pela URL)', async () => {
    renderPlayer(<RecordingPlayer callId="c3" recordingStatus="available" />);
    // D3 revisado em 29/09 (reconciliar com o Bitrix24): a Edge get-call-recording existe, entao
    // o player deixa de devolver null e passa a buscar o audio - sem que a URL chegue ao front.
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get-call-recording', expect.objectContaining({ body: { callId: 'c3' } })));
    expect(JSON.stringify(document.body.innerHTML)).not.toContain('http');
  });
});
