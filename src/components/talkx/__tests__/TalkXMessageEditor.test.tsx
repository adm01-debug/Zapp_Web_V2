import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TalkXMessageEditor, type TalkXMessageEditorHandle } from '../TalkXMessageEditor';

describe('TalkXMessageEditor (V26)', () => {
  it('insere negrito, itálico e lista na posição do cursor', () => {
    const onChange = vi.fn();
    render(<TalkXMessageEditor value="abc" onChange={onChange} knownVariables={['{{nome}}']} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 3);

    fireEvent.click(screen.getByTitle('Negrito (*texto*)'));
    expect(onChange).toHaveBeenLastCalledWith('*abc*');

    fireEvent.click(screen.getByTitle('Itálico (_texto_)'));
    expect(onChange).toHaveBeenLastCalledWith('_abc_');

    fireEvent.click(screen.getByTitle('Lista (- item)'));
    expect(onChange).toHaveBeenLastCalledWith('\n- abc');
  });

  it('insere no cursor sem seleção usando o texto de exemplo', () => {
    const onChange = vi.fn();
    render(<TalkXMessageEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Negrito (*texto*)'));
    expect(onChange).toHaveBeenLastCalledWith('*texto*');
  });

  it('insere link na posição do cursor', () => {
    const onChange = vi.fn();
    render(<TalkXMessageEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Link (https://)'));
    expect(onChange).toHaveBeenLastCalledWith('https://');
  });

  it('expoe insertAtCursor no handle (painéis de variáveis externos)', () => {
    const onChange = vi.fn();
    const ref = createRef<TalkXMessageEditorHandle>();
    render(<TalkXMessageEditor ref={ref} value="" onChange={onChange} knownVariables={['{{nome}}']} />);

    ref.current?.insertAtCursor('{{nome}}');
    expect(onChange).toHaveBeenLastCalledWith('{{nome}}');
  });

  it('conta por limite do provedor e avisa quando passa', () => {
    const { rerender } = render(<TalkXMessageEditor value="12345" onChange={() => {}} limit={3} />);
    expect(screen.getByText(/^5\/3/)).toBeInTheDocument();
    expect(screen.getByText(/acima do limite/)).toBeInTheDocument();

    rerender(<TalkXMessageEditor value="12" onChange={() => {}} limit={3} />);
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.queryByText(/acima do limite/)).not.toBeInTheDocument();
  });

  it('sinaliza variável desconhecida usando a lista de conhecidas', () => {
    render(<TalkXMessageEditor value="Oi {{nome}} e {{cargo}}" onChange={() => {}} knownVariables={['{{nome}}']} />);
    const aviso = screen.getByText(/Variáveis desconhecidas/);
    expect(aviso).toHaveTextContent('{{cargo}}');
    expect(aviso).not.toHaveTextContent('{{nome}}');
  });

  it('não acusa desconhecida quando não recebe a lista de conhecidas', () => {
    render(<TalkXMessageEditor value="Oi {{cargo}}" onChange={() => {}} />);
    expect(screen.queryByText(/Variáveis desconhecidas/)).not.toBeInTheDocument();
  });

  it('destaca {{variavel}} no overlay e mantém o texto no textarea transparente', () => {
    const { container } = render(<TalkXMessageEditor value="Oi {{nome}}" onChange={() => {}} knownVariables={['{{nome}}']} />);
    const overlay = container.querySelector('pre');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveTextContent('Oi {{nome}}');
    expect(overlay?.innerHTML).toContain('{{nome}}');

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Oi {{nome}}');
    expect(textarea.className).toContain('text-transparent');
  });

  it('marca em âmbar a variável desconhecida no overlay', () => {
    const { container } = render(<TalkXMessageEditor value="{{cargo}}" onChange={() => {}} knownVariables={['{{nome}}']} />);
    expect(container.querySelector('pre')?.innerHTML).toContain('text-dash-amber');
  });
});
