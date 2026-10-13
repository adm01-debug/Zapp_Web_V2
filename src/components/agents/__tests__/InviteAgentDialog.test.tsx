import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';
import { InviteAgentDialog } from '../InviteAgentDialog';
import { describeInviteError } from '../inviteErrors';

// t_227e36d1: o diálogo deixa de usar o template local `send-email` (que só dizia
// "acesse a plataforma e crie sua conta", sem link nem token) e passa a chamar a
// Edge `invite-user`, que convida pelo GoTrue (caminho para criar a senha, sem
// cadastro público) e grava o papel. Todo erro vira mensagem POR CAUSA, em vez do
// texto único "Erro ao enviar convite. Verifique a configuração de email".
//
// O teste monta o componente REAL e mocka só a borda (cliente Supabase, toast e o
// hook de papel), como manda a skill de área.

const roleState = { isAdmin: true };

// jsdom não implementa scrollIntoView, que o Radix Select chama ao abrir a lista.
Element.prototype.scrollIntoView = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: roleState.isAdmin, isSupervisor: true, loading: false }),
}));

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Erro do `functions.invoke` em resposta não-2xx: o corpo fica em `error.context`. */
function httpError(status: number, body: unknown) {
  return { name: 'FunctionsHttpError', context: { status, json: async () => body } };
}

function renderDialog() {
  return render(<InviteAgentDialog open onOpenChange={() => {}} />);
}

function preencherEmail(valor = 'ana@empresa.com') {
  fireEvent.change(screen.getByPlaceholderText('agente@empresa.com'), { target: { value: valor } });
}

function corpoEnviado() {
  const [, options] = vi.mocked(supabase.functions.invoke).mock.calls[0];
  return (options as { body: Record<string, unknown> }).body;
}

describe('InviteAgentDialog — convite pela Edge invite-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleState.isAdmin = true;
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { success: true }, error: null } as never);
  });

  it('chama invite-user com e-mail e papel, sem campos do template antigo', async () => {
    renderDialog();
    preencherEmail();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));

    const [fnName] = vi.mocked(supabase.functions.invoke).mock.calls[0];
    expect(fnName).toBe('invite-user');

    const body = corpoEnviado();
    expect(body).toEqual({ email: 'ana@empresa.com', role: 'agent' });

    // O corpo do invite-user é `.strict()` no servidor: nenhum campo a mais.
    for (const key of ['name', 'to', 'subject', 'html', 'text', 'cc', 'bcc', 'attachments', 'from', 'reply_to']) {
      expect(body).not.toHaveProperty(key);
    }

    expect(toast.success).toHaveBeenCalledWith('Convite enviado para ana@empresa.com!');
  });

  it('admin escolhe o papel do convidado', async () => {
    renderDialog();
    preencherEmail();

    fireEvent.click(screen.getByRole('combobox', { name: 'Cargo' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Supervisor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
    expect(corpoEnviado().role).toBe('supervisor');
  });

  it('supervisor não escolhe papel: só Atendente e o corpo vai com agent', async () => {
    roleState.isAdmin = false;
    renderDialog();
    preencherEmail();

    expect(screen.queryByRole('combobox', { name: 'Cargo' })).toBeNull();
    expect(screen.getByText(/supervisores convidam apenas atendentes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
    expect(corpoEnviado().role).toBe('agent');
  });

  it('não dispara o envio sem email preenchido', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Email é obrigatório');
  });

  it('403 mostra a explicação do servidor e mantém o diálogo aberto', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(403, { error: 'Apenas administradores e supervisores podem convidar usuários' }),
    } as never);

    renderDialog();
    preencherEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Apenas administradores e supervisores podem convidar usuários'),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('429 explica o limite de tentativas', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(429, { error: 'Rate limit exceeded' }),
    } as never);

    renderDialog();
    preencherEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.'),
    );
  });

  it('domínio recusado vira mensagem de domínio não confiável', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(400, { error: 'Dominio de email nao confiavel para convite' }),
    } as never);

    renderDialog();
    preencherEmail('ana@outrodominio.com');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Este domínio de e-mail não é confiável para convites.'),
    );
  });

  it('e-mail já cadastrado (mensagem do GoTrue em inglês) vira frase em pt-BR', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(400, { error: 'A user with this email address has already been registered' }),
    } as never);

    renderDialog();
    preencherEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Este e-mail já está cadastrado.'));
  });

  it('falha do servidor e queda de rede têm mensagem própria', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(500, { error: 'Internal server error' }),
    } as never);

    renderDialog();
    preencherEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível concluir o convite. Tente novamente em instantes.'),
    );

    vi.clearAllMocks();
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível falar com o servidor. Confira a conexão e tente novamente.'),
    );
  });

  it('describeInviteError cobre os códigos que a Edge devolve', () => {
    expect(describeInviteError(401, null)).toMatch(/sessão expirou/i);
    expect(describeInviteError(429, 'Rate limit exceeded')).toMatch(/muitas tentativas/i);
    expect(describeInviteError(403, 'Supervisor só pode convidar usuários com o papel agent')).toMatch(/supervisor só pode/i);
    expect(describeInviteError(403, null)).toMatch(/permissão/i);
    expect(describeInviteError(400, 'Dominio de email nao confiavel')).toMatch(/domínio/i);
    expect(describeInviteError(400, 'A user with this email address has already been registered')).toMatch(/já está cadastrado/i);
    expect(describeInviteError(null, null)).toMatch(/falar com o servidor/i);
    expect(describeInviteError(500, 'Internal server error')).toMatch(/em instantes/i);
  });

  it('combobox de cargo tem nome acessível e axe zerado', async () => {
    renderDialog();

    expect(screen.getByRole('combobox', { name: 'Cargo' })).toBeInTheDocument();

    const semRuidoDePagina = { rules: { region: { enabled: false } } };
    expect(await axe(document.body, semRuidoDePagina)).toHaveNoViolations();
  });
});
