import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * TL-168 (X182 · T06-053, T06-056, T06-063) — card "Ações da lista" no rail e
 * modal "Adicionar contato" com duas abas.
 *
 * Vermelho antes do fix:
 *  - `grep "Ações da lista"` na tela dava 0: o rail não tinha o card, e o
 *    "Adicionar contato" vivia só na barra de filtros (`SUP:142`);
 *  - o modal carregava um único caminho (contato existente): não havia aba de
 *    telefone avulso, nem máscara, nem mínimo de 10 dígitos;
 *  - telefone repetido voltava como erro cru do banco (23505).
 *
 * Recusa da entrega anterior (por isso este arquivo mudou): o envio gravava
 * `phone: addPhoneKey`, que guarda só os últimos 11 dígitos — `5511998877665`
 * era salvo truncado e a supressão não batia com o telefone inteiro nas
 * funções de banco. O teste "grava o telefone avulso com TODOS os dígitos"
 * fica vermelho com `phone: addPhoneKey` e verde com `phone: phoneDigits`.
 *
 * Este arquivo prova o que o usuário vê e o que vai para o banco.
 */

const BL = [
  {
    id: 'bl-1',
    contact_id: 'c1',
    phone: '+5511999990001',
    reason: 'Opt-out solicitado',
    blocked_by: 'profile-1',
    created_at: '2026-09-01T10:00:00.000Z',
    origin: 'optout',
    campaign_id: null,
    removed_by: null,
    removed_at: null,
    contacts: { name: 'Ana Souza', phone: '+5511999990001', company: 'ACME', avatar_url: null },
  },
  {
    id: 'bl-2',
    contact_id: null,
    phone: '11988887777',
    reason: 'Opt-out solicitado',
    blocked_by: 'profile-1',
    created_at: '2026-09-02T10:00:00.000Z',
    origin: 'manual',
    campaign_id: null,
    removed_by: null,
    removed_at: null,
    contacts: null,
  },
];

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  insertError: null as { code?: string; message: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const contactsChain = () => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.not = () => self;
    self.or = () => self;
    self.order = () => self;
    self.limit = () => Promise.resolve({ data: [{ id: 'c3', name: 'Carla Dias', phone: '+5511977770003' }], error: null });
    return self;
  };
  const blacklistChain = () => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.order = () => Promise.resolve({ data: BL, error: null });
    return self;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: (table: string) => (table === 'contacts' ? contactsChain() : blacklistChain()),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: (payload: Record<string, unknown>) => {
      h.inserts.push(payload);
      return Promise.resolve({ error: h.insertError });
    },
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'profile-1' }, session: {}, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '@/components/talkx/TalkXSuppression';
import { toast } from 'sonner';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSuppression />
    </QueryClientProvider>,
  );
}

async function abrirModal() {
  renderView();
  const acao = await screen.findByRole('button', { name: /Adicionar contato/i });
  fireEvent.click(acao);
  await screen.findByRole('tab', { name: 'Telefone avulso' });
  return acao;
}

async function irParaTelefoneAvulso() {
  // O trigger do Tabs (radix) troca de aba no mouseDown, não no click.
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Telefone avulso' }));
  return screen.findByPlaceholderText('(11) 91234-5678');
}

function bloquear() {
  return screen.getByRole('button', { name: /^Bloquear$/i });
}

describe('TalkXSuppression · Ações da lista no rail (X182/T06-053)', () => {
  beforeEach(() => {
    h.inserts.length = 0;
    h.insertError = null;
  });

  it('mostra o card "Ações da lista" com as quatro ações do mock', async () => {
    renderView();

    expect(await screen.findByText('Ações da lista')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar contato/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gerenciar motivos/ })).toBeTruthy();
    expect(screen.getByText('Importar contatos')).toBeTruthy();
    expect(screen.getByText('Exportar lista')).toBeTruthy();
  });

  it('deixa importar e exportar desabilitados (só entram com a etapa seguinte)', async () => {
    renderView();

    const importar = (await screen.findByRole('button', { name: /Importar contatos/ })) as HTMLButtonElement;
    const exportar = screen.getByRole('button', { name: /Exportar lista/ }) as HTMLButtonElement;

    expect(importar.disabled).toBe(true);
    expect(exportar.disabled).toBe(true);
  });

  it('tira o "Adicionar contato" da barra de filtros: ele passa a ser a ação do card', async () => {
    renderView();

    // Um único "Adicionar contato" na tela, dentro do card do rail.
    const acoes = await screen.findAllByRole('button', { name: /Adicionar contato/ });
    expect(acoes).toHaveLength(1);
    expect(acoes[0].closest('section')?.textContent).toContain('Ações da lista');
  });
});

