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
