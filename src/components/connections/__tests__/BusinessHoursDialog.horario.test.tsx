/**
 * Diálogo de horário comercial — honestidade do envio de ausência, validação de
 * início/fim e janela que vira a meia-noite.
 *
 * O sujeito é o componente REAL; a dublagem é só a fronteira do hook de dados
 * (`useBusinessHours`). O selo ao lado da conexão é stubado, mas a regra de
 * horário que o diálogo usa vem do módulo real (`importActual`), para o teste
 * provar a mesma regra que o selo mostra.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  hours: [] as Array<{
    day_of_week: number;
    is_open: boolean;
    open_time: string;
    close_time: string;
  }>,
  away: null as unknown,
  saveSettings: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...rest
    }: { children?: React.ReactNode; initial?: unknown; animate?: unknown; transition?: unknown }) => (
      <div {...rest}>{children}</div>
    ),
  },
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../BusinessHoursIndicator', async () => ({
  ...(await vi.importActual<typeof import('../BusinessHoursIndicator')>('../BusinessHoursIndicator')),
  BusinessHoursIndicator: () => null,
}));
vi.mock('@/hooks/business/useBusinessHours', () => ({
  useBusinessHours: () => ({
    businessHours: h.hours,
    awayMessage: h.away,
    isLoading: false,
    isSaving: false,
    saveSettings: h.saveSettings,
  }),
}));

import { BusinessHoursDialog, resolverVariaveisExemplo } from '../BusinessHoursDialog';

const props = {
  open: true,
  onOpenChange: vi.fn(),
  connectionId: 'conn-1',
  connectionName: 'Principal',
};

/** Semana padrão: sábado e domingo fechados, resto aberto no horário dado. */
function semana(abre = '09:00', fecha = '18:00') {
  return Array.from({ length: 7 }, (_, dia) => ({
    day_of_week: dia,
    is_open: dia >= 1 && dia <= 5,
    open_time: abre,
    close_time: fecha,
  }));
}

beforeEach(() => {
  h.hours = semana();
  h.away = null;
  h.saveSettings.mockReset();
});

function botaoSalvar() {
  return screen.getByRole('button', { name: /Salvar Configurações/ }) as HTMLButtonElement;
}

function interruptorAusencia() {
  return screen.getByLabelText('Enviar mensagem de ausência') as HTMLButtonElement;
}

describe('BusinessHoursDialog — início/fim', () => {
  it('início igual ao fim mostra o erro e trava o salvamento', () => {
    h.hours = semana('09:00', '09:00');
    render(<BusinessHoursDialog {...props} />);

    expect(
      screen.getAllByText('Início e fim não podem ser iguais — ajuste o horário deste dia.').length,
    ).toBeGreaterThan(0);
    expect(botaoSalvar().disabled).toBe(true);
    expect(screen.queryByText('vira o dia')).toBeNull();
  });

  it('janela normal salva e não mostra alerta nem "vira o dia"', async () => {
    render(<BusinessHoursDialog {...props} />);

    expect(screen.queryByText('vira o dia')).toBeNull();
    expect(botaoSalvar().disabled).toBe(false);

    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(h.saveSettings).toHaveBeenCalledTimes(1));
    expect(h.saveSettings.mock.calls[0][0]).toEqual(h.hours);
  });

  it('janela que vira o dia (22:00→06:00) é válida e marcada com "vira o dia"', async () => {
    h.hours = semana('22:00', '06:00');
    render(<BusinessHoursDialog {...props} />);

    expect(screen.getAllByText('vira o dia').length).toBeGreaterThan(0);
    expect(botaoSalvar().disabled).toBe(false);

    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(h.saveSettings).toHaveBeenCalledTimes(1));
  });
});

describe('BusinessHoursDialog — envio automático da mensagem de ausência', () => {
  it('sem a coluna do PL-04: interruptor desabilitado e aviso "Disponível em breve"', () => {
    render(<BusinessHoursDialog {...props} />);

    const interruptor = interruptorAusencia();
    expect(interruptor.disabled).toBe(true);
    expect(interruptor.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/Disponível em breve/)).toBeTruthy();
  });

  it('a regra anunciada é a que o envio terá: 1 por contato a cada 24 h, só fora do horário', () => {
    render(<BusinessHoursDialog {...props} />);

    expect(
      screen.getByText(
        /No máximo 1 mensagem por contato a cada 24 h, somente quando a conversa estiver fora do horário de atendimento\./,
      ),
    ).toBeTruthy();
    // A promessa antiga (envio automático como se já existisse) não aparece mais.
    expect(screen.queryByText(/será enviada automaticamente/)).toBeNull();
  });

  it('com a coluna do PL-04 na linha, o interruptor fica habilitado e reflete o valor salvo', () => {
    h.away = {
      whatsapp_connection_id: 'conn-1',
      content: 'Olá',
      is_enabled: true,
      enabled: true,
    };
    render(<BusinessHoursDialog {...props} />);

    const interruptor = interruptorAusencia();
    expect(interruptor.disabled).toBe(false);
    expect(interruptor.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(/Disponível em breve/)).toBeNull();
  });

  it('o `enabled` só vai para o salvamento quando a coluna existe', async () => {
    render(<BusinessHoursDialog {...props} />);

    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(h.saveSettings).toHaveBeenCalledTimes(1));
    expect(h.saveSettings.mock.calls[0][1]).not.toHaveProperty('enabled');
  });

  it('prévia mostra a mensagem como o cliente recebe, com as variáveis preenchidas', () => {
    h.away = {
      whatsapp_connection_id: 'conn-1',
      content: 'Olá {nome}! Abrimos às {horario_abertura} e fechamos às {horario_fechamento}.',
      is_enabled: true,
    };
    render(<BusinessHoursDialog {...props} />);

    expect(
      screen.getByText('Olá Ana! Abrimos às 09:00 e fechamos às 18:00.'),
    ).toBeTruthy();
  });

  it('prévia com horário do banco (HH:MM:SS) mostra HH:MM', () => {
    h.hours = semana('09:00:00', '18:00:00');
    h.away = {
      whatsapp_connection_id: 'conn-1',
      content: 'Abrimos às {horario_abertura} e fechamos às {horario_fechamento}.',
      is_enabled: true,
    };
    render(<BusinessHoursDialog {...props} />);

    expect(
      screen.getByText('Abrimos às 09:00 e fechamos às 18:00.'),
    ).toBeTruthy();
  });

  it('prévia vazia convida a digitar; a função de substituição só troca o que conhece', () => {
    render(<BusinessHoursDialog {...props} />);
    expect(screen.getByText('Digite a mensagem para ver como o cliente vai recebê-la.')).toBeTruthy();

    expect(
      resolverVariaveisExemplo('{nome}: {horario_abertura} / {desconhecida}', {
        nome: 'Ana',
        abertura: '09:00',
        fechamento: '18:00',
      }),
    ).toBe('Ana: 09:00 / {desconhecida}');
  });
});
