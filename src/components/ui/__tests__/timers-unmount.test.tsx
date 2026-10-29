/**
 * UI-11 (2ª passada da auditoria do doc 13) — temporizadores dos primitivos de UI.
 *
 * Cada componente que agenda `setTimeout`/`setInterval` precisa LIMPAR o que estiver
 * pendente quando sai da tela: um id vivo depois do unmount chama `setState` em
 * componente desmontado (aviso do React) e, no caso do skip link, mantinha uma
 * varredura por intervalo rodando a sessão inteira.
 *
 * A prova usa `vi.useFakeTimers()` + `vi.getTimerCount()`: agenda o temporizador
 * pelo caminho real do componente, desmonta e exige contagem ZERO.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SkipLinks } from '@/components/ui/skip-link';
import { CommandPalette } from '@/components/ui/command-palette';
import { RippleButton } from '@/components/ui/micro-interactions/buttons';
import { ConnectionToast, useOfflineStatus } from '@/components/ui/offline-indicator';
import { QuickPeek } from '@/components/ui/quick-peek';
import * as React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Form, FormControl, FormField, FormItem, useFormField } from '@/components/ui/form';
import { useForm } from 'react-hook-form';

const FONTE_SKIP = readFileSync(resolve(process.cwd(), 'src/components/ui/skip-link.tsx'), 'utf8');
const FONTE_PEEK = readFileSync(resolve(process.cwd(), 'src/components/ui/quick-peek.tsx'), 'utf8');
const FONTE_FORM = readFileSync(resolve(process.cwd(), 'src/components/ui/form.tsx'), 'utf8');
const FONTE_TOGGLE = readFileSync(resolve(process.cwd(), 'src/components/ui/toggle-group.tsx'), 'utf8');

function alvo(id: string, tag = 'main') {
  const el = document.createElement(tag);
  el.id = id;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('skip-link', () => {
  it('não abre varredura por intervalo e limpa o aviso de Tab no unmount', () => {
    alvo('main-content');
    const { unmount } = render(<SkipLinks />);

    // Sem `setInterval`: montar o skip link não deixa nenhum temporizador pendente.
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(vi.getTimerCount()).toBe(1); // prazo do aviso "Pressione Tab"

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('não renderiza <nav> vazio quando nenhum alvo existe na tela', () => {
    const { container } = render(<SkipLinks />);

    expect(container.querySelector('nav')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('a detecção de alvo é por mutação do documento, não por intervalo', () => {
    expect(FONTE_SKIP).not.toMatch(/setInterval/);
    expect(FONTE_SKIP).toMatch(/new MutationObserver\(/);
  });
});

describe('command-palette', () => {
  it('limpa o ajuste adiado (reset) no unmount', () => {
    const { unmount } = render(<CommandPalette open={false} onOpenChange={() => {}} />);
    expect(vi.getTimerCount()).toBe(1); // estado da paleta fechada reagendado no próximo tick

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('o foco adiado não dispara depois do unmount', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<CommandPalette open onOpenChange={() => {}} />);
    const antes = vi.getTimerCount();

    unmount();
    // O <Dialog> do Radix (dialog.tsx, fora do escopo deste cartão) agenda os próprios
    // temporizadores; o NOSSO (foco adiado) é o que desaparece na desmontagem.
    expect(vi.getTimerCount()).toBeLessThan(antes);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe('micro-interactions/buttons', () => {
  it('limpa o temporizador da ripple no unmount, sem reclamar de componente desmontado', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByRole, unmount } = render(<RippleButton>Salvar</RippleButton>);

    // O framer-motion (motion.button / useAnimation) já deixa 1 temporizador próprio logo
    // na montagem — medido com o botão montado e sem clique. Ele isola o que é NOSSO: o
    // clique agenda exatamente +1 (remoção da ripple) e a desmontagem volta à base.
    const base = vi.getTimerCount();

    fireEvent.click(getByRole('button', { name: 'Salvar' }));
    expect(vi.getTimerCount()).toBe(base + 1); // remoção da ripple após `rippleDuration`

    unmount();
    expect(vi.getTimerCount()).toBe(base); // só o do framer sobra: o da ripple foi limpo

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });
});

// Sonda do hook dono do temporizador (useOfflineStatus). O <ConnectionToast> real traz o
// `motion.div` do AnimatePresence, cujo temporizador do framer-motion polui a contagem de
// `vi.getTimerCount()` e ainda exige frames de animação para sair da tela.
function SondaOffline() {
  const { wasOffline } = useOfflineStatus();
  return <span>{wasOffline ? 'aviso ligado' : 'sem aviso'}</span>;
}

function disparaEvento(nome: 'offline' | 'online') {
  act(() => {
    window.dispatchEvent(new Event(nome));
  });
}

describe('offline-indicator', () => {
  it('o aviso "Conexão restaurada" aparece e se esconde sozinho depois de 3 s', () => {
    const toast = render(<ConnectionToast />);
    disparaEvento('offline');
    disparaEvento('online');
    expect(screen.getByText('Conexão restaurada')).toBeTruthy(); // o aviso aparece
    toast.unmount();

    const { getByText } = render(<SondaOffline />);
    disparaEvento('offline');
    disparaEvento('online');
    expect(getByText('aviso ligado')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(getByText('sem aviso')).toBeTruthy(); // e se esconde sozinho
  });

  it('limpa o prazo de 3 s do aviso no unmount', () => {
    const { getByText, unmount } = render(<SondaOffline />);
    expect(vi.getTimerCount()).toBe(0);

    disparaEvento('offline');
    disparaEvento('online');
    expect(getByText('aviso ligado')).toBeTruthy(); // o caminho do prazo realmente rodou
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('quick-peek', () => {
  it('guarda o temporizador de hover em ref e limpa no unmount', () => {
    const { container, unmount } = render(
      <QuickPeek preview={<span>prévia</span>}>
        <span>linha da lista</span>
      </QuickPeek>
    );

    fireEvent.mouseEnter(container.firstChild as Element);
    expect(vi.getTimerCount()).toBe(1); // espera de `delay` antes de abrir o balão

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    // O id não mora em estado: o hover não re-renderiza a linha.
    expect(FONTE_PEEK).toMatch(/timerRef = useRef/);
  });
});

describe('valores de contexto estáveis (useMemo)', () => {
  it('ToggleGroup: re-render do grupo com as mesmas props não avisa os itens', () => {
    let renders = 0;
    const ItemMemo = React.memo(function ItemMemo() {
      renders++;
      return <ToggleGroupItem value="a">A</ToggleGroupItem>;
    });

    const { rerender } = render(
      <ToggleGroup type="single">
        <ItemMemo />
      </ToggleGroup>
    );
    expect(renders).toBe(1);

    rerender(
      <ToggleGroup type="single">
        <ItemMemo />
      </ToggleGroup>
    );
    // Com `value={{ variant, size }}` recriado a cada render, o item era avisado de novo.
    expect(renders).toBe(1);
    expect(FONTE_TOGGLE).toMatch(/React\.useMemo\(\(\) => \(\{ variant, size \}\)/);
  });

  it('FormItem/FormField: re-render do formulário não avisa o campo', () => {
    let renders = 0;
    const CampoMemo = React.memo(function CampoMemo() {
      renders++;
      const { formItemId } = useFormField();
      return (
        <FormControl>
          <input id={formItemId} />
        </FormControl>
      );
    });

    function Tela({ marca }: { marca: number }) {
      const form = useForm({ defaultValues: { nome: '' } });
      return (
        <Form {...form}>
          <form data-marca={marca}>
            <FormField
              control={form.control}
              name="nome"
              render={() => (
                <FormItem>
                  <CampoMemo />
                </FormItem>
              )}
            />
          </form>
        </Form>
      );
    }

    const { rerender } = render(<Tela marca={1} />);
    // O Controller do react-hook-form monta o campo em duas passagens na entrada; o que
    // interessa é o que acontece depois, com a tela já montada.
    const aposMontagem = renders;
    expect(aposMontagem).toBeGreaterThan(0);

    rerender(<Tela marca={2} />);
    // Sem `useMemo` em FormField/FormItem, os dois `value={{ ... }}` mudavam de identidade
    // a cada render e avisavam o campo mesmo sem nada ter mudado.
    expect(renders).toBe(aposMontagem);
    expect(FONTE_FORM).toMatch(/React\.useMemo\(\(\) => \(\{ name: props\.name \}\), \[props\.name\]\)/);
    expect(FONTE_FORM).toMatch(/React\.useMemo\(\(\) => \(\{ id \}\), \[id\]\)/);
  });
});
