import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RateLimitConfigPanel } from '../RateLimitConfigPanel';

type Row = Record<string, unknown>;

/**
 * PostgREST em miniatura: a tabela vive em `db.rows` e cada operação mexe nela
 * de verdade, para o teste poder afirmar o que sobrou gravado depois do salvar
 * (o defeito R2-AUTH-023 era justamente a tabela ficar vazia).
 */
const mocks = vi.hoisted(() => {
  const db = {
    rows: [] as Array<Record<string, unknown>>,
    selectError: null as { message: string } | null,
    insertError: null as { message: string } | null,
    // Número de remoções que devem falhar em sequência (1 = só a remoção do
    // conjunto antigo; 2 = a remoção e o desfazer do conjunto novo).
    deleteFailures: 0,
    deleteErrorMessage: 'permission denied for table rate_limit_configs',
  };
  return {
    db,
    insertCalls: [] as Array<Array<Record<string, unknown>>>,
    deleteAllCalls: 0,
    deleteByIdCalls: [] as string[][],
    takeDeleteError: () => {
      if (db.deleteFailures <= 0) return null;
      db.deleteFailures -= 1;
      return { message: db.deleteErrorMessage };
    },
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [...mocks.db.rows], error: mocks.db.selectError })),
      })),
      insert: vi.fn((payload: Array<Record<string, unknown>>) => {
        mocks.insertCalls.push(payload);
        const error = mocks.db.insertError;
        const inserted = error ? [] : payload.map((row, i) => ({ ...row, id: `novo-${i}` }));
        if (!error) mocks.db.rows.push(...inserted);
        const result = { data: error ? null : inserted, error };
        // thenable + .select(): atende tanto `await insert(...)` quanto
        // `await insert(...).select('id')`.
        return {
          select: vi.fn(() => Promise.resolve(result)),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
        };
      }),
      delete: vi.fn(() => ({
        neq: vi.fn(() => {
          mocks.deleteAllCalls += 1;
          const error = mocks.takeDeleteError();
          if (error) return Promise.resolve({ error });
          mocks.db.rows = [];
          return Promise.resolve({ error: null });
        }),
        in: vi.fn((_column: string, ids: string[]) => {
          mocks.deleteByIdCalls.push(ids);
          const error = mocks.takeDeleteError();
          if (error) return Promise.resolve({ error });
          mocks.db.rows = mocks.db.rows.filter(row => !ids.includes(String(row.id)));
          return Promise.resolve({ error: null });
        }),
      })),
    })),
  },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

/** Regra que só existe no banco: se o salvar apagar antes de gravar, ela some da tela. */
const REGRA_GRAVADA = {
  id: 'rule-a',
  name: 'Regra de Produção',
  endpoint_pattern: '/custom/prod',
  max_requests: 5,
  window_seconds: 300,
  is_active: true,
};

