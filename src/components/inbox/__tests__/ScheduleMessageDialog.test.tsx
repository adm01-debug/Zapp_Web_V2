/**
 * R3-01 — agendar mensagem no dia escolhido (fuso do navegador).
 *
 * O `<input type="date">` devolve `yyyy-MM-dd`. `new Date('yyyy-MM-dd')` é meia-noite **UTC**:
 * em UTC-3 a data cai no dia anterior, então a mensagem era agendada um dia antes do escolhido
 * e uma data futura válida ("amanhã 09:00") era recusada como passada.
 *
 * Âncora do teste: **30/09/2026 22:30 em São Paulo** (UTC-3) — o horário onde o defeito aparece.
 * As asserções comparam o INSTANTE agendado com o instante local esperado, construído aqui com
 * as partes da data, para o teste valer em qualquer fuso (em UTC o defeito é invisível).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ScheduleMessageDialog } from '@/components/inbox/ScheduleMessageDialog';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));

// Ponto de controle de "reduzir movimento" (mesma técnica do kit de microinterações).
const reduce = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduce.value,
}));

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** instante local (fuso do processo) de uma data/hora de calendário, como ISO */
const instanteLocal = (ano: number, mes: number, dia: number, h: number, min: number) =>
  new Date(ano, mes - 1, dia, h, min, 0, 0).toISOString();

function abrirDialogo() {
  const onSchedule = vi.fn();
  const onOpenChange = vi.fn();
  render(<ScheduleMessageDialog open onOpenChange={onOpenChange} onSchedule={onSchedule} />);
  fireEvent.change(screen.getByPlaceholderText(/digite a mensagem/i), {
    target: { value: 'Enviar proposta' },
  });
  return { onSchedule, onOpenChange };
}

const definir = (id: string, valor: string) =>
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value: valor } });

describe(`ScheduleMessageDialog — dia local (TZ=${TZ})`, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 30/09/2026 22:30 no fuso do processo (22:30 em São Paulo quando TZ=America/Sao_Paulo)
    vi.setSystemTime(new Date(2026, 8, 30, 22, 30, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('agenda "amanhã 09:00" para o instante escolhido (não recusa data futura válida)', () => {
    const { onSchedule } = abrirDialogo();
    definir('date', '2026-10-01');
    definir('time', '09:00');

    fireEvent.click(screen.getByRole('button', { name: /^agendar$/i }));

    expect(onSchedule).toHaveBeenCalledTimes(1);
    const agendado = onSchedule.mock.calls[0][1] as Date;
    expect(agendado.toISOString()).toBe(instanteLocal(2026, 10, 1, 9, 0));
  });

  it('agenda dois dias à frente no dia escolhido, não um dia antes', () => {
    const { onSchedule } = abrirDialogo();
    definir('date', '2026-10-03');
    definir('time', '09:00');

    fireEvent.click(screen.getByRole('button', { name: /^agendar$/i }));

    expect(onSchedule).toHaveBeenCalledTimes(1);
    const agendado = onSchedule.mock.calls[0][1] as Date;
    expect(agendado.toISOString()).toBe(instanteLocal(2026, 10, 3, 9, 0));
    expect(agendado.getDate()).toBe(3);
  });

  it('preview anuncia o dia escolhido', () => {
    abrirDialogo();
    definir('date', '2026-10-01');
    definir('time', '09:00');

    expect(screen.getByText(/01 de outubro/i)).toBeTruthy();
  });

  it('atalho "Amanhã 9h" continua marcando amanhã às 9h (regressão)', () => {
    const { onSchedule } = abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /amanhã 9h/i }));

    expect((document.getElementById('date') as HTMLInputElement).value).toBe('2026-10-01');
    expect((document.getElementById('time') as HTMLInputElement).value).toBe('09:00');

    fireEvent.click(screen.getByRole('button', { name: /^agendar$/i }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect((onSchedule.mock.calls[0][1] as Date).toISOString()).toBe(instanteLocal(2026, 10, 1, 9, 0));
  });
});

