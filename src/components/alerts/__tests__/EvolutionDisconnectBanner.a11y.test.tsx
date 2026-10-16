import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { EvolutionDisconnectBanner } from '../EvolutionDisconnectBanner';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * A faixa de conexões desconectadas é renderizada como irmã do <AppShell> (src/pages/Index.tsx),
 * fora de qualquer landmark. Sem papel de landmark o axe acusa TODO o texto dela com a regra
 * `region` ("Some page content is not contained by landmarks") em qualquer tela onde ela aparece —
 * era ~2 dos 5 nós que o VOLUMES viu em 5 telas, estável nos 4 estados de tema.
 *
 * Corrigido com `role="region"` + `aria-label` (landmark nomeado) e `aria-live="polite"` para o
 * aviso ser anunciado quando aparece.
 *
 * PD-38: a faixa agora consulte a preferência (`alert_on_disconnected`) via React Query + useAuth,
 * então os testes montam o banner com o mesmo par de provedores do app.
 */
const h = vi.hoisted(() => ({ rows: [] as unknown[], preferencias: null as unknown }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () =>
        table === 'connection_alert_preferences'
          ? { maybeSingle: async () => ({ data: h.preferencias, error: null }) }
          : { eq: async () => ({ data: h.rows }) },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, profile: null, loading: false }),
}));

const desconectada = { id: 'c1', instance_id: 'PRINCIPAL', phone_number: null, status: 'disconnected' };

describe('a11y: faixa de conexões desconectadas (landmark)', () => {
  beforeEach(() => {
    h.rows = [desconectada];
  });

  it('a faixa é um landmark nomeado e o aviso fica DENTRO dele', async () => {
    const { container, findByText } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    await findByText(/está desconectada/i);

    const faixa = container.querySelector('[role="region"]');
    expect(faixa).toBeTruthy();
    expect(faixa?.getAttribute('aria-label')).toBe('Status das conexões do WhatsApp');
    // o landmark tem de CONTER o texto — papel no wrapper sem conter o conteúdo não resolve o axe
    expect(faixa?.textContent).toMatch(/está desconectada/i);
    expect(faixa?.textContent).toMatch(/Mensagens não serão enviadas\/recebidas/);
  });

  it('axe não acusa conteúdo fora de landmark (regra region)', async () => {
    const { container, findByText } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    await findByText(/está desconectada/i);

    // jsdom não tem layout: contraste fica fora (declarado); `region` é estrutural e é o alvo aqui.
    // Varre o document.body: com o container (fragmento) a regra nao dispara em jsdom.
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'region')).toEqual([]);
  });

  it('sem conexão desconectada a faixa não renderiza nada', async () => {
    h.rows = [];
    const { container } = render(<EvolutionDisconnectBanner />, { wrapper: TestQueryWrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[role="region"]')).toBeNull();
  });
});
