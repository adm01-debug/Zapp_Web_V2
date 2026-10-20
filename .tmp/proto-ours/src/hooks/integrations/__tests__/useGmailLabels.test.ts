import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { callGmailFunction } from '@/hooks/gmail/gmailApi';
import { toast } from 'sonner';
import type { EmailLabel } from '@/hooks/gmail/gmailTypes';
import {
  useGmailLabelsManagement, gmailLabelsQueryKey, GMAIL_LABEL_MAX_NAME_LENGTH,
} from '../useGmailLabels';

vi.mock('@/hooks/gmail/gmailApi');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ACCOUNT_ID = 'acc1';
const KEY = gmailLabelsQueryKey(ACCOUNT_ID);

const BASE_LABELS: EmailLabel[] = [
  { id: 'l1', gmail_label_id: 'Label_1', name: 'Clientes', label_type: 'user', color: null, message_count: 3, unread_count: 1 },
  { id: 'l2', gmail_label_id: 'Label_2', name: 'Fornecedores', label_type: 'user', color: '#ff0000', message_count: 0, unread_count: 0 },
  { id: 'l3', gmail_label_id: 'INBOX', name: 'Inbox', label_type: 'system', color: null, message_count: 10, unread_count: 4 },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let client: QueryClient;

function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData<EmailLabel[]>(KEY, BASE_LABELS);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useGmailLabelsManagement(ACCOUNT_ID), { wrapper });
}

function cachedNames() {
  return (client.getQueryData<EmailLabel[]>(KEY) ?? []).map(label => label.name);
}

