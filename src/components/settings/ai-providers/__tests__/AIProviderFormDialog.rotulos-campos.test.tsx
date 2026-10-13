/**
 * Cartão t_5cc4a897 — o formulário de provedor de IA tinha os seis campos
 * (Nome, Descrição, Endpoint, Secret, Modelo, Prompt) sem vínculo rótulo/campo
 * (sem id/htmlFor), então getByLabelText não os encontrava; e o FieldError
 * havia perdido `role="alert"`, então o erro não era anunciado.
 *
 * Este teste FALHA sem a correção (getByLabelText lança) e PASSA com ela.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIProviderFormDialog } from '../AIProviderFormDialog';
import { EMPTY_FORM } from '../types';

function renderizar() {
  return render(
    <AIProviderFormDialog
      open
      onOpenChange={() => {}}
      form={EMPTY_FORM}
      setForm={() => {}}
      editingId={null}
      isPending={false}
      onSave={() => {}}
      toggleUseFor={() => {}}
    />,
  );
}

const ROTULOS = [
  'Nome *',
  'Descrição',
  'Endpoint da API *',
  'Nome do Secret da API Key',
  'Modelo',
  'Prompt de Sistema',
];

describe('AIProviderFormDialog — rótulos vinculados e erros anunciados', () => {
  it('alcança cada um dos seis campos pelo seu rótulo', () => {
    renderizar();
    for (const rotulo of ROTULOS) {
      expect(screen.getByLabelText(rotulo)).toBeInTheDocument();
    }
  });

  it('anuncia o erro de validação com role="alert"', () => {
    renderizar();
    const alertas = screen.getAllByRole('alert');
    expect(alertas.some((alerta) => alerta.textContent === 'Nome é obrigatório.')).toBe(true);
  });
});
