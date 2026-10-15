import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Button, MotionButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Prova RENDERIZANDO o primitivo de verdade (sem ler a fonte, sem passar prop mágica):
// o que o usuário vê é o nó do DOM, então é a classe efetiva nele que diz se o texto
// longo encolhe em vez de estourar a caixa do pai. O jsdom não calcula layout
// (offsetWidth é sempre 0), por isso a asserção é na classe do nó renderizado e na
// integridade do texto dentro dele — nunca no valor que foi passado como prop.

const TEXTO_LONGO =
  'Gerar relatório consolidado de atendimento do cliente com todas as conversas do mês';

describe('Texto longo nos primitivos — o rótulo encolhe dentro da caixa do pai', () => {
  it('Button: base e cada tamanho trazem min-w-0, com o texto íntegro no DOM', () => {
    render(<Button>{TEXTO_LONGO}</Button>);
    const botao = screen.getByRole('button', { name: TEXTO_LONGO });

    expect(botao.className).toContain('min-w-0');
    expect(botao.className).toContain('whitespace-nowrap');
    // O texto chega inteiro ao DOM: quem corta é o layout (overflow-hidden da base), não o JSX.
    expect(botao.textContent).toBe(TEXTO_LONGO);
  });

  it('Button: todo tamanho do cva traz o próprio min-w-0', () => {
    const tamanhos = ['default', 'sm', 'lg', 'xl', 'icon', 'icon-sm', 'icon-lg'] as const;

    for (const size of tamanhos) {
      const { unmount } = render(
        <Button size={size} aria-label={`botão ${size}`}>
          {TEXTO_LONGO}
        </Button>,
      );
      const botao = screen.getByRole('button', { name: `botão ${size}` });
      expect(botao.className).toContain('min-w-0');
      unmount();
    }
  });

  it('MotionButton: herda min-w-0 junto com as variantes do design system', () => {
    render(<MotionButton>{TEXTO_LONGO}</MotionButton>);
    const botao = screen.getByRole('button', { name: TEXTO_LONGO });

    expect(botao.tagName).toBe('BUTTON');
    expect(botao.className).toContain('min-w-0');
    expect(botao.className).toContain('bg-primary');
    expect(botao.textContent).toBe(TEXTO_LONGO);
  });

  it('Badge: pílula com texto longo não estoura a caixa (max-w-full + min-w-0)', () => {
    render(<Badge>{TEXTO_LONGO}</Badge>);
    const pilula = screen.getByText(TEXTO_LONGO);

    expect(pilula.className).toContain('max-w-full');
    expect(pilula.className).toContain('min-w-0');
    expect(pilula.className).toContain('inline-flex');
    expect(pilula.textContent).toBe(TEXTO_LONGO);
  });

  it('Label: rótulo longo encolhe em vez de empurrar o campo', () => {
    render(<Label>{TEXTO_LONGO}</Label>);
    const rotulo = screen.getByText(TEXTO_LONGO);

    expect(rotulo.className).toContain('min-w-0');
    expect(rotulo.textContent).toBe(TEXTO_LONGO);
  });

  it('Card/CardContent/CardFooter: a caixa do pai não cresce com o filho', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="card-header">
          <CardTitle>{TEXTO_LONGO}</CardTitle>
          <CardDescription>{TEXTO_LONGO}</CardDescription>
        </CardHeader>
        <CardContent data-testid="card-content">{TEXTO_LONGO}</CardContent>
        <CardFooter data-testid="card-footer">{TEXTO_LONGO}</CardFooter>
      </Card>,
    );

    for (const parte of ['card-header', 'card-content', 'card-footer']) {
      expect(screen.getByTestId(parte).className).toContain('min-w-0');
    }

    // O texto longo precisa poder quebrar dentro do título/descrição.
    const titulo = screen.getByRole('heading', { name: TEXTO_LONGO });
    expect(titulo.className).toContain('min-w-0');
    expect(titulo.className).toContain('break-words');
    expect(titulo.textContent).toBe(TEXTO_LONGO);

    const descricao = screen.getByText(TEXTO_LONGO, { selector: 'p' });
    expect(descricao.className).toContain('min-w-0');
    expect(descricao.className).toContain('break-words');
  });
});

describe('Tabs — faixa que quebra e estado ocupado anunciado no DOM', () => {
  const renderTabs = (
    props: {
      trigger?: { isLoading?: boolean };
      content?: { isLoading?: boolean };
    } = {},
  ) =>
    render(
      <Tabs defaultValue="relatorio">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="relatorio" {...props.trigger}>
            {TEXTO_LONGO}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="relatorio" data-testid="tabs-content" {...props.content}>
          Conteúdo
        </TabsContent>
      </Tabs>,
    );

  it('TabsList quebra a faixa (flex-wrap) e o trigger encolhe (min-w-0)', () => {
    renderTabs();

    expect(screen.getByTestId('tabs-list').className).toContain('flex-wrap');

    const aba = screen.getByRole('tab', { name: TEXTO_LONGO });
    expect(aba.className).toContain('min-w-0');
    expect(aba.textContent).toBe(TEXTO_LONGO);
  });

  it('TabsContent usa anel de foco de 1px, não de 2px', () => {
    renderTabs();
    const painel = screen.getByTestId('tabs-content');

    expect(painel.className).toContain('focus-visible:ring-1');
    expect(painel.className).not.toContain('focus-visible:ring-2');
  });

  it('isLoading publica aria-busy no trigger e no painel; sem isLoading não publica', () => {
    const { unmount } = renderTabs();
    const aba = screen.getByRole('tab', { name: TEXTO_LONGO });
    expect(aba).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('tabs-content')).not.toHaveAttribute('aria-busy');
    unmount();

    renderTabs({ trigger: { isLoading: true }, content: { isLoading: true } });
    expect(screen.getByRole('tab', { name: TEXTO_LONGO })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('tabs-content')).toHaveAttribute('aria-busy', 'true');
  });
});
