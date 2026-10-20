import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-sintetico-001' } }),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));
vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/hooks/ui/use-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/notificationSounds', () => ({
  previewSound: vi.fn(),
  playNotificationSound: vi.fn(),
}));

// Primitivas Radix pesadas em jsdom: controles nativos que repassam
// o evento do usuário ao handler REAL do componente.
// SelectTrigger renderiza um <button> (como o Radix real) para que
// o axe encontre o aria-label no role=combobox.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({
    children,
    'aria-label': ariaLabel,
    ...rest
  }: { children?: React.ReactNode; 'aria-label'?: string; [key: string]: unknown }) => (
    <button type="button" role="combobox" aria-label={ariaLabel} aria-expanded={false} aria-controls={rest.id ? `${rest.id}-listbox` : undefined} {...rest}>
      {children}
    </button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { SoundCategoryCard } from '../SoundCategoryCard';

const CATEGORIA = 'mensagem';
const LABEL = 'Mensagens';

const props = {
  categoryKey: CATEGORIA,
  label: LABEL,
  description: 'Som para novas mensagens',
  icon: () => <span data-testid="icon" />,
  sounds: [
    { id: 'none', name: 'Nenhum', description: 'Sem som' },
    { id: 'beep', name: 'Bipe', description: 'Som de bipe' },
  ],
  currentSound: 'none',
  isPlaying: false,
  disabled: false,
  onSoundChange: vi.fn(),
  onPlayPreview: vi.fn(),
};

describe('SoundCategoryCard — acessibilidade (N-155)', () => {
  it('o seletor de som tem nome acessível "Som de <categoria>"', () => {
    render(<SoundCategoryCard {...props} />);
    const trigger = screen.getByRole('combobox', { name: `Som de ${LABEL}` });
    expect(trigger).toBeInTheDocument();
  });

  it('o botão de prévia tem nome acessível "Ouvir prévia de <categoria>"', () => {
    render(<SoundCategoryCard {...props} />);
    const button = screen.getByRole('button', { name: `Ouvir prévia de ${LABEL}` });
    expect(button).toBeInTheDocument();
  });

  it('axe não acusa violação de nome acessível em controles do seletor e da prévia', async () => {
    const { container } = render(<SoundCategoryCard {...props} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});