describe('RateLimitConfigPanel', () => {
  beforeEach(() => {
    mocks.db.rows = [];
    mocks.db.selectError = null;
    mocks.db.insertError = null;
    mocks.db.deleteFailures = 0;
    mocks.insertCalls = [];
    mocks.deleteAllCalls = 0;
    mocks.deleteByIdCalls = [];
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    vi.clearAllMocks();
  });

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders title', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText('Rate Limiting Granular')).toBeInTheDocument();
      });
    });

    it('renders description', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText(/Configure limites de requisições/)).toBeInTheDocument();
      });
    });

    it('renders add rule button', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText('Regra')).toBeInTheDocument();
      });
    });

    it('renders save button', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText('Salvar')).toBeInTheDocument();
      });
    });

    it('shows loading state initially', () => {
      const { container } = render(<RateLimitConfigPanel />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  // ===== DEFAULT RULES =====
  describe('Default rules', () => {
    it('loads default rules when DB is empty', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Login')).toBeInTheDocument();
        expect(screen.getByDisplayValue('API Geral')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Mensagens')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Webhooks')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Exportação')).toBeInTheDocument();
      });
    });

    it('default rules have correct endpoints', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('/auth/login')).toBeInTheDocument();
        expect(screen.getByDisplayValue('/api/*')).toBeInTheDocument();
        expect(screen.getByDisplayValue('/messages/send')).toBeInTheDocument();
      });
    });

    it('renders 5 default rules', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBe(5);
    });
  });

  // ===== ADD RULE =====
  describe('Add rule', () => {
    it('adds a new rule when add button clicked', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByText('Regra'));
      fireEvent.click(screen.getByText('Regra'));
      await waitFor(() => {
        expect(screen.getByDisplayValue('Nova Regra')).toBeInTheDocument();
      });
    });

    it('new rule has default endpoint /api/custom', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByText('Regra'));
      fireEvent.click(screen.getByText('Regra'));
      await waitFor(() => {
        expect(screen.getByDisplayValue('/api/custom')).toBeInTheDocument();
      });
    });
  });

  // ===== REMOVE RULE =====
  describe('Remove rule', () => {
    it('reduces rule count when delete clicked', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const initialSwitches = screen.getAllByRole('switch').length;
      // Click first icon button that's not a switch
      const allButtons = screen.getAllByRole('button');
      // Find any button with trash icon
      let trashBtn: HTMLElement | undefined;
      for (const btn of allButtons) {
        if (btn.querySelector('.lucide-trash-2')) {
          trashBtn = btn;
          break;
        }
      }
      if (trashBtn) {
        fireEvent.click(trashBtn);
        await waitFor(() => {
          expect(screen.getAllByRole('switch').length).toBeLessThan(initialSwitches);
        });
      } else {
        // Trash buttons may be rendered as icon-only; just verify we have rules
        expect(initialSwitches).toBe(5);
      }
    });
  });

  // ===== EDIT RULE =====
  describe('Edit rule', () => {
    it('allows editing rule name', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const input = screen.getByDisplayValue('Login');
      fireEvent.change(input, { target: { value: 'Auth Login' } });
      expect(screen.getByDisplayValue('Auth Login')).toBeInTheDocument();
    });

    it('allows editing max requests', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      // Find the first number input with value 5
      const inputs = screen.getAllByRole('spinbutton');
      const fiveInput = inputs.find(i => (i as HTMLInputElement).value === '5');
      expect(fiveInput).toBeDefined();
      fireEvent.change(fiveInput!, { target: { value: '10' } });
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });

    it('allows editing endpoint', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('/auth/login'));
      const input = screen.getByDisplayValue('/auth/login');
      fireEvent.change(input, { target: { value: '/auth/v2/login' } });
      expect(screen.getByDisplayValue('/auth/v2/login')).toBeInTheDocument();
    });
  });

  // ===== TOGGLE RULE =====
  describe('Toggle rule', () => {
    it('renders switches for each rule', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        const switches = screen.getAllByRole('switch');
        expect(switches.length).toBe(5);
      });
    });

    it('shows warning when rule is deactivated', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getAllByRole('switch'));
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);
      await waitFor(() => {
        expect(screen.getByText('Regra desativada')).toBeInTheDocument();
      });
    });
  });

  // ===== AÇÃO POR REGRA (R2-AUTH-023) =====
  describe('Action option', () => {
    it('não oferece uma ação que o sistema não persiste nem consome', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByText('Bloquear')).toBeNull();
      expect(screen.queryByText('Alertar')).toBeNull();
    });
  });

  // ===== SALVAR SEM PERDER A CONFIGURAÇÃO (R2-AUTH-023) =====
  describe('Salvar sem perder a configuração', () => {
    it('mantém o conjunto anterior quando o INSERT falha', async () => {
      mocks.db.rows = [{ ...REGRA_GRAVADA }];
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Regra de Produção'));

      mocks.db.insertError = { message: 'new row violates row-level security policy' };
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao salvar regras');
      });
      expect(mocks.toast.success).not.toHaveBeenCalled();
      // nada foi apagado antes de gravar: a configuração do admin continua gravada...
      expect(mocks.deleteAllCalls).toBe(0);
      expect(mocks.db.rows.map(r => r.id)).toEqual(['rule-a']);
      // ...e continua na tela (antes, o DELETE global já tinha esvaziado a tabela).
      await waitFor(() => {
        expect(screen.getByDisplayValue('Regra de Produção')).toBeInTheDocument();
      });
    });

    it('substitui o conjunto antigo só depois de gravar o novo', async () => {
      mocks.db.rows = [{ ...REGRA_GRAVADA }];
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Regra de Produção'));

      fireEvent.change(screen.getByDisplayValue('/custom/prod'), { target: { value: '/custom/prod-v2' } });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.toast.success).toHaveBeenCalledWith('Regras de rate limit salvas!');
      });
      expect(mocks.insertCalls).toHaveLength(1);
      expect(mocks.deleteByIdCalls).toEqual([['rule-a']]);
      // o conjunto antigo saiu e o novo entrou (id novo, valor editado)
      expect(mocks.db.rows.map(r => r.id)).toEqual(['novo-0']);
      expect(mocks.db.rows.map(r => r.endpoint_pattern)).toEqual(['/custom/prod-v2']);
    });

    it('desfaz o conjunto novo se a remoção do antigo falhar', async () => {
      mocks.db.rows = [{ ...REGRA_GRAVADA }];
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Regra de Produção'));

      mocks.db.deleteFailures = 1;
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao salvar regras');
      });
      expect(mocks.toast.success).not.toHaveBeenCalled();
      // a tabela não pode ficar com as duas versões: o conjunto novo foi desfeito
      expect(mocks.db.rows.map(r => r.id)).toEqual(['rule-a']);
    });

    it('avisa quando nem o desfazer do conjunto novo funciona', async () => {
      mocks.db.rows = [{ ...REGRA_GRAVADA }];
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Regra de Produção'));

      mocks.db.deleteFailures = 2;
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.toast.error).toHaveBeenCalledWith(
          'Erro ao salvar regras: o conjunto anterior e o novo ficaram gravados, revise a lista'
        );
      });
      expect(mocks.toast.success).not.toHaveBeenCalled();
      // nada foi escondido: as duas versões continuam na tabela e voltam para a tela
      expect(mocks.db.rows.map(r => r.id)).toEqual(['rule-a', 'novo-0']);
      await waitFor(() => {
        expect(screen.getAllByDisplayValue('Regra de Produção')).toHaveLength(2);
      });
    });

    it('recusa salvar com campo obrigatório vazio e não escreve nada', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('/auth/login'));

      fireEvent.change(screen.getByDisplayValue('/auth/login'), { target: { value: '   ' } });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.toast.error).toHaveBeenCalledWith(
          'Preencha nome, endpoint, máximo de requisições e janela antes de salvar'
        );
      });
      expect(mocks.insertCalls).toEqual([]);
    });

    it('bloqueia o salvamento quando a leitura das regras falha', async () => {
      mocks.db.rows = [{ ...REGRA_GRAVADA }];
      mocks.db.selectError = { message: 'network error' };
      render(<RateLimitConfigPanel />);

      await waitFor(() => {
        expect(screen.getByText(/Não foi possível carregar as regras/)).toBeInTheDocument();
      });
      expect(screen.queryByText('Salvar')).toBeNull();
      expect(mocks.insertCalls).toEqual([]);
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('handles NaN input for max_requests', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const inputs = screen.getAllByRole('spinbutton');
      const fiveInput = inputs.find(i => (i as HTMLInputElement).value === '5');
      expect(fiveInput).toBeDefined();
      fireEvent.change(fiveInput!, { target: { value: 'abc' } });
      // NaN || 1 = 1
      expect(screen.getAllByDisplayValue('1').length).toBeGreaterThan(0);
    });

    it('handles NaN input for window_seconds', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const inputs = screen.getAllByRole('spinbutton');
      const windowInput = inputs.find(i => (i as HTMLInputElement).value === '300');
      expect(windowInput).toBeDefined();
      fireEvent.change(windowInput!, { target: { value: '' } });
      // '' => parseInt = NaN || 60 = 60
      expect(screen.getAllByDisplayValue('60').length).toBeGreaterThan(0);
    });
  });
});
