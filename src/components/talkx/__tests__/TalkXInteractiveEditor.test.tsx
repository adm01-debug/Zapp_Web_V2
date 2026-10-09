import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TalkXInteractiveEditor } from '../TalkXInteractiveEditor';
import { validateTalkxInteractive, type TalkxInteractive } from '../talkxInteractive';

/**
 * X096 (V4) — botões e enquete na mensagem do template.
 *
 * O limite de 3 botões, o rótulo de 20, a URL https, a pergunta de 255 e as 2–12
 * opções NÃO vêm do componente: são o contrato de X083/CAP-060 (`talkx_validate_interactive`,
 * que vira CHECK no banco) e estão escritos aqui à mão, de propósito, como a
 * especificação — se o componente divergir dela, este arquivo fica vermelho.
 *
 * O `Harness` guarda o estado como o editor de template guarda (componente
 * CONTROLADO) e publica o JSON produzido para as asserções: o teste não chama o
 * `onChange` à mão, ele digita e clica como o autor.
 */

const MAX_LABEL = 20;

function Harness({ initial = null, body = 'Olá!' }: { initial?: TalkxInteractive | null; body?: string }) {
  const [value, setValue] = useState<TalkxInteractive | null>(initial);
  return (
    <>
      <TalkXInteractiveEditor value={value} onChange={setValue} messageBody={body} />
      <pre data-testid="payload">{JSON.stringify(value)}</pre>
    </>
  );
}

function payload(): TalkxInteractive | null {
  return JSON.parse(screen.getByTestId('payload').textContent ?? 'null') as TalkxInteractive | null;
}

function open(initial: TalkxInteractive | null = null, body = 'Olá!') {
  render(<Harness initial={initial} body={body} />);
}

function buttonsOf(count: number): TalkxInteractive['buttons'] {
  return Array.from({ length: count }, (_, index) => ({ type: 'reply' as const, label: `b${index + 1}` }));
}

function optionsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `o${index + 1}`);
}

describe('TalkXInteractiveEditor (X096)', () => {
  it('troca entre Nenhum, Botões e Enquete e o payload segue o modo escolhido', () => {
    open();
    expect(payload()).toBeNull();
    expect(screen.queryByTestId('talkx-interactive-reserve')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    expect(payload()?.buttons).toHaveLength(1);
    expect(payload()?.poll).toBeUndefined();
    expect(screen.getByTestId('talkx-interactive-reserve')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enquete' }));
    expect(payload()?.buttons).toBeUndefined();
    expect(payload()?.poll?.options).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Nenhum' }));
    expect(payload()).toBeNull();
    expect(screen.queryByTestId('talkx-interactive-reserve')).not.toBeInTheDocument();
  });

  it('bloqueia o 4º botão: com 3 o botão de adicionar fica desabilitado', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    const addButton = screen.getByRole('button', { name: /Adicionar botão/ });

    fireEvent.click(addButton);
    fireEvent.click(addButton);
    expect(screen.getByText('3/3 botões')).toBeInTheDocument();
    expect(addButton).toBeDisabled();

    fireEvent.click(addButton);
    expect(payload()?.buttons).toHaveLength(3);
  });

  it('corta o rótulo no limite de 20 caracteres', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    const label = screen.getByLabelText('Rótulo do botão 1') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Ver o catálogo completo de outubro' } });

    expect(label.value).toHaveLength(MAX_LABEL);
    expect(payload()?.buttons?.[0].label).toHaveLength(MAX_LABEL);
  });

  it('exige https no botão de link e libera quando o link é válido', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    fireEvent.change(screen.getByLabelText('Tipo do botão 1'), { target: { value: 'link' } });
    expect(screen.getByTestId('talkx-interactive-errors')).toHaveTextContent('https://');

    fireEvent.change(screen.getByLabelText('Link do botão 1'), { target: { value: 'http://loja.exemplo' } });
    expect(screen.getByTestId('talkx-interactive-errors')).toHaveTextContent('https://');

    fireEvent.change(screen.getByLabelText('Link do botão 1'), { target: { value: 'https://loja.exemplo/catalogo' } });
    fireEvent.change(screen.getByLabelText('Rótulo do botão 1'), { target: { value: 'Loja' } });
    expect(screen.queryByTestId('talkx-interactive-errors')).not.toBeInTheDocument();
  });

  it('usa token de aviso permitido e transição protegida por motion-safe', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    fireEvent.change(screen.getByLabelText('Tipo do botão 1'), { target: { value: 'link' } });

    expect(screen.getByTestId('talkx-interactive-errors')).toHaveClass('text-warning');
    expect(screen.getByTestId('talkx-interactive-errors')).not.toHaveClass('text-dash-amber');
    expect(screen.getByRole('button', { name: 'Nenhum' })).toHaveClass('motion-safe:transition-colors');
    expect(screen.getByRole('button', { name: 'Nenhum' })).not.toHaveClass('transition-colors');
  });

  it('acusa enquete com 1 opção e opção vazia; com 2 opções preenchidas fica válida', () => {
    open({ poll: { question: 'Como foi o atendimento?', options: ['Ótimo'] } });
    expect(screen.getByTestId('talkx-interactive-errors')).toHaveTextContent('mínimo de 2 opções');

    fireEvent.click(screen.getByRole('button', { name: /Adicionar opção/ }));
    expect(screen.getByTestId('talkx-interactive-errors')).toHaveTextContent('vazia');

    fireEvent.change(screen.getByLabelText('Opção 2'), { target: { value: 'Ruim' } });
    expect(screen.queryByTestId('talkx-interactive-errors')).not.toBeInTheDocument();
    expect(validateTalkxInteractive(payload()).ok).toBe(true);
  });

  it('preenche o atalho Satisfação com pergunta e 4 opções distintas', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Enquete' }));
    fireEvent.click(screen.getByRole('button', { name: /Satisfação \(4 emojis\)/ }));

    const poll = payload()?.poll;
    expect(poll?.options).toHaveLength(4);
    expect(poll?.options.every((option) => option.trim().length > 0)).toBe(true);
    expect(new Set(poll?.options).size).toBe(4);
    expect(poll?.question.trim()).not.toBe('');
    expect(validateTalkxInteractive(payload()).ok).toBe(true);
  });

  it('mostra o texto reserva com os links numerados dos botões', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    fireEvent.change(screen.getByLabelText('Rótulo do botão 1'), { target: { value: 'Ver catálogo' } });
    fireEvent.change(screen.getByLabelText('Tipo do botão 1'), { target: { value: 'link' } });
    fireEvent.change(screen.getByLabelText('Link do botão 1'), { target: { value: 'https://loja.exemplo/catalogo' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar botão/ }));
    fireEvent.change(screen.getByLabelText('Rótulo do botão 2'), { target: { value: 'Falar com atendente' } });

    const reserva = screen.getByTestId('talkx-interactive-reserve').textContent;
    expect(reserva).toBe('Olá!\n1. Ver catálogo: https://loja.exemplo/catalogo');
    // Botão de resposta rápida não tem link para clicar: fora do texto reserva.
    expect(reserva).not.toContain('Falar com atendente');
  });

  it('mostra o texto reserva da enquete com a pergunta e as opções', () => {
    open({ poll: { question: 'Como foi?', options: ['Ótimo', 'Ruim'] } });
    expect(screen.getByTestId('talkx-interactive-reserve').textContent)
      .toBe('Olá!\nEnquete: Como foi?\n1. Ótimo\n2. Ruim');
  });

  it('o JSON montado no editor passa na validação do domínio e no contrato do banco', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Botões' }));
    fireEvent.change(screen.getByLabelText('Rótulo do botão 1'), { target: { value: 'Ver catálogo' } });
    fireEvent.change(screen.getByLabelText('Tipo do botão 1'), { target: { value: 'link' } });
    fireEvent.change(screen.getByLabelText('Link do botão 1'), { target: { value: 'https://loja.exemplo/catalogo' } });

    const produzido = payload();
    expect(validateTalkxInteractive(produzido).ok).toBe(true);
    expect(produzido?.buttons?.length ?? 0).toBeLessThanOrEqual(3);
    expect(produzido?.buttons?.[0].label.length ?? 99).toBeLessThanOrEqual(MAX_LABEL);
    expect(produzido?.buttons?.[0].type).toBe('link');
    expect(produzido?.buttons?.[0].url?.startsWith('https://')).toBe(true);
    expect(produzido?.poll).toBeUndefined();
  });
});

