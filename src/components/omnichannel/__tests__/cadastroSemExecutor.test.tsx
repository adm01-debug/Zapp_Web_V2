import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

// Guarda de rede do src/test/setup.ts: nenhum teste fala com o Supabase. O
// cliente é mockado inteiro e toda consulta devolve lista vazia — o que está
// em prova aqui é o que a tela DECLARA sobre execução, não os dados.
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (resultado: { data: unknown; error: null }) => {
    const alvo: Record<string, unknown> = {};
    for (const metodo of ['select', 'order', 'eq', 'limit', 'maybeSingle']) {
      alvo[metodo] = () => alvo;
    }
    alvo.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, erro);
    return alvo;
  };
  return {
    supabase: {
      from: () => cadeia({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user: null } }) },
    },
  };
});

import { OmnichannelManager } from '../OmnichannelManager';
import { ChannelRoutingRules } from '../ChannelRoutingRules';

function montar(ui: ReactElement) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cliente}>{ui}</QueryClientProvider>);
}

describe('OmnichannelManager — cadastro de canais sem executor versionado (R2-API-065)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declara que nenhum executor versionado consome estes canais', () => {
    montar(<OmnichannelManager />);
    expect(
      screen.getByText(/nenhum executor versionado consome estes canais/i),
    ).toBeInTheDocument();
  });

  it('não promete ativação ao cadastrar um canal', () => {
    montar(<OmnichannelManager />);
    expect(screen.getByText(/não ativa recebimento nem envio/i)).toBeInTheDocument();
  });
});

describe('ChannelRoutingRules — regras sem executor versionado (R2-API-065)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declara que nenhum consumidor versionado lê channel_routing_rules', () => {
    montar(<ChannelRoutingRules />);
    expect(
      screen.getByText(/nenhum consumidor versionado lê channel_routing_rules/i),
    ).toBeInTheDocument();
  });

  it('não promete que a fila escolhida recebe as mensagens', () => {
    montar(<ChannelRoutingRules />);
    expect(screen.getByText(/não recebe mensagens até um executor/i)).toBeInTheDocument();
  });
});
