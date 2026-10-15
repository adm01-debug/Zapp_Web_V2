import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Button, MotionButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { illustrations } from '@/components/ui/empty-state-illustrations';

// Texto de 120 caracteres, como o cartão pede. O `padEnd` garante o tamanho exato.
const TEXTO_120 = 'Relatório consolidado de atendimentos'.padEnd(120, ' de detalhe');

const CARREGANDO_CLASSES = ['opacity-0', 'inline-flex', 'min-w-0'];

describe('primitivos de UI com texto longo (120 caracteres)', () => {
  it('o texto de prova tem 120 caracteres', () => {
    expect(TEXTO_120).toHaveLength(120);
  });

  it('Badge: min-w-0 + truncate seguram o rótulo e o title guarda o texto inteiro', () => {
    render(<Badge title={TEXTO_120}>{TEXTO_120}</Badge>);

    const pilula = screen.getByText(TEXTO_120);
    expect(pilula.tagName).toBe('DIV');
    for (const classe of ['min-w-0', 'max-w-full', 'truncate']) {
      expect(pilula.className).toContain(classe);
    }
    expect(pilula).toHaveAttribute('title', TEXTO_120);
  });

  it('Badge: rótulo curto renderiza o mesmo className (nenhuma classe depende do tamanho)', () => {
    const { container: curto } = render(<Badge>Ativo</Badge>);
    const { container: longo } = render(<Badge>{TEXTO_120}</Badge>);

    const classesCurto = curto.firstElementChild?.className;
    expect(classesCurto).toBe(longo.firstElementChild?.className);
    expect(classesCurto).toContain('truncate');
  });

  it('TabsTrigger: min-w-0 + truncate seguram a aba e o title guarda o texto inteiro', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" title={TEXTO_120}>
            {TEXTO_120}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">conteúdo</TabsContent>
      </Tabs>,
    );

    const aba = screen.getByRole('tab', { name: TEXTO_120 });
    for (const classe of ['min-w-0', 'truncate']) {
      expect(aba.className).toContain(classe);
    }
    expect(aba).toHaveAttribute('title', TEXTO_120);
  });

  it('Card: a caixa do pai encolhe (min-w-0) e o título/descrição quebram linha', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="card-header">
          <CardTitle data-testid="card-title">{TEXTO_120}</CardTitle>
          <CardDescription data-testid="card-description">{TEXTO_120}</CardDescription>
        </CardHeader>
        <CardContent data-testid="card-content">conteúdo</CardContent>
        <CardFooter data-testid="card-footer">rodapé</CardFooter>
      </Card>,
    );

    for (const parte of ['card-header', 'card-content', 'card-footer']) {
      expect(screen.getByTestId(parte).className).toContain('min-w-0');
    }

    for (const texto of ['card-title', 'card-description']) {
      const no = screen.getByTestId(texto);
      expect(no.className).toContain('min-w-0');
      expect(no.className).toContain('break-words');
      expect(no.textContent).toBe(TEXTO_120);
    }
  });

  it('Label: usa leading-snug, não leading-none', () => {
    render(<Label data-testid="rotulo">{TEXTO_120}</Label>);

    const rotulo = screen.getByTestId('rotulo');
    expect(rotulo.className).toContain('leading-snug');
    expect(rotulo.className).not.toContain('leading-none');
  });

  it('Label: rótulo curto e rótulo longo renderizam o mesmo className', () => {
    const { container: curto } = render(<Label>Nome</Label>);
    const { container: longo } = render(<Label>{TEXTO_120}</Label>);

    // Nenhuma classe depende do tamanho do texto: a altura de um rótulo de uma linha
    // vem só do token `text-sm` (1.25rem no tailwind.config.ts), e `leading-snug`
    // (1.375 × 14px = 19,25px) é o valor mais próximo dele no tema.
    expect(curto.firstElementChild?.className).toBe(longo.firstElementChild?.className);
    expect(curto.firstElementChild?.className).toContain('text-sm');
  });

  it('ilustrações de estado vazio são decorativas (aria-hidden) em todas as chaves', () => {
    const chaves = Object.keys(illustrations);
    expect(chaves.length).toBeGreaterThan(0);

    render(
      <div>
        {chaves.map((chave) => (
          <div key={chave}>{illustrations[chave]}</div>
        ))}
      </div>,
    );

    const svgs = document.querySelectorAll('svg');
    expect(svgs).toHaveLength(chaves.length);
    for (const svg of Array.from(svgs)) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).not.toHaveAttribute('role');
    }
  });
});

describe('Button em carregamento anuncia o estado sem perder foco nem largura', () => {
  it('isLoading publica aria-busy/aria-disabled e NÃO desabilita o botão', () => {
    render(<Button isLoading>Salvar cliente</Button>);

    const botao = screen.getByRole('button', { name: 'Salvar cliente' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    expect(botao).toBeEnabled();
    expect(botao).not.toHaveAttribute('disabled');
    botao.focus();
    expect(botao).toHaveFocus();
  });

  it('o texto de carregamento fica visível e o rótulo escondido reserva a largura', () => {
    render(
      <Button isLoading loadingText="Enviando…">
        Salvar cliente
      </Button>,
    );

    // O nome do botão é o texto de carregamento, e ele aparece de verdade na tela.
    const botao = screen.getByRole('button', { name: 'Enviando…' });
    expect(botao.textContent).toContain('Enviando…');
    const textoVisivel = screen.getByText('Enviando…');
    expect(textoVisivel.className).not.toContain('opacity-0');

    // O rótulo de repouso fica invisível no lugar (mede a largura) e fora da fala do leitor.
    const repouso = screen.getByText('Salvar cliente');
    expect(botao.contains(repouso)).toBe(true);
    for (const classe of CARREGANDO_CLASSES) {
      expect(repouso.className).toContain(classe);
    }
    expect(repouso).toHaveAttribute('aria-hidden', 'true');

    // O indicador fica em cima, em absoluto (não empurra o layout) e só gira com
    // `prefers-reduced-motion: no-preference`.
    const giro = botao.querySelector('svg');
    expect(giro).toHaveAttribute('aria-hidden', 'true');
    expect(giro?.getAttribute('class')).toContain('motion-safe:animate-spin');
    const camada = giro?.closest('span');
    expect(camada?.className).toContain('absolute');
    expect(camada?.className).toContain('inset-0');
  });

  it('sem loadingText o nome acessível do botão continua sendo o rótulo', () => {
    render(<Button isLoading>Salvar cliente</Button>);

    const botao = screen.getByRole('button', { name: 'Salvar cliente' });
    const repouso = screen.getByText('Salvar cliente');
    expect(botao.textContent).toContain('Salvar cliente');
    expect(repouso.className).toContain('opacity-0');
    expect(repouso).not.toHaveAttribute('aria-hidden');
  });

  it('sem isLoading o botão sai igual ao de sempre: filho direto e nenhum aria-busy', () => {
    render(<Button>Salvar cliente</Button>);

    const botao = screen.getByRole('button', { name: 'Salvar cliente' });
    expect(botao).not.toHaveAttribute('aria-busy');
    expect(botao).not.toHaveAttribute('aria-disabled');
    expect(botao.className).not.toContain('opacity-0');
    expect(botao.querySelector('span')).toBeNull();
  });

  it('MotionButton segue o mesmo contrato de carregamento', () => {
    render(<MotionButton isLoading>Gerar relatório</MotionButton>);

    const botao = screen.getByRole('button', { name: 'Gerar relatório' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    expect(botao).toBeEnabled();
    expect(screen.getByText('Gerar relatório').className).toContain('opacity-0');
  });
});
