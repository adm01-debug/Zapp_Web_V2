/**
 * Preferências do app com o armazenamento local BLOQUEADO.
 *
 * Cenário real: aba anônima do Safari/Firefox, política corporativa, cota cheia
 * ou iframe lançam `SecurityError`/`QuotaExceededError` em `localStorage`. Antes
 * do cartão isso estourava o render do provedor raiz ("Falha Crítica na
 * Inicialização"). Aqui os pontos tocados são exercitados com
 * `Storage.prototype.getItem/setItem` lançando: nada pode escapar exceção, o
 * tema cai no padrão do sistema e a navegação continua funcionando.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, screen, fireEvent } from '@testing-library/react';

// `useScreenProtection` só precisa de um usuário para reexecutar o efeito.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'usuario-sintetico' } }),
}));

// Papéis/permissões vazios: os itens de nav sem `roles`/`permission` seguem liberados.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: [],
    permissions: [],
    isAdmin: false,
    isSupervisor: false,
    isSpecialAgent: false,
    hasRole: () => false,
    loading: false,
    rolesLoadError: false,
    permissionsLoading: false,
    refetch: () => {},
  }),
}));

import { useTheme } from '@/hooks/ui/useTheme';
import { HighContrastProvider, HighContrastToggle } from '@/components/theme/HighContrastToggle';
import { useScreenProtection } from '@/hooks/ui/useScreenProtection';
import { CommandPalette } from '@/components/CommandPalette';

/** Simula navegador com o armazenamento local indisponível (leitura e escrita). */
function bloquearStorage() {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('SecurityError: armazenamento bloqueado', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError');
  });
}

beforeEach(() => {
  bloquearStorage();
  // O jsdom não implementa scrollIntoView, que o cmdk chama ao destacar um item.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('preferências com armazenamento local bloqueado', () => {
  it('useTheme não estoura, cai no tema do sistema e troca de tema mesmo assim', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');

    expect(() => act(() => result.current.setTheme('dark'))).not.toThrow();
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('HighContrastProvider + HighContrastToggle montam e alternam sem exceção', () => {
    const { getByLabelText } = render(
      <HighContrastProvider>
        <HighContrastToggle />
      </HighContrastProvider>,
    );

    const botao = getByLabelText('Ativar alto contraste');
    expect(() => fireEvent.click(botao)).not.toThrow();

    // A gravação falhou, mas a preferência em memória mudou — o app não trava.
    expect(getByLabelText('Desativar alto contraste')).toBeTruthy();
  });

  it('useScreenProtection lê o padrão (ligado) e alterna sem exceção', () => {
    const { result } = renderHook(() => useScreenProtection());

    expect(result.current.enabled).toBe(true);
    expect(() => act(() => result.current.toggle())).not.toThrow();
  });

  it('a paleta abre e navegar por um módulo funciona mesmo com o storage bloqueado', async () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);

    act(() => {
      document.dispatchEvent(new Event('open-global-search'));
    });

    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.length).toBeGreaterThan(0);

    fireEvent.click(opcoes[0]);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(expect.any(String));
  });
});
