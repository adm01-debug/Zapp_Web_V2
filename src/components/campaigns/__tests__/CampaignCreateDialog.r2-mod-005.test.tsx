/**
 * R2-MOD-005 / item 387 — o formulário de campanha oferecia público (etiqueta,
 * fila, grupo, seleção manual) e tipos de mensagem (imagem, vídeo, documento)
 * sem pedir o dado correspondente: a campanha era gravada com o tipo escolhido
 * e sem a seleção nem a mídia, e o consumidor não tinha como materializar a
 * audiência (addContactsToCampaign nunca era chamado pela tela).
 *
 * Prova (vermelho antes / verde depois): escolhido o público/mídia, o diálogo
 * REAL exige o campo correspondente e só manda para a mutação um payload com
 * `target_filter` e `media_url` preenchidos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// O Radix Select não responde a `fireEvent` no jsdom; o mock deixa cada
// SelectItem publicar o próprio `onValueChange` por contexto (mesmo padrão de
// AutomationEditorDialog.test.tsx) — a lógica sob teste é a do diálogo.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" data-value={value} onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
  };
});

import { CampaignCreateDialog } from '@/components/campaigns/CampaignCreateDialog';
import type { ComponentProps } from 'react';

const criarCampanhaMutate = vi.fn();
const criarCampanha = { mutate: criarCampanhaMutate, isPending: false } as unknown as ComponentProps<typeof CampaignCreateDialog>['createCampaign'];
const abrirFechar = vi.fn();

function preencherObrigatorios() {
  fireEvent.change(screen.getByLabelText('Nome da campanha'), { target: { value: 'Black Friday' } });
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Ofertas da semana' } });
}

function renderDialogo() {
  render(<CampaignCreateDialog open onOpenChange={abrirFechar} createCampaign={criarCampanha} />);
}

describe('CampaignCreateDialog — público e mídia exigem o campo correspondente (R2-MOD-005)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mensagem de imagem não é criada sem a URL da mídia e a URL vai no payload', () => {
    renderDialogo();
    preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Imagem' }));

    const campo = screen.getByLabelText('URL da mídia');
    const criar = screen.getByRole('button', { name: /criar campanha/i });
    expect(screen.getByRole('alert')).toHaveTextContent(/informe a URL da mídia/i);
    expect(criar).toBeDisabled();

    fireEvent.click(criar);
    expect(criarCampanhaMutate).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'https://cdn.exemplo/oferta.png' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(criar);

    expect(criarCampanhaMutate).toHaveBeenCalledTimes(1);
    const payload = criarCampanhaMutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('target_value');
    expect(payload).toMatchObject({
      name: 'Black Friday',
      message_type: 'image',
      media_url: 'https://cdn.exemplo/oferta.png',
      target_type: 'all',
      target_filter: null,
    });
  });

  it('público por etiqueta não é criado sem a etiqueta e ela vai em target_filter', () => {
    renderDialogo();
    preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Por etiqueta' }));

    const campo = screen.getByLabelText('Etiqueta');
    const criar = screen.getByRole('button', { name: /criar campanha/i });
    expect(screen.getByRole('alert')).toHaveTextContent(/informe etiqueta/i);
    expect(criar).toBeDisabled();

    fireEvent.click(criar);
    expect(criarCampanhaMutate).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'vip' } });
    fireEvent.click(criar);

    expect(criarCampanhaMutate).toHaveBeenCalledTimes(1);
    const payload = criarCampanhaMutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('target_value');
    expect(payload).toMatchObject({
      target_type: 'tag',
      target_filter: { tag: 'vip' },
      media_url: null,
    });
  });

  it('seleção manual exige os contatos e preserva a lista escolhida', () => {
    renderDialogo();
    preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Seleção manual' }));

    const campo = screen.getByLabelText('IDs dos contatos');
    const criar = screen.getByRole('button', { name: /criar campanha/i });
    expect(criar).toBeDisabled();

    fireEvent.change(campo, { target: { value: 'c1, c2,c3' } });
    fireEvent.click(criar);

    const payload = criarCampanhaMutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('target_value');
    expect(payload).toMatchObject({
      target_type: 'custom',
      target_filter: { contact_ids: ['c1', 'c2', 'c3'] },
    });
  });

  it('trocar o público limpa a seleção anterior (não herda a etiqueta na fila)', () => {
    renderDialogo();
    preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Por etiqueta' }));
    fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: 'vip' } });

    fireEvent.click(screen.getByRole('button', { name: 'Por fila' }));
    expect(screen.getByLabelText('Fila')).toHaveValue('');
    expect(screen.getByRole('button', { name: /criar campanha/i })).toBeDisabled();
  });

  it('texto para todos os contatos continua criando sem mídia nem filtro (regressão)', () => {
    renderDialogo();
    preencherObrigatorios();

    expect(screen.queryByLabelText('URL da mídia')).not.toBeInTheDocument();
    const criar = screen.getByRole('button', { name: /criar campanha/i });
    expect(criar).toBeEnabled();
    fireEvent.click(criar);

    const payload = criarCampanhaMutate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('target_value');
    expect(payload).toMatchObject({
      message_type: 'text',
      media_url: null,
      target_type: 'all',
      target_filter: null,
    });
  });
});
