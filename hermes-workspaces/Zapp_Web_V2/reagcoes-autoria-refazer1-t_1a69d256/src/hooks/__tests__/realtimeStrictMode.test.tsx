// E38 — concurrent safety dos hooks de realtime sob React.StrictMode.
//
// O StrictMode monta, desmonta e remonta cada efeito em desenvolvimento, e
// re-renderiza duas vezes. Sem ele, hooks que registram canal/assinatura sem
// cleanup adequado parecem perfeitos: o bug só aparece no remount real.
//
// O repo ja tinha defesas escritas PARA o StrictMode (useSupabaseRealtime tem
// comentario citando "React StrictMode/remount churn"), mas o StrictMode nunca
// esteve montado — entao nada disso era exercitado. Este teste e o exercicio.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  class FakeWS { readyState = 0; send() {} close() {} addEventListener() {} removeEventListener() {} }
  const fetchImpl = async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  const supabase = createClient('http://127.0.0.1:9', 'eyJhbG...biJ9.sig', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl as unknown as typeof fetch },
    realtime: { transport: FakeWS as unknown as typeof WebSocket },
  });
  return { supabase, SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'x', GOOGLE_OAUTH_ENABLED: false };
});

import { supabase } from '@/integrations/supabase/client';
import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';

function Consumidor({ topico, habilitado = true }: { topico: string; habilitado?: boolean }) {
  useSupabaseRealtime<Record<string, unknown>>({
    channelName: topico,
    table: 'mensagens',
    enabled: habilitado,
    onInsert: () => {},
  });
  return <div data-testid="consumidor-ok" />;
}

describe('E38 — realtime sob StrictMode', () => {
  let channelSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    channelSpy = vi.spyOn(supabase, 'channel');
  });

  afterEach(() => {
    channelSpy.mockRestore();
    cleanup();
  });

  it('não cria um canal por remount do StrictMode (o canal é compartilhado)', async () => {
    const { unmount } = render(
      <React.StrictMode>
        <Consumidor topico="e38-topico-unico" />
      </React.StrictMode>,
    );

    await waitFor(() => expect(channelSpy).toHaveBeenCalled());
    // StrictMode monta→desmonta→remonta. Se o hook abrisse um canal por ciclo,
    // seriam 2+. O compartilhamento tem que devolver um único canal.
    expect(channelSpy).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('sobrevive ao ciclo completo de remount sem explodir', async () => {
    const erros: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { erros.push(args); };

    const { getByTestId, unmount } = render(
      <React.StrictMode>
        <Consumidor topico="e38-topico-remount" />
      </React.StrictMode>,
    );
    expect(getByTestId('consumidor-ok')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    unmount();
    await new Promise((r) => setTimeout(r, 30));

    console.error = original;
    // O React loga erros de efeito em console.error; nenhum é aceitável aqui.
    expect(erros).toEqual([]);
  });

  it('não abre canal quando desabilitado (nem sob StrictMode)', async () => {
    const { unmount } = render(
      <React.StrictMode>
        <Consumidor topico="e38-topico-desligado" habilitado={false} />
      </React.StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(channelSpy).not.toHaveBeenCalled();
    unmount();
  });
});
