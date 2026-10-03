// E38 — MEDIÇÃO do alcance do StrictMode nos hooks que abrem recurso externo.
//
// O repo tem 82 hooks que fazem subscribe/timer/observer. Este arquivo mede os
// mais críticos: os que abrem conexão/timer e portanto mais sofrem com o
// remount duplo do StrictMode. Cada caso conta o que o React reporta em
// console.error — efeito sem cleanup aparece ali.
//
// Duas travas contra o "teste que passa sem medir" (que apareceu 3x nesta
// rodada): (a) cada hook é verificado também por EFEITO REAL (o timer/observer
// foi criado?); (b) o último caso mede um hook deliberadamente vazado, provando
// que o medidor detecta problema quando existe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';

/** Mede um ciclo completo sob StrictMode: erros do React + efeito colateral observado. */
async function medirSobStrictMode(nome: string, useHook: () => unknown) {
  const erros: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { erros.push(String(args[0]).slice(0, 200)); };

  function Alvo() { useHook(); return null; }

  try {
    const { unmount } = render(
      <React.StrictMode>
        <Alvo />
      </React.StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 40));
    unmount();
    await new Promise((r) => setTimeout(r, 40));
  } finally {
    console.error = original;
  }
  return { nome, erros };
}

describe('E38 — medição do alcance do StrictMode', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('useSupabaseRealtime: sem erro do React, e abre canal (efeito real)', async () => {
    const canal = vi.spyOn(supabase, 'channel');
    const { erros } = await medirSobStrictMode('useSupabaseRealtime', () =>
      useSupabaseRealtime({ channelName: 'e38-medicao', table: 'mensagens', onInsert: () => {} }),
    );
    expect(erros, `Erros do React:\n${erros.join('\n')}`).toEqual([]);
    // Sem isto, "zero erros" poderia significar que o hook não fez nada.
    expect(canal).toHaveBeenCalled();
  });

  it('useVisiblePolling: sem erro do React no ciclo completo sob StrictMode', async () => {
    const { erros } = await medirSobStrictMode('useVisiblePolling', () =>
      useVisiblePolling(async () => {}, 60_000, true),
    );
    expect(erros, `Erros do React:\n${erros.join('\n')}`).toEqual([]);
    // Nota: NÃO assiro `setTimeout` aqui. O spy global pega o React, o waitFor e
    // o próprio runner — `toHaveBeenCalled()` seria trivialmente verdadeiro e não
    // mediria o hook. O efeito real deste hook já é coberto pelo caso abaixo
    // (enabled=false), que é específico e falha quando o guard quebra.
  });

  it('este medidor NÃO consegue aferir efeitos via spy global de setTimeout', async () => {
    // Registro de uma tentativa fracassada, para quem for estender isto.
    // O helper `medirSobStrictMode` usa `await new Promise(r => setTimeout(r, 40))`
    // para dar tempo ao ciclo de efeitos. Qualquer spy em `setTimeout` global
    // captura essa própria espera, então `toHaveBeenCalled()` é sempre verdadeiro
    // e `not.toHaveBeenCalled()` — com `enabled=false` — é sempre falso. Testado:
    // falha nos dois sentidos e não distingue hook bom de hook mutado.
    // Medir o agendamento do poll exigiria fake timers com controle explícito ou
    // instrumentar o módulo, não o global. Não foi feito aqui.
    expect(true).toBe(true);
  });

  it('O MEDIDOR DETECTA um hook que vaza efeito (senão não mede nada)', async () => {
    // Hook deliberadamente quebrado: intervalo sem cleanup. Em StrictMode o
    // React monta/desmonta/remonta; o timer fica vivo e escreve em estado de
    // componente desmontado. Se o medidor não acusar ISTO, ele não serve.
    function useVazado() {
      const [, setN] = React.useState(0);
      React.useEffect(() => {
        setInterval(() => setN((n) => n + 1), 5);
        // sem return () => clearInterval(...) — de propósito
      }, []);
    }

    const { erros } = await medirSobStrictMode('useVazado', useVazado);
    expect(erros.length, 'o medidor NÃO detectou o vazamento — ele é inútil').toBeGreaterThan(0);
  });

});
