import { renderHook } from '@testing-library/react';
import { useDataMasking } from '@/hooks/copilot/useDataMasking';

describe('useDataMasking', () => {
  it('returns no fields for empty text', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: '' })
    );
    expect(result.current.fields).toHaveLength(0);
    expect(result.current.hasPersonalData).toBe(false);
  });

  it('detects CPF in text', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'Meu CPF é 123.456.789-09' })
    );
    expect(result.current.hasPersonalData).toBe(true);
    const cpf = result.current.fields.find((f) => f.type === 'cpf');
    expect(cpf).toBeDefined();
    expect(cpf?.original).toBe('123.456.789-09');
  });

  it('detects email in text', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'Meu e-mail é joao@empresa.com.br' })
    );
    const email = result.current.fields.find((f) => f.type === 'email');
    expect(email).toBeDefined();
    expect(email?.original).toBe('joao@empresa.com.br');
  });

  it('masks CPF when applyMask=true', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: '123.456.789-09', applyMask: true })
    );
    expect(result.current.maskedText).not.toBe('123.456.789-09');
    expect(result.current.maskedText).toContain('*');
  });

  it('does NOT mask when applyMask=false (default)', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'CPF: 123.456.789-09' })
    );
    expect(result.current.maskedText).toBe('CPF: 123.456.789-09');
    expect(result.current.hasPersonalData).toBe(true);
  });

  it('detects phone number', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'Ligue para (11) 99999-8888' })
    );
    const phone = result.current.fields.find((f) => f.type === 'phone');
    expect(phone).toBeDefined();
  });

  it('detects credit card pattern', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'Cartão: 4111 1111 1111 1111' })
    );
    const card = result.current.fields.find((f) => f.type === 'card');
    expect(card).toBeDefined();
    expect(card?.masked).toBe('**** **** **** ****');
  });

  it('detects CEP', () => {
    const { result } = renderHook(() =>
      useDataMasking({ text: 'CEP 01310-100' })
    );
    const cep = result.current.fields.find((f) => f.type === 'cep');
    expect(cep).toBeDefined();
  });

  it('returns stable reference when text unchanged', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useDataMasking({ text }),
      { initialProps: { text: 'sem dados' } }
    );
    const first = result.current;
    rerender({ text: 'sem dados' });
    expect(result.current).toBe(first);
  });
});