/**
 * R2-INB-010 — o agendamento fechava e apagava o rascunho ANTES de a persistência
 * confirmar: `handleSchedule` chamava `onSchedule` (assíncrono) sem aguardar, exibia o
 * aviso de sucesso, fechava o diálogo e limpava mensagem/anexo na hora. Uma falha de
 * gravação deixava o usuário com um falso "Mensagem agendada!" e sem o texto digitado.
 *
 * Estes testes usam temporizadores reais (controle de promessa + `waitFor`).
 */
describe('ScheduleMessageDialog — R2-INB-010: fecha e limpa o rascunho só após persistir', () => {
  beforeEach(() => {
    vi.useRealTimers();
    toastMock.mockClear();
  });

  const preencher = (onSchedule: (m: string, s: Date, a?: File) => Promise<void> | void, onOpenChange: (v: boolean) => void) => {
    render(<ScheduleMessageDialog open onOpenChange={onOpenChange} onSchedule={onSchedule} />);
    const texto = screen.getByPlaceholderText(/digite a mensagem/i) as HTMLTextAreaElement;
    fireEvent.change(texto, { target: { value: 'Enviar proposta' } });
    return texto;
  };

  const agendar = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^agendar$/i }));
    });
  };

  it('não fecha, não limpa o rascunho e não anuncia sucesso enquanto a persistência não confirma', async () => {
    let confirmar: (() => void) | undefined;
    const onSchedule = vi.fn(() => new Promise<void>((resolve) => { confirmar = resolve; }));
    const onOpenChange = vi.fn();
    const texto = preencher(onSchedule, onOpenChange);

    await agendar();

    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(texto.value).toBe('Enviar proposta');
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Mensagem agendada!' }));

    // Só depois de a persistência resolver é que o diálogo fecha.
    await act(async () => { confirmar?.(); });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mensagem agendada!' }));
  });

  it('mantém o diálogo aberto, o texto e o anexo quando a persistência falha', async () => {
    const onSchedule = vi.fn(() => Promise.reject(new Error('insert falhou')));
    const onOpenChange = vi.fn();
    const texto = preencher(onSchedule, onOpenChange);

    const arquivo = new File(['conteúdo'], 'contrato.pdf', { type: 'application/pdf' });
    fireEvent.change(document.getElementById('file-upload') as HTMLInputElement, { target: { files: [arquivo] } });
    expect(screen.getByText('contrato.pdf')).toBeTruthy();

    await agendar();

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível agendar' })));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(texto.value).toBe('Enviar proposta');
    expect(screen.getByText('contrato.pdf')).toBeTruthy();
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Mensagem agendada!' }));
  });

  it('fecha e limpa o rascunho quando a persistência confirma', async () => {
    const onSchedule = vi.fn(() => Promise.resolve());
    const onOpenChange = vi.fn();
    const texto = preencher(onSchedule, onOpenChange);

    await agendar();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(texto.value).toBe('');
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mensagem agendada!' }));
  });
});

/**
 * R3 — o produtor (ChatPanel.handleScheduleMessage) passa a RELANÇAR a falha.
 * Estados do diálogo: spinner com largura estável → check em sucesso; falha com
 * faixa destructive (mola) e "Tentar de novo"; foco no botão; movimento reduzido.
 */
describe('ScheduleMessageDialog — mensagem de erro por causa (componente real)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    toastMock.mockClear();
    reduce.value = false;
  });

  const erroNaTela = async (erro: unknown) => {
    const onSchedule = vi.fn(() => Promise.reject(erro));
    render(<ScheduleMessageDialog open onOpenChange={vi.fn()} onSchedule={onSchedule} />);
    fireEvent.change(screen.getByPlaceholderText(/digite a mensagem/i), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('agendar-mensagem'));
    });
    await waitFor(() => expect(screen.getByTestId('falha-agendamento')).toBeTruthy());
    return screen.getByTestId('falha-agendamento').textContent ?? '';
  };

  it.each([
    ['403 no status', { status: 403 }, 'Sem permissão para agendar nesta conversa'],
    ['403 como texto', { statusCode: '403' }, 'Sem permissão para agendar nesta conversa'],
    ['RLS 42501', { code: '42501' }, 'Sem permissão para agendar nesta conversa'],
    [
      'recusa de RLS do Postgres',
      { message: 'new row violates row-level security policy for table "scheduled_messages"' },
      'Sem permissão para agendar nesta conversa',
    ],
    ['falha de rede', new Error('Failed to fetch'), 'Não foi possível agendar. Tente de novo.'],
    ['erro de gravação', { code: '23514', message: 'check constraint' }, 'Não foi possível agendar. Tente de novo.'],
  ])('%s', async (_nome, erro, esperado) => {
    expect(await erroNaTela(erro)).toContain(esperado);
  });
});

