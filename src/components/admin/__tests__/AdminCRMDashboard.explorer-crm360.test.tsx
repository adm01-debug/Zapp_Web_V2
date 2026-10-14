/**
 * AdminCRMDashboard — o botão "Explorer Completo" tem de levar à tela do CRM 360°
 * pela navegação da própria aplicação (useNavigationHistory / ?view=<id>), que é a
 * fonte única de navegação das telas.
 *
 * Defeito: o botão chamava `navigate('/#crm360')` do react-router-dom. O roteador
 * grava a URL por `history.pushState`, o que NÃO dispara `hashchange` nem
 * `zapp:navigate`; com isso o `?view=` canônico nunca é gravado, o hook de
 * navegação não empilha a tela e o clique não abre o Explorer (a URL ainda perde
 * o `?view=` da tela atual).
 *
 * O teste monta a TELA REAL (dentro do Router da aplicação, como no App) e cobra o
 * contrato observável do clique: URL canônica `?view=crm360` + evento
 * `zapp:navigate` com `view: 'crm360'`. Sem a correção, as duas asserções ficam
 * vermelhas.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));

// Cards de métrica / listas: só a casca da tela interessa aqui.
vi.mock('@/hooks/integrations/useExternalDB', () => ({
  useExternalSelect: () => ({
    data: { data: [], meta: { record_count: 0, duration_ms: 1 } },
    isLoading: false,
  }),
}));

// Health da integração: resposta válida, para a tela renderizar no caminho bom.
vi.mock('@/lib/crmIntegration', () => ({
  callCRMIntegration: vi.fn(async () => ({
    data: {
      external_reachable: true,
      queue: {
        pending: 0, processing: 0, failed: 0, dead_letter: 0,
        succeeded_24h: 0, succeeded_without_link: 0, oldest_ready_age_seconds: 0,
        generated_at: new Date().toISOString(),
      },
    },
  })),
}));

import { AdminCRMDashboard } from '@/components/admin/AdminCRMDashboard';

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      {/* O App monta as telas dentro de um Router (App.tsx); o teste reproduz isso. */}
      <MemoryRouter initialEntries={['/']}>
        <AdminCRMDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminCRMDashboard — "Explorer Completo" navega para o CRM 360° (view crm360)', () => {
  let eventos: string[];
  let ouvir: (e: Event) => void;

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    eventos = [];
    ouvir = (e: Event) => {
      const view = (e as CustomEvent<{ view?: string }>).detail?.view;
      if (view) eventos.push(view);
    };
    window.addEventListener('zapp:navigate', ouvir);
  });

  afterEach(() => {
    window.removeEventListener('zapp:navigate', ouvir);
    cleanup();
  });

  it('grava ?view=crm360 na URL e emite zapp:navigate com view crm360', () => {
    montar();

    fireEvent.click(screen.getByRole('button', { name: /Explorer Completo/ }));

    expect(new URLSearchParams(window.location.search).get('view')).toBe('crm360');
    expect(eventos).toContain('crm360');
  });
});
