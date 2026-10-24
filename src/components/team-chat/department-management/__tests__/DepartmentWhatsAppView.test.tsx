import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DepartmentWhatsAppView } from '../DepartmentWhatsAppView';

/**
 * F77 — a config de WhatsApp do departamento é lida por
 * `get_department_whatsapp_config` e gravada por `set_department_whatsapp_config`
 * (contrato atual do hook): o formulário guarda `instance_id` + `api_key`, e não
 * a coluna/URL que não existe no banco.
 *
 * Renderiza o componente REAL e mocka o módulo de hooks no caminho exato que ele
 * importa, para provar leitura e escrita pelo contrato novo.
 */
type Credentials = {
  mode: 'none' | 'evolution' | 'official';
  instance_id: string | null;
  has_api_key: boolean;
  evolution_url: string | null;
};

const h = vi.hoisted(() => ({
  saveMutate: vi.fn(),
  error: false,
  credentials: undefined as Credentials | undefined,
}));

vi.mock('@/hooks/team-chat/useDepartmentManagement', () => ({
  useDepartmentWhatsAppCredentials: () => ({ data: h.credentials, isError: h.error }),
  useSaveDepartmentWhatsApp: () => ({ mutate: h.saveMutate, isPending: false }),
}));

describe('DepartmentWhatsAppView — config no contrato atual (F77)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.error = false;
    h.credentials = {
      mode: 'evolution',
      instance_id: 'inst-9',
      has_api_key: true,
      evolution_url: 'inst-9',
    };
  });

  it('lê o instance_id devolvido pelo contrato atual', () => {
    render(<DepartmentWhatsAppView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    expect(screen.getByLabelText('Instance ID da Evolution API')).toHaveValue('inst-9');
  });

  it('salva instance_id e api_key, sem os nomes legados', () => {
    render(<DepartmentWhatsAppView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    fireEvent.change(screen.getByLabelText('Instance ID da Evolution API'), { target: { value: 'inst-99' } });
    fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: 'chave-nova' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(h.saveMutate).toHaveBeenCalledTimes(1);
    const payload = h.saveMutate.mock.calls[0][0];
    expect(payload).toMatchObject({
      mode: 'evolution',
      config: { instance_id: 'inst-99', api_key: 'chave-nova' },
      actorName: 'Ana',
    });
    expect(payload.config).not.toHaveProperty('evolution_url');
    expect(payload.config).not.toHaveProperty('evolution_api_key');
    expect(payload.config).not.toHaveProperty('official_token');
  });

  it('não reenvia chave em branco (mantém a atual no banco)', () => {
    render(<DepartmentWhatsAppView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    const payload = h.saveMutate.mock.calls[0][0];
    expect(payload.config.api_key).toBeUndefined();
  });

  it('não oferece salvar para quem não é admin', () => {
    render(<DepartmentWhatsAppView departmentId="dep-1" currentUserName="Ana" isAdmin={false} />);
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();
  });

  it('erro na leitura da config não vira formulário em "Nenhum"', () => {
    h.error = true;
    h.credentials = undefined;
    render(<DepartmentWhatsAppView departmentId="dep-1" currentUserName="Ana" isAdmin />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a configuração de WhatsApp deste departamento.');
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();
  });
});