describe(`ScheduleMessageDialog — estados de envio (TZ=${TZ})`, () => {
  beforeEach(() => {
    vi.useRealTimers();
    toastMock.mockClear();
    reduce.value = false;
  });

  const preencher = (onSchedule: (m: string, s: Date, a?: File) => Promise<void> | void, onOpenChange = vi.fn()) => {
    render(<ScheduleMessageDialog open onOpenChange={onOpenChange} onSchedule={onSchedule} />);
    const texto = screen.getByPlaceholderText(/digite a mensagem/i) as HTMLTextAreaElement;
    fireEvent.change(texto, { target: { value: 'Enviar proposta' } });
    return { texto, onOpenChange };
  };

  const clicarAgendar = async () => {
    await act(async () => {
      fireEvent.click(screen.getByTestId('agendar-mensagem'));
    });
  };

  it('403: diálogo aberto, faixa de permissão visível, rascunho preservado e sem toast de sucesso', async () => {
    const onSchedule = vi.fn(() =>
      Promise.reject(Object.assign(new Error('row-level security'), { statusCode: '403' })),
    );
    const { texto, onOpenChange } = preencher(onSchedule);
    const arquivo = new File(['conteúdo'], 'contrato.pdf', { type: 'application/pdf' });
    fireEvent.change(document.getElementById('file-upload') as HTMLInputElement, { target: { files: [arquivo] } });

    await clicarAgendar();

    await waitFor(() => expect(screen.getByTestId('falha-agendamento')).toBeTruthy());
    expect(screen.getByText('Sem permissão para agendar nesta conversa')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(texto.value).toBe('Enviar proposta');
    expect(screen.getByText('contrato.pdf')).toBeTruthy();
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Mensagem agendada!' }));
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeTruthy();
  });

  it('falha genérica: mensagem recuperável e botão "Tentar de novo"', async () => {
    const onSchedule = vi.fn(() => Promise.reject(new Error('Failed to fetch')));
    preencher(onSchedule);

    await clicarAgendar();

    await waitFor(() => expect(screen.getByTestId('falha-agendamento')).toBeTruthy());
    expect(screen.getByText('Não foi possível agendar. Tente de novo.')).toBeTruthy();
  });

  it('"Tentar de novo" reenvia com o mesmo rascunho e conclui', async () => {
    const onSchedule = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(undefined);
    const { texto, onOpenChange } = preencher(onSchedule);

    await clicarAgendar();
    await waitFor(() => expect(screen.getByTestId('falha-agendamento')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    });

    await waitFor(() => expect(onSchedule).toHaveBeenCalledTimes(2));
    expect(texto.value).toBe('Enviar proposta');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(texto.value).toBe('');
  });

  it('sucesso: check no botão ANTES de fechar e limpar o rascunho', async () => {
    const onSchedule = vi.fn(() => Promise.resolve());
    const { texto, onOpenChange } = preencher(onSchedule);

    await clicarAgendar();

    expect(screen.getByTestId('agendar-mensagem')).toHaveAttribute('data-state', 'success');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(texto.value).toBe('');
  });

  it('com movimento reduzido: faixa e selo entregam o estado sem deslocamento', async () => {
    reduce.value = true;
    const onSchedule = vi.fn(() => Promise.reject(new Error('Failed to fetch')));
    preencher(onSchedule);

    await clicarAgendar();

    await waitFor(() => expect(screen.getByTestId('falha-agendamento')).toBeTruthy());
    const faixa = screen.getByTestId('falha-agendamento');
    expect(faixa).toHaveAttribute('data-motion', 'reduced');
    expect(screen.getByTestId('selo-agendamento')).toHaveAttribute('data-motion', 'reduced');
    expect(screen.getByTestId('agendar-mensagem')).toHaveAttribute('data-motion', 'reduced');
    // Sem deslocamento: nada de transform de entrada na faixa.
    expect(faixa.getAttribute('style') ?? '').not.toMatch(/translate|scale/);
  });
});