describe('useGmailLabelsManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createLabel entra na lista antes da resposta e envia a ação create-label', async () => {
    const pending = deferred<unknown>();
    vi.mocked(callGmailFunction).mockReturnValue(pending.promise as never);
    const { result } = setup();

    let call!: Promise<unknown>;
    act(() => { call = result.current.createLabel({ name: '  Promoções  ', labelListVisibility: 'labelShow' }); });

    // Otimista: já aparece na lista, com o nome aparado, ANTES da resposta.
    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox', 'Promoções']);
    expect(callGmailFunction).toHaveBeenCalledWith('gmail-sync', expect.objectContaining({
      action: 'create-label', account_id: ACCOUNT_ID, name: 'Promoções', label_list_visibility: 'labelShow',
    }));

    await act(async () => {
      pending.resolve({ success: true, label: { id: 'Label_9', name: 'Promoções' } });
      await call;
    });
    expect(toast.success).toHaveBeenCalledWith('Marcador "Promoções" criado.');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('createLabel desfaz a entrada otimista quando a Edge falha', async () => {
    vi.mocked(callGmailFunction).mockRejectedValue(new Error('Gmail API error (403): forbidden'));
    const { result } = setup();

    await act(async () => {
      await expect(result.current.createLabel({ name: 'Promoções' })).rejects.toThrow('403');
    });

    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox']);
    expect(toast.error).toHaveBeenCalledWith('Não foi possível criar o marcador: Gmail API error (403): forbidden');
  });

  it('renameLabel troca o nome na lista antes da resposta e envia update-label', async () => {
    const pending = deferred<unknown>();
    vi.mocked(callGmailFunction).mockReturnValue(pending.promise as never);
    const { result } = setup();

    let call!: Promise<unknown>;
    act(() => { call = result.current.renameLabel('Label_1', { name: 'Clientes VIP' }); });

    expect(cachedNames()).toEqual(['Clientes VIP', 'Fornecedores', 'Inbox']);
    expect(callGmailFunction).toHaveBeenCalledWith('gmail-sync', expect.objectContaining({
      action: 'update-label', account_id: ACCOUNT_ID, label_id: 'Label_1', name: 'Clientes VIP',
    }));

    await act(async () => {
      pending.resolve({ success: true, label: { id: 'Label_1', name: 'Clientes VIP' } });
      await call;
    });
    expect(toast.success).toHaveBeenCalledWith('Marcador atualizado.');
  });

  it('renameLabel devolve o nome anterior quando a Edge falha', async () => {
    vi.mocked(callGmailFunction).mockRejectedValue(new Error('falhou'));
    const { result } = setup();

    await act(async () => {
      await expect(result.current.renameLabel('Label_1', { name: 'Clientes VIP' })).rejects.toThrow('falhou');
    });

    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox']);
  });

  it('erro de uma mutação não apaga a atualização otimista de outra mutação em voo', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.mocked(callGmailFunction)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);
    const { result } = setup();

    let a!: Promise<unknown>;
    let b!: Promise<unknown>;
    act(() => { a = result.current.renameLabel('Label_1', { name: 'Clientes VIP' }); });
    act(() => { b = result.current.renameLabel('Label_2', { name: 'Parceiros' }); });
    expect(cachedNames()).toEqual(['Clientes VIP', 'Inbox', 'Parceiros']);

    await act(async () => {
      first.reject(new Error('falhou'));
      await expect(a).rejects.toThrow('falhou');
    });
    // A irmã em voo continua na tela; só o nome da que falhou volta atrás.
    expect(cachedNames()).toEqual(['Clientes', 'Inbox', 'Parceiros']);

    await act(async () => {
      second.resolve({ success: true, label: { id: 'Label_2', name: 'Parceiros' } });
      await b;
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('deleteLabel tira o marcador da lista antes da resposta e o devolve quando a Edge falha', async () => {
    const pending = deferred<unknown>();
    vi.mocked(callGmailFunction).mockReturnValue(pending.promise as never);
    const { result } = setup();

    let call!: Promise<unknown>;
    act(() => { call = result.current.deleteLabel('Label_2'); });
    expect(cachedNames()).toEqual(['Clientes', 'Inbox']);
    expect(callGmailFunction).toHaveBeenCalledWith('gmail-sync', expect.objectContaining({
      action: 'delete-label', account_id: ACCOUNT_ID, label_id: 'Label_2',
    }));

    await act(async () => {
      pending.reject(new Error('Gmail API error (500): boom'));
      await expect(call).rejects.toThrow('500');
    });

    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox']);
    expect(toast.error).toHaveBeenCalledWith('Não foi possível apagar o marcador: Gmail API error (500): boom');
  });

  it('resposta sem sucesso vira erro e desfaz a atualização otimista', async () => {
    vi.mocked(callGmailFunction).mockResolvedValue({ success: false, error: 'recusado' } as never);
    const { result } = setup();

    await act(async () => {
      await expect(result.current.deleteLabel('Label_2'))
        .rejects.toThrow('O Gmail não confirmou a remoção do marcador.');
    });

    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox']);
  });

  it('deleteLabel recusa marcador de sistema sem chamar a Edge e sem mexer na lista', async () => {
    const { result } = setup();

    await act(async () => {
      await expect(result.current.deleteLabel('INBOX'))
        .rejects.toThrow('Marcadores de sistema não podem ser apagados.');
    });

    expect(callGmailFunction).not.toHaveBeenCalled();
    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox']);
  });

  it('renameLabel recusa marcador de sistema sem chamar a Edge', async () => {
    const { result } = setup();

    await act(async () => {
      await expect(result.current.renameLabel('INBOX', { name: 'Caixa' }))
        .rejects.toThrow('Marcadores de sistema não podem ser renomeados.');
    });

    expect(callGmailFunction).not.toHaveBeenCalled();
  });

  it('nome vazio, só com espaços ou acima do limite é recusado sem chamar a Edge', async () => {
    const { result } = setup();

    await act(async () => {
      await expect(result.current.createLabel({ name: '   ' })).rejects.toThrow('Informe o nome do marcador.');
      await expect(result.current.createLabel({ name: 'a'.repeat(GMAIL_LABEL_MAX_NAME_LENGTH + 1) }))
        .rejects.toThrow(`não pode passar de ${GMAIL_LABEL_MAX_NAME_LENGTH} caracteres`);
      await expect(result.current.renameLabel('Label_1', { name: '  ' })).rejects.toThrow('Informe o nome do marcador.');
      await expect(result.current.renameLabel('Label_1', {}))
        .rejects.toThrow('Informe ao menos um campo para atualizar o marcador.');
    });

    expect(callGmailFunction).not.toHaveBeenCalled();
    expect(cachedNames()).toEqual(['Clientes', 'Fornecedores', 'Inbox']);
  });

  it('sem conta ativa recusa antes de chamar a Edge', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useGmailLabelsManagement(null), { wrapper });

    await act(async () => {
      await expect(result.current.createLabel({ name: 'Promoções' }))
        .rejects.toThrow('Nenhuma conta do Gmail ativa.');
    });

    expect(callGmailFunction).not.toHaveBeenCalled();
  });
});
