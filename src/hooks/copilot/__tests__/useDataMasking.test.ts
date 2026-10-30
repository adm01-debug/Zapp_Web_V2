import { renderHook } from '@testing-library/react';
import { useDataMasking } from '../useDataMasking';

describe('useDataMasking', () => {
  it('detecta CPF sem mascarar quando applyMask=false', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'meu CPF é 123.456.789-09', applyMask: false }),
    );
    expect(result.current.hasPersonalData).toBe(true);
    expect(result.current.fields[0].type).toBe('cpf');
    expect(result.current.maskedText).toBe('meu CPF é 123.456.789-09');
  });

  it('mascara CPF quando applyMask=true', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'CPF 123.456.789-09 ok', applyMask: true }),
    );
    expect(result.current.maskedText).not.toContain('789-09');
    expect(result.current.hasPersonalData).toBe(true);
  });

  it('detecta CNPJ', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'CNPJ: 12.345.678/0001-99', applyMask: false }),
    );
    expect(result.current.fields.some((f) => f.type === 'cnpj')).toBe(true);
  });

  it('detecta e-mail', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'contato: joao@empresa.com.br', applyMask: false }),
    );
    expect(result.current.fields.some((f) => f.type === 'email')).toBe(true);
  });

  it('retorna vazio para texto sem dados pessoais', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'Olá, tudo bem?' }),
    );
    expect(result.current.hasPersonalData).toBe(false);
    expect(result.current.fields).toHaveLength(0);
  });

  it('retorna vazio para texto em branco', () => {
    const { result } = renderHook(() => useDataMasking({ text: '' }));
    expect(result.current.fields).toHaveLength(0);
  });

  it('mascara cartão de crédito', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'cartão 4111 1111 1111 1111', applyMask: true }),
    );
    expect(result.current.fields.some((f) => f.type === 'card')).toBe(true);
    expect(result.current.maskedText).toContain('**** **** **** ****');
  });
});
