import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Painel de domínios confiáveis sem rede: a fronteira (o hook) é substituída por um
 * controle do teste e o resto é o componente real. O que importa provar aqui é que a
 * tela não deixa salvar lixo, mostra a lista que veio do banco e devolve exatamente a
 * lista serializada que `handle_new_user_role()` sabe ler.
 */

const estado = vi.hoisted(() => ({
  salvar: vi.fn(),
  dominios: ['promobrindes.com.br'] as string[],
  atualizadoEm: '2026-10-16T23:35:40.135578+00:00' as string | null,
  isLoading: false,
  error: null as string | null,
}));

vi.mock('@/pages/admin/useTrustedDomains', () => ({
  useTrustedDomains: () => ({
    dominios: estado.dominios,
    valorSalvo: estado.dominios.join(','),
    atualizadoEm: estado.atualizadoEm,
    semLinha: false,
    isLoading: estado.isLoading,
    error: estado.error,
    salvar: estado.salvar,
    refetch: vi.fn(),
  }),
  useProvisionamentoRecente: () => ({
    eventos: [
      {
        id: 'a1',
        action: 'role_auto_provisioned',
        created_at: '2026-10-15T21:56:57.084346+00:00',
        email: 'e2e@promobrindes.com.br',
        dominio: 'promobrindes.com.br',
        motivo: null,
      },
      {
        id: 'a2',
        action: 'role_auto_provision_denied',
        created_at: '2026-11-23T21:11:54.449524+00:00',
        email: 'externa@outra.test',
        dominio: 'outra.test',
        motivo: 'domain_not_trusted',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TrustedDomainsPanel } from '@/pages/admin/TrustedDomainsPanel';

beforeEach(() => {
  estado.salvar.mockReset();
  estado.salvar.mockResolvedValue('promobrindes.com.br');
  estado.dominios = ['promobrindes.com.br'];
  estado.isLoading = false;
  estado.error = null;
});

describe('painel de domínios confiáveis', () => {
  it('lista o domínio que veio do banco e o salvar começa desabilitado', () => {
    render(<TrustedDomainsPanel />);
    expect(screen.getByText('promobrindes.com.br')).toBeTruthy();
    const salvar = screen.getByRole('button', { name: /Salvar domínios/i }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
  });

  it('recusa domínio inválido sem tocar no rascunho', () => {
    render(<TrustedDomainsPanel />);
    const campo = screen.getByLabelText(/Novo domínio confiável/i);
    fireEvent.change(campo, { target: { value: 'joao@empresa.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/sem o e-mail/i);
    expect(screen.getByRole('button', { name: /Salvar domínios/i })).toHaveProperty('disabled', true);
    expect(estado.salvar).not.toHaveBeenCalled();
  });

  it('adiciona, envia a lista serializada e destrava o salvar só quando muda', async () => {
    render(<TrustedDomainsPanel />);
    const campo = screen.getByLabelText(/Novo domínio confiável/i);
    fireEvent.change(campo, { target: { value: ' @Outra.com.br ' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/i }));

    const salvar = screen.getByRole('button', { name: /Salvar domínios/i }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);

    await waitFor(() => expect(estado.salvar).toHaveBeenCalledWith(['promobrindes.com.br', 'outra.com.br']));
  });

  it('avisa que lista vazia volta ao padrão do banco', () => {
    estado.dominios = [];
    render(<TrustedDomainsPanel />);
    expect(screen.getByText(/Enquanto estiver vazia/)).toBeTruthy();
    expect(screen.getAllByText(/promobrindes\.com\.br/).length).toBeGreaterThan(0);
  });

  it('mostra quem foi aceito e quem foi recusado no cadastro automático', () => {
    render(<TrustedDomainsPanel />);
    expect(screen.getByText('e2e@promobrindes.com.br')).toBeTruthy();
    expect(screen.getByText('externa@outra.test')).toBeTruthy();
    expect(screen.getByText('Agente')).toBeTruthy();
    expect(screen.getByText('Recusado')).toBeTruthy();
  });

  it('falha de leitura aparece como erro com nova tentativa, não como lista vazia', () => {
    estado.error = 'permission denied for table app_settings';
    render(<TrustedDomainsPanel />);
    expect(screen.getByRole('alert').textContent).toMatch(/permission denied/);
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();
    expect(screen.queryByText(/Enquanto estiver vazia/)).toBeNull();
  });
});