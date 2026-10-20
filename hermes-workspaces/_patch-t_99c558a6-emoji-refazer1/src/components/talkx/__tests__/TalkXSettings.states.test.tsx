import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * X047b — matriz de estados, linha da tela Configurações.
 *
 * Esta é a prova de que a tela obedece à regra da etapa: quando a consulta FALHA,
 * ela mostra o erro — nunca a tela vazia. Antes da migração, `TalkXSettings`
 * decidia isso à mão (`if (isLoading) …` / `if (error || !settings) …`); agora quem
 * decide é o `TalkXQueryBoundary`, e este teste fixa esse contrato.
 */

const refetch = vi.fn();

vi.mock('@/hooks/integrations/useTalkXSettings', () => ({
  useTalkXSettings: () => ({
    data: undefined,
    isLoading: false,
    error: new Error('falha exclusiva X047b'),
    refetch,
  }),
  useTalkXSettingUpdate: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { TalkXSettings } from '../TalkXSettings';

describe('matriz de estados — TalkXSettings (X047b)', () => {
  it('consulta com erro: mostra o erro e NÃO a tela vazia', () => {
    const { container } = render(<TalkXSettings />);
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
  });

  it('consulta com erro: não anuncia carregamento', () => {
    const { container } = render(<TalkXSettings />);
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeNull();
  });
});