describe('TalkXSuppression · modal Adicionar contato com duas abas (X182/T06-063)', () => {
  beforeEach(() => {
    h.inserts.length = 0;
    h.insertError = null;
    vi.mocked(toast.error).mockClear();
  });

  it('abre com as abas "Contato existente" e "Telefone avulso"', async () => {
    await abrirModal();

    expect(screen.getByRole('tab', { name: 'Contato existente' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Telefone avulso' })).toBeTruthy();
  });

  it('aplica a máscara brasileira enquanto digita e só habilita a partir de 10 dígitos', async () => {
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    // O rótulo está ligado ao campo (leitor de tela anuncia "Telefone").
    expect(screen.getByLabelText('Telefone')).toBe(campo);

    // 8 dígitos: máscara aplicada e envio ainda desabilitado.
    fireEvent.change(campo, { target: { value: '11998877' } });
    expect((campo as HTMLInputElement).value).toBe('(11) 9988-77');
    expect(bloquear()).toBeDisabled();

    fireEvent.click(bloquear());
    expect(h.inserts).toHaveLength(0);

    // 11 dígitos: máscara completa e envio liberado.
    fireEvent.change(campo, { target: { value: '11998877665' } });
    expect((campo as HTMLInputElement).value).toBe('(11) 99887-7665');
    expect(bloquear()).not.toBeDisabled();
  });

  it('envia o telefone avulso como `phone`, sem `contact_id`', async () => {
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    fireEvent.change(campo, { target: { value: '11998877665' } });
    fireEvent.click(bloquear());

    await waitFor(() => expect(h.inserts).toHaveLength(1));
    expect(h.inserts[0]).toMatchObject({
      phone: '11998877665',
      contact_id: null,
      origin: 'manual',
      reason: 'Opt-out solicitado',
      blocked_by: 'profile-1',
    });
  });

  it('grava o telefone avulso com TODOS os dígitos (55 incluso), sem truncar para os 11 últimos', async () => {
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    fireEvent.change(campo, { target: { value: '5511998877665' } });
    fireEvent.click(bloquear());

    await waitFor(() => expect(h.inserts).toHaveLength(1));
    // `5511998877665` tem 13 dígitos: gravar `addPhoneKey` salvaria só
    // `11998877665`, e a supressão não bateria no telefone inteiro.
    expect(h.inserts[0].phone).toBe('5511998877665');
    expect(h.inserts[0].contact_id).toBeNull();
  });

  it('telefone que já está na lista mostra "Este contato já está na lista" e não envia', async () => {
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    // O cadastro guarda o telefone com +55; o avulso é digitado sem ele — o
    // aviso tem de aparecer mesmo assim (a chave de comparação é `addPhoneKey`).
    fireEvent.change(campo, { target: { value: '11999990001' } });

    expect(await screen.findByText('Este contato já está na lista de supressão.')).toBeTruthy();
    expect(bloquear()).toBeDisabled();

    fireEvent.click(bloquear());
    expect(h.inserts).toHaveLength(0);
  });

  it('telefone avulso repetido (sem +55 no registro) também é reconhecido', async () => {
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    fireEvent.change(campo, { target: { value: '11988887777' } });

    expect(await screen.findByText('Este contato já está na lista de supressão.')).toBeTruthy();
    expect(bloquear()).toBeDisabled();
  });

  it('o aviso de duplicado do registro com +55 some quando o número digitado é novo', async () => {
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    // Primeiro bate no registro com +55 (aviso visível, envio travado)…
    fireEvent.change(campo, { target: { value: '11999990001' } });
    expect(await screen.findByText('Este contato já está na lista de supressão.')).toBeTruthy();
    expect(bloquear()).toBeDisabled();

    // …e com o número novo o aviso sai e o envio libera.
    fireEvent.change(campo, { target: { value: '5511998877665' } });
    expect(screen.queryByText('Este contato já está na lista de supressão.')).toBeNull();
    expect(bloquear()).not.toBeDisabled();
  });

  it('erro 23505 do banco vira a mensagem de duplicado, não o erro cru', async () => {
    h.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    await abrirModal();
    const campo = await irParaTelefoneAvulso();

    fireEvent.change(campo, { target: { value: '11998877665' } });
    fireEvent.click(bloquear());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Este contato já está na lista de supressão'));
    expect(vi.mocked(toast.error).mock.calls.flat().join(' ')).not.toContain('duplicate key');
  });
});

describe('TalkXSuppression · fechar o modal Adicionar (TL-168)', () => {
  beforeEach(() => {
    h.inserts.length = 0;
    h.insertError = null;
  });

  it('o botão Cancelar limpa aba, telefone e busca, igual ao fechamento por onOpenChange', async () => {
    await abrirModal();

    // Preenche os três campos: busca de contato, telefone avulso e a própria aba.
    fireEvent.change(await screen.findByPlaceholderText(/Nome ou telefone/), { target: { value: 'Carla' } });
    const campo = await irParaTelefoneAvulso();
    fireEvent.change(campo, { target: { value: '5511998877665' } });

    fireEvent.click(await screen.findByRole('button', { name: /^Cancelar$/i }));
    await waitFor(() => expect(screen.queryByPlaceholderText('(11) 91234-5678')).toBeNull());

    // Reabre: volta para a aba de contato, sem telefone e sem busca pendentes.
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar contato/i }));
    expect(await screen.findByRole('tab', { name: 'Contato existente' })).toBeTruthy();
    expect((screen.getByPlaceholderText(/Nome ou telefone/) as HTMLInputElement).value).toBe('');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Telefone avulso' }));
    expect((await screen.findByPlaceholderText('(11) 91234-5678') as HTMLInputElement).value).toBe('');
  });
});
