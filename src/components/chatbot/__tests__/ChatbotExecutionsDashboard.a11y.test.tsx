import { render, screen, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A11Y-02 — o `SelectTrigger` do filtro de status do painel de execuções não
 * tinha nome acessível (`ChatbotExecutionsDashboard.tsx:117`). Nenhum texto
 * visível o nomeia: o `<SelectValue />` fica vazio até haver escolha.
 *
 * Os componentes de UI são os REAIS; só a consulta é dublada, para o axe medir o
 * markup de verdade (um `SelectTrigger` mockado como `<div>` esconderia o nome).
 */

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { ChatbotExecutionsDashboard } from '@/components/chatbot/ChatbotExecutionsDashboard';

const SERIOUS = new Set(['critical', 'serious']);

afterEach(() => cleanup());

describe('ChatbotExecutionsDashboard — nome acessível do filtro (A11Y-02)', () => {
  it('o seletor de status tem nome acessível descritivo', () => {
    render(
      <main>
        <ChatbotExecutionsDashboard />
      </main>,
    );

    expect(screen.getByRole('combobox', { name: 'Filtrar status das execuções' })).toBeInTheDocument();
  });

  it('axe: o painel não tem violações critical/serious', async () => {
    render(
      <main>
        <ChatbotExecutionsDashboard />
      </main>,
    );

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });
});
