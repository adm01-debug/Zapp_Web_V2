/**
 * X053 — trilha do cabeçalho do módulo (`ModuleHeader.breadcrumb`).
 *
 * O aceite pede a trilha correta para aba, wizard e campanha. Os três casos abaixo
 * são exatamente os que as telas passam: a aba vem da rota (`?tab=`), o wizard fixa
 * "Nova Campanha" + o passo, e a campanha aberta vai pelo nome.
 *
 * O que se prova aqui é o CONTRATO do componente: com `breadcrumb`, sai um
 * `<nav aria-label="Trilha de navegação">` com os itens na ordem recebida — é o que
 * o leitor de tela anuncia e o que as telas consomem. Sem `breadcrumb` (ou com lista
 * vazia) nenhum nav é desenhado: o cabeçalho das telas que não usam a trilha fica
 * igual ao de antes.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zap } from 'lucide-react';
import { ModuleBreadcrumb, ModuleHeader } from '../primitives';

/** Itens visíveis do nav, na ordem — o separador › é decorativo e fica de fora. */
function itensDaTrilha(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
  return Array.from(nav.querySelectorAll('span'))
    .filter((el) => el.getAttribute('aria-hidden') !== 'true')
    .map((el) => el.textContent ?? '');
}

const CASOS: { caso: string; trilha: string[] }[] = [
  { caso: 'aba', trilha: ['Talk X', 'Campanhas', 'Visão geral'] },
  { caso: 'wizard', trilha: ['Talk X', 'Campanhas', 'Nova Campanha', 'Mensagem'] },
  { caso: 'campanha', trilha: ['Talk X', 'Campanhas', 'Campanha de outubro'] },
];

describe('ModuleHeader — trilha (X053)', () => {
  it.each(CASOS)('trilha de $caso: nav rotulado com os itens na ordem recebida', ({ trilha }) => {
    render(<ModuleHeader icon={Zap} title="Campanhas" breadcrumb={trilha} />);

    expect(itensDaTrilha()).toEqual(trilha);
    // o título da tela continua sendo um heading — a trilha não o substitui
    expect(screen.getByRole('heading', { name: 'Campanhas' })).toBeInTheDocument();
  });

  it('sem trilha não desenha nav nenhum (as telas que não passam breadcrumb não mudam)', () => {
    render(<ModuleHeader icon={Zap} title="Campanhas" subtitle="Subtítulo" />);

    expect(screen.queryByRole('navigation', { name: 'Trilha de navegação' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Campanhas' })).toBeInTheDocument();
  });

  it('lista vazia é o mesmo que não ter trilha (não desenha nav vazio)', () => {
    const { container } = render(<ModuleBreadcrumb items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
