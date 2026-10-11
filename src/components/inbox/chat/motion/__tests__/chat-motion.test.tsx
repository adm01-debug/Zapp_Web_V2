/**
 * Kit de microinterações do chat — comportamento de cada peça.
 *
 * O ponto de controle de "reduzir movimento" é o hook `useReducedMotion` do
 * framer-motion (é ele que lê `prefers-reduced-motion` no app inteiro), por isso
 * o mock está no hook — igual ao teste do `HighlightPulse` do Journey.
 *
 * Cada peça prova o caminho normal E o de movimento reduzido; o nada de prazo
 * (anel/celebração) é medido com `durationMs` curto e `waitFor`, com temporizador
 * de verdade para o `requestAnimationFrame` das contagens/traços correr.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import {
  AnimatedNumber,
  DrawLine,
  FLASH_RING_MS,
  FlashRing,
  MorphButton,
  POP_BURST_MS,
  PopBurst,
  ShimmerSkeleton,
  SlidingSegmented,
  StaggerItem,
  StaggerList,
} from '../index';
import { zappStaggerDelaySeconds } from '@/lib/motion';

const reduce = vi.hoisted(() => ({ value: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduce.value,
}));

beforeEach(() => {
  reduce.value = false;
});

afterEach(() => {
  cleanup();
});

describe('AnimatedNumber', () => {
  it('(1) com movimento reduzido entrega o valor final na hora, em pt-BR', () => {
    reduce.value = true;
    render(<AnimatedNumber value={1234.5} decimals={1} prefix="R$ " suffix=" un" />);

    const el = screen.getByTestId('animated-number');
    expect(el).toHaveAttribute('data-motion', 'reduced');
    expect(el).toHaveTextContent('R$ 1.234,5 un');
  });

  it('(2) sem redução conta de 0 até o valor EXATO (não para em "quase")', async () => {
    render(<AnimatedNumber value={1234} />);

    const el = screen.getByTestId('animated-number');
    expect(el).toHaveAttribute('data-motion', 'full');
    expect(el).toHaveTextContent('0'); // ainda no início da contagem

    await waitFor(() => expect(el).toHaveTextContent('1.234'), { timeout: 4000 });
  });
});

describe('ShimmerSkeleton', () => {
  it('(3) sem redução varre a luz e é decorativo (aria-hidden)', () => {
    render(<ShimmerSkeleton className="h-4 w-32" />);

    const el = screen.getByTestId('shimmer-skeleton');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('data-motion', 'full');
    expect(el.className).toContain('motion-safe:animate-shimmer');
    expect(el.className).not.toMatch(/(?:^|\s)animate-(?:spin|shimmer)(?:\s|$)/);
    expect(el.style.backgroundImage).toContain('hsl(var(--muted-foreground)');
  });

  it('(4) com redução: bloco estático, sem varrer e sem fundo animado', () => {
    reduce.value = true;
    render(<ShimmerSkeleton className="h-4 w-32" />);

    const el = screen.getByTestId('shimmer-skeleton');
    expect(el).toHaveAttribute('data-motion', 'reduced');
    // a varredura nunca é animada fora do `motion-safe:` (o CSS a desliga sob reduzir movimento)
    expect(el.className).not.toMatch(/(?:^|\s)animate-(?:spin|shimmer)(?:\s|$)/);
    expect(el.style.backgroundImage).toBe('');
  });
});

describe('FlashRing', () => {
  it('(5) ativo: anel na cor do token, começa visível, some no prazo e avisa', async () => {
    const onDone = vi.fn();
    render(
      <FlashRing active tone="warning" durationMs={30} onDone={onDone}>
        <span>alvo</span>
      </FlashRing>,
    );

    const anel = screen.getByTestId('flash-ring');
    expect(anel).toHaveAttribute('aria-hidden', 'true');
    expect(anel.style.opacity).toBe('0.9');
    expect(anel.className).toContain('ring-warning');
    expect(onDone).not.toHaveBeenCalled();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(screen.queryByTestId('flash-ring')).toBeNull();
  });

  it('(6) com redução o anel existe igual (realce não é movimento) mas não escala', () => {
    reduce.value = true;
    render(
      <FlashRing active tone="info" durationMs={FLASH_RING_MS}>
        <span>alvo</span>
      </FlashRing>,
    );

    const anel = screen.getByTestId('flash-ring');
    expect(anel).toHaveAttribute('data-motion', 'reduced');
    expect(anel.className).toContain('ring-info');
    expect(anel.style.transform).not.toContain('scale');
  });

  it('(7) inativo: nada na tela, nem aviso de fim', () => {
    const onDone = vi.fn();
    render(<FlashRing active={false} onDone={onDone} />);

    expect(screen.queryByTestId('flash-ring')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('PopBurst', () => {
  it('(8) ativo: dois anéis + ícone, some no prazo e avisa', async () => {
    const onDone = vi.fn();
    render(<PopBurst kind="check" tone="success" durationMs={30} onDone={onDone} />);

    const burst = screen.getByTestId('pop-burst');
    expect(burst).toHaveAttribute('aria-hidden', 'true');
    expect(burst.querySelectorAll('svg').length).toBe(1);
    expect(screen.getByTestId('pop-burst-ring-0').className).toContain('border-success');
    expect(screen.getByTestId('pop-burst-ring-1')).toBeInTheDocument();
    expect(screen.getByTestId('pop-burst-ring-0')).toHaveAttribute('data-testid', 'pop-burst-ring-0');

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(screen.queryByTestId('pop-burst')).toBeNull();
  });

  it('(9) com redução: os anéis só apagam a opacidade, não abrem', () => {
    reduce.value = true;
    render(<PopBurst kind="star" durationMs={POP_BURST_MS} />);

    const burst = screen.getByTestId('pop-burst');
    expect(burst).toHaveAttribute('data-motion', 'reduced');
    const anel = screen.getByTestId('pop-burst-ring-0');
    expect(anel.style.opacity).toBe('0.6');
    expect(anel.style.transform).not.toContain('scale');
  });
});

describe('DrawLine', () => {
  it('(10) sem redução: o traço começa escondido e se completa', async () => {
    render(<DrawLine d="M0 12 H120" length={100} tone="success" />);

    const svg = screen.getByTestId('draw-line');
    const caminho = screen.getByTestId('draw-line-path');
    expect(svg).toHaveAttribute('data-motion', 'full');
    expect(caminho.getAttribute('class')).toContain('text-success');
    expect(caminho.getAttribute('stroke-dashoffset')).toBe('100');

    await waitFor(() => expect(caminho.getAttribute('stroke-dashoffset')).toBe('0'), { timeout: 1000 });
  });

  it('(11) com redução: traço já nasce pronto (offset 0) e sem transição', () => {
    reduce.value = true;
    render(<DrawLine d="M0 12 H120" length={100} />);

    const caminho = screen.getByTestId('draw-line-path');
    expect(screen.getByTestId('draw-line')).toHaveAttribute('data-motion', 'reduced');
    expect(caminho.getAttribute('stroke-dashoffset')).toBe('0');
    expect(caminho.style.transitionDuration).toBe('0ms');
  });
});

describe('SlidingSegmented', () => {
  function Exemplo({ inicial = 'semana' as const }) {
    const [valor, setValor] = useState<string>(inicial);
    return (
      <SlidingSegmented
        ariaLabel="Período"
        value={valor}
        onChange={setValor}
        items={[
          { value: 'dia', label: 'Dia' },
          { value: 'semana', label: 'Semana' },
          { value: 'mes', label: 'Mês' },
        ]}
      />
    );
  }

  it('(12) é um grupo de opções: só a marcada é tabulável e a escolha muda ao clicar', () => {
    render(<Exemplo />);

    expect(screen.getByRole('radiogroup', { name: 'Período' })).toBeInTheDocument();
    expect(screen.getByTestId('segmented-item-semana')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('segmented-item-semana')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('segmented-item-dia')).toHaveAttribute('tabindex', '-1');

    fireEvent.click(screen.getByTestId('segmented-item-mes'));
    expect(screen.getByTestId('segmented-item-mes')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('segmented-item-semana')).toHaveAttribute('aria-checked', 'false');
  });

  it('(13) as setas movem a escolha e o único indicador do grupo vai para a opção escolhida (token do sistema)', () => {
    render(<Exemplo />);

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(screen.getByTestId('segmented-item-mes')).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('segmented-item-dia')).toHaveAttribute('aria-checked', 'true');

    // o indicador é UM só elemento no grupo (é ele que desliza entre as opções, não um por opção)…
    const indicadores = screen.getAllByTestId('segmented-indicator');
    expect(indicadores).toHaveLength(1);
    // …e ele vive DENTRO da opção escolhida, seguindo as setas
    const indicador = indicadores[0];
    expect(screen.getByTestId('segmented-item-dia')).toContainElement(indicador);
    expect(screen.getByTestId('segmented-item-mes')).not.toContainElement(indicador);
    expect(indicador).toHaveAttribute('data-motion', 'full');
    expect(indicador.className).toContain('bg-primary');
  });

  it('(14) com redução o indicador é um span estático na opção escolhida (fora da máquina de animação)', async () => {
    reduce.value = true;
    render(<Exemplo />);

    // continua sendo UM indicador, na opção escolhida…
    const indicadores = screen.getAllByTestId('segmented-indicator');
    expect(indicadores).toHaveLength(1);
    const indicador = indicadores[0];
    expect(screen.getByTestId('segmented-item-semana')).toContainElement(indicador);
    expect(indicador).toHaveAttribute('data-motion', 'reduced');
    expect(screen.getByTestId('sliding-segmented')).toHaveAttribute('data-motion', 'reduced');
    // …mas é um `<span>` puro: só os nossos atributos, nenhum gerenciado pelo framer-motion
    // (sem `layoutId` não há projeção de layout nem `style` animado)
    expect(Array.from(indicador.attributes).map((a) => a.name).sort()).toEqual([
      'aria-hidden',
      'class',
      'data-motion',
      'data-testid',
    ]);
    // deixar os efeitos assentar: o span estático não ganha nada com o tempo
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(Array.from(indicador.attributes).map((a) => a.name).sort()).toEqual([
      'aria-hidden',
      'class',
      'data-motion',
      'data-testid',
    ]);
    expect(indicador.style.transform).not.toContain('translate');
  });

  it('(22) o rótulo escolhido pinta com o texto do tom do indicador (não um branco fixo)', () => {
    render(
      <SlidingSegmented
        ariaLabel="Período"
        tone="success"
        value="dia"
        onChange={() => {}}
        items={[
          { value: 'dia', label: 'Dia' },
          { value: 'semana', label: 'Semana' },
        ]}
      />,
    );

    // o indicador é o fundo do tom…
    expect(screen.getByTestId('segmented-indicator').className).toContain('bg-success');
    // …e o rótulo escolhido usa o par de texto do sistema para esse tom
    expect(screen.getByTestId('segmented-item-dia').className).toContain('text-success-foreground');
    // a opção não escolhida continua no texto neutro
    expect(screen.getByTestId('segmented-item-semana').className).toContain('text-muted-foreground');
    expect(screen.getByTestId('segmented-item-semana').className).not.toContain('text-success-foreground');
  });
});

describe('MorphButton', () => {
  it('(15) os quatro rótulos vivem na mesma célula do grid: a largura não muda', () => {
    render(<MorphButton>Enviar</MorphButton>);

    const celulas = ['idle', 'loading', 'success', 'error'].map((chave) =>
      screen.getByTestId(`morph-button-label-${chave}`),
    );
    celulas.forEach((celula) => {
      expect(celula.className).toContain('col-start-1');
      expect(celula.className).toContain('row-start-1');
    });
    // só o ativo é lido pelo leitor de tela
    expect(screen.getByTestId('morph-button-label-idle')).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('morph-button-label-loading')).toHaveAttribute('aria-hidden', 'true');
  });

  it('(16) carregando: aria-busy, bloqueado e o status anuncia o rótulo', () => {
    render(<MorphButton state="loading">Enviar</MorphButton>);

    const botao = screen.getByTestId('morph-button');
    expect(botao).toHaveAttribute('data-state', 'loading');
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Enviando…');
  });

  it('(17) sucesso e erro anunciam o rótulo, cada um no seu token', () => {
    const { rerender } = render(<MorphButton state="success">Enviar</MorphButton>);
    expect(screen.getByRole('status')).toHaveTextContent('Enviado');
    expect(
      screen.getByTestId('morph-button-label-success').querySelector('svg')?.getAttribute('class'),
    ).toContain('text-success');

    rerender(<MorphButton state="error">Enviar</MorphButton>);
    expect(screen.getByRole('status')).toHaveTextContent('Falhou');
    expect(
      screen.getByTestId('morph-button-label-error').querySelector('svg')?.getAttribute('class'),
    ).toContain('text-destructive');
    expect(screen.getByTestId('morph-button')).not.toHaveAttribute('aria-busy');
  });

  it('(18) o giro do ícone só existe sob `motion-safe:` (nunca solto)', () => {
    reduce.value = true;
    render(<MorphButton state="loading">Enviar</MorphButton>);

    expect(screen.getByTestId('morph-button')).toHaveAttribute('data-motion', 'reduced');
    const icone = screen.getByTestId('morph-button-label-loading').querySelector('svg');
    expect(icone?.getAttribute('class')).toContain('motion-safe:animate-spin');
    // o padrão é montado sem escrever a classe solta: garante que ela não aparece sem o prefixo
    expect(icone?.getAttribute('class')).not.toMatch(/(?:^|\s)animate-(?:spin|shimmer)(?:\s|$)/);
  });
});

describe('StaggerList', () => {
  it('(19) escalona a entrada: o 1º item entra na hora, o 2º 60 ms depois', () => {
    render(
      <StaggerList>
        <StaggerItem>um</StaggerItem>
        <StaggerItem>dois</StaggerItem>
      </StaggerList>,
    );

    expect(screen.getByTestId('stagger-list')).toHaveAttribute('data-motion', 'full');
    const itens = screen.getAllByTestId('stagger-item');
    // primeiro quadro: itens ainda escondidos, esperando a vez
    expect(itens[0].style.opacity).toBe('0');
    // o atraso de cada item é o real aplicado à transição
    expect(itens[0]).toHaveAttribute('data-delay-ms', '0');
    expect(itens[1]).toHaveAttribute('data-delay-ms', '60');
  });

  it('(20) com redução a lista nasce inteira (nada invisível esperando a vez)', () => {
    reduce.value = true;
    render(
      <StaggerList>
        <StaggerItem>um</StaggerItem>
        <StaggerItem>dois</StaggerItem>
      </StaggerList>,
    );

    expect(screen.getByTestId('stagger-list')).toHaveAttribute('data-motion', 'reduced');
    screen.getAllByTestId('stagger-item').forEach((item) => {
      expect(item.style.opacity).not.toBe('0');
      expect(item.style.transform).not.toContain('translate');
      expect(item).toHaveAttribute('data-delay-ms', '0');
    });
  });

  it('(21) o teto de 8: do 9º em diante os itens entram junto com o 8º (não atrasam mais)', () => {
    render(
      <StaggerList>
        {Array.from({ length: 10 }, (_, i) => (
          <StaggerItem key={i}>{`item ${i + 1}`}</StaggerItem>
        ))}
      </StaggerList>,
    );

    const itens = screen.getAllByTestId('stagger-item');
    expect(itens).toHaveLength(10);

    const atraso = (indice: number) => Number(itens[indice].getAttribute('data-delay-ms'));
    expect(atraso(6)).toBe(360); // 7º item: 6 * 60 ms
    expect(atraso(7)).toBe(420); // 8º item: 7 * 60 ms — este é o teto
    expect(atraso(8)).toBe(420); // 9º item: mesmo atraso do 8º (sem o teto seria 480)
    expect(atraso(9)).toBe(420); // 10º item: idem
    expect(atraso(8)).toBeLessThanOrEqual(atraso(7));
    // a mesma conta que o `StaggerItem` usa está publicada (fonte única da regra)
    expect(zappStaggerDelaySeconds(0)).toBe(0);
    expect(zappStaggerDelaySeconds(7)).toBe(0.42);
    expect(zappStaggerDelaySeconds(8)).toBe(zappStaggerDelaySeconds(7));
    expect(zappStaggerDelaySeconds(9)).toBe(zappStaggerDelaySeconds(7));
  });
});