/**
 * Tabela de limites do contrato (X083/CAP-060) com os dois lados de cada fronteira.
 * É a mesma função que o editor usa — se ela afrouxar, o componente afrouxa junto.
 */
describe('talkx_validate_interactive — limites do contrato', () => {
  const casos: [string, TalkxInteractive | null, boolean][] = [
    ['sem interativo', null, true],
    ['objeto vazio', {}, true],
    ['1 botão', { buttons: buttonsOf(1) }, true],
    ['3 botões (teto)', { buttons: buttonsOf(3) }, true],
    ['4 botões', { buttons: buttonsOf(4) }, false],
    ['rótulo com 20 caracteres (teto)', { buttons: [{ type: 'reply', label: '12345678901234567890' }] }, true],
    ['rótulo com 21 caracteres', { buttons: [{ type: 'reply', label: '123456789012345678901' }] }, false],
    ['link https', { buttons: [{ type: 'link', label: 'Loja', url: 'https://loja.exemplo' }] }, true],
    ['link http', { buttons: [{ type: 'link', label: 'Loja', url: 'http://loja.exemplo' }] }, false],
    ['enquete com 2 opções (piso)', { poll: { question: 'Como foi?', options: optionsOf(2) } }, true],
    ['enquete com 1 opção', { poll: { question: 'Como foi?', options: optionsOf(1) } }, false],
    ['enquete com 12 opções (teto)', { poll: { question: 'Como foi?', options: optionsOf(12) } }, true],
    ['enquete com 13 opções', { poll: { question: 'Como foi?', options: optionsOf(13) } }, false],
    ['pergunta com 255 caracteres (teto)', { poll: { question: 'x'.repeat(255), options: optionsOf(2) } }, true],
    ['pergunta com 256 caracteres', { poll: { question: 'x'.repeat(256), options: optionsOf(2) } }, false],
    ['botões e enquete juntos', { buttons: buttonsOf(1), poll: { question: 'Como foi?', options: optionsOf(2) } }, false],
  ];

  it.each(casos)('%s → ok=%s', (_nome, value, esperado) => {
    expect(validateTalkxInteractive(value).ok).toBe(esperado);
  });
});
