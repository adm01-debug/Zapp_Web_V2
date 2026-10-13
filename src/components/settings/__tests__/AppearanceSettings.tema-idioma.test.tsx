/**
 * PD-30 — aba Aparência (cartão config-aparencia-tema-idioma).
 *
 * Antes: os <Select> de Tema e Idioma não mostravam o que valia de verdade — o
 * idioma vinha do banco no formato legado ('pt-BR') e podia não casar com
 * nenhum item; e o "Salvar Alterações" morava no cabeçalho global da
 * SettingsView, prometendo gravar também as abas de operação, que gravam por
 * conta própria.
 *
 * Prova, no componente REAL: o seletor fica no valor em vigor (tema claro/
 * escuro e cada idioma), escolher um item grava o que a tela promete e o botão
 * Salvar desta aba mostra os estados de salvando e de erro.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppearanceSettings } from '../AppearanceSettings';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/settings/AvatarUpload', () => ({
  AvatarUpload: () => <div data-testid="avatar-upload" />,
}));
vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
}));

// Os primitivos do Radix são trocados por <select>/<option> nativos — o mesmo
// padrão de ScheduleSettings.test.tsx e MessagesSettings.test.tsx. O teste fala
// com o handler do componente (o valor que ele mostra e o que ele grava), não
// com o portal do Radix dentro do jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children,
  }: {
    value?: string;
    defaultValue?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
    <select value={value ?? defaultValue ?? ''} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const props = (over: Record<string, unknown> = {}) => ({
  settings: { theme: 'dark', language: 'pt-BR', compact_mode: false },
  updateSettings: vi.fn(),
  onResetOnboarding: vi.fn(),
  isSaving: false,
  onSave: vi.fn().mockResolvedValue(true),
  ...over,
});

/** O seletor que contém a opção pedida (o nome dele vem do conteúdo, não da posição). */
function seletorComOpcao(texto: string): HTMLSelectElement {
  const combo = screen
    .getAllByRole('combobox')
    .find((c) => within(c).queryByRole('option', { name: texto }));
  if (!combo) throw new Error(`Nenhum seletor com a opção "${texto}"`);
  return combo as HTMLSelectElement;
}

describe('PD-30 — Aparência mostra e grava o tema/idioma em vigor', () => {
  it('mostra o tema em vigor no seletor (escuro e claro)', () => {
    const { unmount } = render(
      <AppearanceSettings {...props({ settings: { theme: 'dark', language: 'pt-BR', compact_mode: false } })} />,
    );
    expect(seletorComOpcao('Escuro')).toHaveValue('dark');
    unmount();

    render(<AppearanceSettings {...props({ settings: { theme: 'light', language: 'pt-BR', compact_mode: false } })} />);
    expect(seletorComOpcao('Claro')).toHaveValue('light');
  });

  it('mostra Português (Brasil) com o código legado pt-BR guardado no banco', () => {
    render(<AppearanceSettings {...props()} />);
    expect(seletorComOpcao('Português (Brasil)')).toHaveValue('pt');
  });

  it('mostra English (US) quando o banco guarda en-US', () => {
    render(
      <AppearanceSettings {...props({ settings: { theme: 'dark', language: 'en-US', compact_mode: false } })} />,
    );
    expect(seletorComOpcao('English (US)')).toHaveValue('en');
  });

  it('escolher English (US) grava o código que a coluna do banco usa', () => {
    const updateSettings = vi.fn();
    render(<AppearanceSettings {...props({ updateSettings })} />);

    fireEvent.change(seletorComOpcao('English (US)'), { target: { value: 'en' } });

    expect(updateSettings).toHaveBeenCalledWith({ language: 'en-US' });
  });

  it('escolher Claro grava o tema que o dono da preferência entende', () => {
    const updateSettings = vi.fn();
    render(<AppearanceSettings {...props({ updateSettings })} />);

    fireEvent.change(seletorComOpcao('Claro'), { target: { value: 'light' } });

    expect(updateSettings).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('salvar chama o hook canônico e não deixa erro na tela', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AppearanceSettings {...props({ onSave })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('appearance-save-error')).not.toBeInTheDocument());
  });

  it('mostra Salvando... e bloqueia o botão enquanto grava', () => {
    render(<AppearanceSettings {...props({ isSaving: true })} />);
    const botao = screen.getByRole('button', { name: 'Salvar preferências' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveTextContent('Salvando...');
  });

  it('mostra o erro na tela quando a gravação falha', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<AppearanceSettings {...props({ onSave })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar suas preferências');
  });
});
