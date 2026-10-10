import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RuleRow } from '../segments/RuleRow';
import { RuleValueInput } from '../segments/RuleValueInput';
import { isRuleComplete, type SegmentRule } from '@/hooks/integrations/useTalkXSegments';

/**
 * TL-131 (escopo reduzido) — data/período e número do construtor de segmentos.
 *
 * O que estava errado antes (vermelho): o valor da condição era sempre uma caixa
 * de texto livre. Dava para digitar `abc` num campo de número e `0`/texto num
 * período em dias; a tela aceitava o que o motor não pode usar.
 *
 * A prova monta o `RuleRow` VERDADEIRO (o `isRuleComplete` também é o real) e
 * digita como o usuário; ela julga o que o campo MOSTRA (o valor que vai para a
 * regra) e se a condição fica utilizável. Os ramos de vários valores, moeda e
 * sim/não não fazem parte deste cartão e aqui só se confere que NÃO mudaram.
 */

/** Deixa o `RuleRow` controlado como na tela: o patch sobe e volta como prop. */
function Harness({ inicial }: { inicial: SegmentRule }) {
  const [rule, setRule] = useState<SegmentRule>(inicial);
  return (
    <div>
      <RuleRow rule={rule} onChange={(patch) => setRule((r) => ({ ...r, ...patch }))} onRemove={() => {}} />
      <span data-testid="completa">{isRuleComplete(rule) ? 'sim' : 'nao'}</span>
    </div>
  );
}

const regraPeriodo = (): SegmentRule => ({ id: 'r1', field: 'updated_at', op: 'in_last_days', value: '' });
const regraNumero = (): SegmentRule => ({ id: 'r2', field: 'lead_score', op: 'eq', value: '' });

describe('RuleValueInput · período em dias (TL-131)', () => {
  it('só aceita dígitos: texto some, o dígito extra entra e o zero à esquerda não fica (dias > 0)', () => {
    render(<Harness inicial={regraPeriodo()} />);
    const dias = screen.getByLabelText('Período em dias') as HTMLInputElement;

    fireEvent.change(dias, { target: { value: '3x7' } });
    expect(dias.value).toBe('37');

    fireEvent.change(dias, { target: { value: '00' } });
    expect(dias.value).toBe('');

    fireEvent.change(dias, { target: { value: '30' } });
    expect(dias.value).toBe('30');
  });

  it('digitar texto não entra no campo e a condição fica incompleta', () => {
    render(<Harness inicial={regraPeriodo()} />);
    const dias = screen.getByLabelText('Período em dias') as HTMLInputElement;

    fireEvent.change(dias, { target: { value: 'abc' } });
    expect(dias.value).toBe('');

    fireEvent.change(dias, { target: { value: '0' } });
    expect(dias.value).toBe('');
    expect(screen.getByTestId('completa')).toHaveTextContent('nao');
  });

  it('dias válidos deixam a condição utilizável e é isso que a regra grava', () => {
    render(<Harness inicial={regraPeriodo()} />);
    const dias = screen.getByLabelText('Período em dias') as HTMLInputElement;

    fireEvent.change(dias, { target: { value: '45' } });
    expect(dias.value).toBe('45');
    expect(screen.getByTestId('completa')).toHaveTextContent('sim');
  });

  it('atalhos de período gravam o dia correspondente', () => {
    render(<Harness inicial={regraPeriodo()} />);
    const dias = screen.getByLabelText('Período em dias') as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    expect(dias.value).toBe('30');
    expect(screen.getByTestId('completa')).toHaveTextContent('sim');
  });
});

describe('RuleValueInput · número (TL-131)', () => {
  it('descarta texto e mantém o decimal, sem máscara', () => {
    render(<Harness inicial={regraNumero()} />);
    const valor = screen.getByLabelText('Valor da condição') as HTMLInputElement;

    fireEvent.change(valor, { target: { value: '8a0' } });
    expect(valor.value).toBe('80');

    fireEvent.change(valor, { target: { value: '3.5' } });
    expect(valor.value).toBe('3.5');

    fireEvent.change(valor, { target: { value: '1.2.3' } });
    expect(valor.value).toBe('1.23');
  });

  it('texto no campo de número não entra e a condição fica incompleta', () => {
    render(<Harness inicial={regraNumero()} />);
    const valor = screen.getByLabelText('Valor da condição') as HTMLInputElement;

    fireEvent.change(valor, { target: { value: 'abc' } });
    expect(valor.value).toBe('');
    expect(screen.getByTestId('completa')).toHaveTextContent('nao');

    fireEvent.change(valor, { target: { value: '80' } });
    expect(valor.value).toBe('80');
    expect(screen.getByTestId('completa')).toHaveTextContent('sim');
  });
});

describe('RuleValueInput · escopo deste cartão', () => {
  it('operador sem valor e tipo fora de data/número não têm controle aqui', () => {
    const { container } = render(
      <>
        <RuleValueInput field="updated_at" op="is_set" value="" onChange={() => {}} />
        <RuleValueInput field="tags" op="contains" value="vip" onChange={() => {}} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('o ramo de texto do RuleRow segue sendo a caixa livre de antes', () => {
    render(<Harness inicial={{ id: 'r3', field: 'company', op: 'contains', value: '' }} />);
    const livre = screen.getByPlaceholderText('Valor…') as HTMLInputElement;
    fireEvent.change(livre, { target: { value: 'Promo Brindes' } });
    expect(livre.value).toBe('Promo Brindes');
  });
});
