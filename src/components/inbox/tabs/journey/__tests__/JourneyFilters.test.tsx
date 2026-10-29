/**
 * J10 — a barra de filtros da aba Journey (`JourneyFilters`).
 *
 * Cada teste monta o componente REAL com o estado real (o mesmo contrato que a aba vai passar:
 * valor + callback) e prova o que a barra ENTREGA ao consumidor:
 *   - período: o seletor da aba IA, sem "Última interação", convertido para `JourneyPeriod` do J02;
 *   - tipo: o valor de `TYPE_FILTER_OPTIONS` do J01, com a contagem da opção;
 *   - usuários: nenhuma marcada = todos, rótulo resumido ("Maria +1") e uma etiqueta por pessoa;
 *   - etiquetas dos filtros ativos + "Limpar filtros".
 *
 * O `Popover` do Radix não abre de forma confiável sob jsdom+fireEvent (mesmo motivo do
 * ChatPanelHeader.test.tsx), então ele é trocado por um contêiner sempre visível — o que importa
 * aqui é o conteúdo (os atalhos, a lista de pessoas) e o que o clique entrega. O `Select` é o do
 * design system de verdade, com os stubs de captura de ponteiro que o Radix pede no jsdom.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { axe } from 'vitest-axe';
import {
  JourneyFilters,
  type JourneyFilterUser,
} from '../JourneyFilters';
import type { JourneyTypeFilterValue } from '@/lib/journey/model';
import type { JourneyPeriod } from '@/lib/journey/periodRange';

// O gatilho do Select (Radix) chama `hasPointerCapture`/`scrollIntoView` no pointerdown que o abre
// (o jsdom não implementa captura de ponteiro nem rolagem).
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

// O Popover do Radix não abre de forma confiável sob jsdom+fireEvent (mesmo motivo do
// ChatPanelHeader.test.tsx): aqui vira contêiner sempre visível — o que se prova é o CONTEÚDO
// (atalhos de período, lista de pessoas) e o que o clique entrega ao consumidor.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const USUARIOS: JourneyFilterUser[] = [
  { id: 'maria', kind: 'user', name: 'Maria Souza', avatarUrl: null, count: 12 },
  { id: 'joao', kind: 'user', name: 'João Lima', avatarUrl: 'https://exemplo/foto.png', count: 7 },
  { id: 'contact', kind: 'contact', name: 'Cliente', avatarUrl: null, count: 18 },
  { id: 'system', kind: 'system', name: 'Sistema', avatarUrl: null, count: 5 },
];

/** O gatilho do seletor de período é o PRIMEIRO botão do bloco (o conteúdo do popover vem depois). */
function gatilhoPeriodo(): HTMLElement {
  const [gatilho] = within(screen.getByTestId('journey-period-filter')).getAllByRole('button');
  return gatilho;
}

interface HarnessProps {
  periodoInicial?: JourneyPeriod;
  tipoInicial?: JourneyTypeFilterValue;
  usuariosIniciais?: string[];
  users?: JourneyFilterUser[];
  typeCounts?: Partial<Record<JourneyTypeFilterValue, number>>;
  onPeriodo?: (periodo: JourneyPeriod) => void;
  onTipo?: (tipo: JourneyTypeFilterValue) => void;
  onUsuarios?: (ids: string[]) => void;
}

/** Estado real do consumidor: cada callback guarda o valor e devolve para a barra. */
function Harness({
  periodoInicial = { preset: '7d' },
  tipoInicial = 'all',
  usuariosIniciais = [],
  users = USUARIOS,
  typeCounts,
  onPeriodo,
  onTipo,
  onUsuarios,
}: HarnessProps) {
  const [period, setPeriod] = useState<JourneyPeriod>(periodoInicial);
  const [type, setType] = useState<JourneyTypeFilterValue>(tipoInicial);
  const [userIds, setUserIds] = useState<string[]>(usuariosIniciais);
  return (
    <JourneyFilters
      period={period}
      onPeriodChange={(proximo) => {
        onPeriodo?.(proximo);
        setPeriod(proximo);
      }}
      type={type}
      onTypeChange={(proximo) => {
        onTipo?.(proximo);
        setType(proximo);
      }}
      userIds={userIds}
      onUserIdsChange={(ids) => {
        onUsuarios?.(ids);
        setUserIds(ids);
      }}
      users={users}
      typeCounts={typeCounts}
      filteredCount={42}
      totalCount={128}
    />
  );
}

describe('JourneyFilters', () => {
  it('abre no padrão "Últimos 30 dias" e não oferece "Última interação" (S045)', () => {
    render(
      <JourneyFilters
        onPeriodChange={vi.fn()}
        onTypeChange={vi.fn()}
        onUserIdsChange={vi.fn()}
        users={USUARIOS}
        filteredCount={42}
        totalCount={128}
      />,
    );

    // O gatilho é o MESMO seletor da aba IA: rótulo do atalho + contador "42/128".
    expect(gatilhoPeriodo()).toHaveTextContent('Últimos 30 dias');
    expect(gatilhoPeriodo()).toHaveTextContent('42/128');
    // Os atalhos da IA continuam lá…
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Últimos 90 dias' })).toBeInTheDocument();
    // …e "Última interação", que só faz sentido com histórico de mensagens, NÃO.
    expect(screen.queryByText('Última interação')).toBeNull();
  });

  it('atalho do seletor entrega um JourneyPeriod sem datas (conversão do J02)', () => {
    const onPeriodo = vi.fn();
    render(
      <Harness
        periodoInicial={{ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }}
        onPeriodo={onPeriodo}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));

    // `AnalysisPeriod` do seletor -> `JourneyPeriod` do J02, e o atalho não guarda "De/Até".
    expect(onPeriodo).toHaveBeenCalledWith({ preset: 'today', from: undefined, to: undefined });
    expect(within(screen.getByTestId('journey-filter-chips')).getByText('Hoje')).toBeInTheDocument();
  });

  it('período personalizado aparece descrito com o intervalo e o X limpa só a data', () => {
    const onPeriodo = vi.fn();
    render(
      <Harness
        periodoInicial={{ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }}
        onPeriodo={onPeriodo}
      />,
    );

    // JourneyPeriod -> descrição do J02, na etiqueta e no gatilho (dd/MM/yy do seletor da IA).
    expect(
      within(screen.getByTestId('journey-filter-chips')).getByText('01/10 a 07/10/2026'),
    ).toBeInTheDocument();
    expect(gatilhoPeriodo()).toHaveTextContent('01/10/26 — 07/10/26');

    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro 01/10 a 07/10/2026' }));

    expect(onPeriodo).toHaveBeenCalledWith({ preset: 'any', from: undefined, to: undefined });
    expect(screen.queryByTestId('journey-filter-chips')).toBeNull();
    expect(gatilhoPeriodo()).toHaveTextContent('Qualquer data');
  });

  it('filtro de tipo mostra a contagem de cada opção e entrega o valor do model', () => {
    const onTipo = vi.fn();
    render(<Harness onTipo={onTipo} typeCounts={{ all: 60, call: 12, email: 3 }} />);

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Tipo de evento' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    expect(screen.getByRole('option', { name: 'Todos (60)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Telefone (12)' })).toBeInTheDocument();
    // Opção sem contagem não inventa parênteses.
    expect(screen.getByRole('option', { name: 'Propostas' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Telefone (12)' }));

    expect(onTipo).toHaveBeenCalledWith('call');
    expect(within(screen.getByTestId('journey-filter-chips')).getByText('Telefone')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de evento' })).toHaveTextContent('Telefone (12)');
  });

  it('nenhuma pessoa marcada = todos, e o rótulo resume a seleção', () => {
    const onUsuarios = vi.fn();
    render(<Harness onUsuarios={onUsuarios} />);

    expect(screen.getByText('Nenhuma marcada = todos')).toBeInTheDocument();
    const gatilho = screen.getByTestId('journey-users-trigger');
    expect(gatilho).toHaveTextContent('Todos');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Maria Souza' }));
    expect(onUsuarios).toHaveBeenCalledWith(['maria']);
    expect(screen.getByTestId('journey-users-trigger')).toHaveTextContent('Maria Souza');
    // "Cliente" e "Sistema" são opções como as demais.
    expect(screen.getByRole('checkbox', { name: 'Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sistema' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'João Lima' }));
    expect(onUsuarios).toHaveBeenLastCalledWith(['maria', 'joao']);
    expect(screen.getByTestId('journey-users-trigger')).toHaveTextContent('Maria Souza +1');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Maria Souza' }));
    expect(onUsuarios).toHaveBeenLastCalledWith(['joao']);
    expect(screen.getByTestId('journey-users-trigger')).toHaveTextContent('João Lima');

    fireEvent.click(screen.getByRole('checkbox', { name: 'João Lima' }));
    expect(onUsuarios).toHaveBeenLastCalledWith([]);
    expect(screen.getByTestId('journey-users-trigger')).toHaveTextContent('Todos');
  });

  it('cada pessoa marcada vira etiqueta e o X tira só aquela', () => {
    const onUsuarios = vi.fn();
    render(<Harness usuariosIniciais={['maria', 'joao']} onUsuarios={onUsuarios} />);

    const etiquetas = within(screen.getByTestId('journey-filter-chips'));
    expect(etiquetas.getByText('Maria Souza')).toBeInTheDocument();
    expect(etiquetas.getByText('João Lima')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Maria Souza' }));

    expect(onUsuarios).toHaveBeenCalledWith(['joao']);
    const depois = within(screen.getByTestId('journey-filter-chips'));
    expect(depois.queryByText('Maria Souza')).toBeNull();
    expect(depois.getByText('João Lima')).toBeInTheDocument();
  });

  it('a busca dentro da lista só aparece acima de 8 opções e filtra pelo nome', () => {
    const { unmount } = render(<Harness />);
    // 4 pessoas: sem busca.
    expect(screen.queryByTestId('journey-users-search')).toBeNull();
    unmount();

    const muitos: JourneyFilterUser[] = Array.from({ length: 9 }, (_, i) => ({
      id: `pessoa-${i}`,
      kind: 'user' as const,
      name: i === 3 ? 'João Lima' : `Pessoa ${i}`,
      avatarUrl: null,
      count: i,
    }));
    render(<Harness users={muitos} />);

    const busca = screen.getByTestId('journey-users-search');
    fireEvent.change(busca, { target: { value: 'joao' } });

    const opcoes = within(screen.getByTestId('journey-users-options'));
    expect(opcoes.getByTestId('journey-user-pessoa-3')).toBeInTheDocument();
    expect(opcoes.queryByTestId('journey-user-pessoa-0')).toBeNull();
    // A busca ignora acento: "joao" encontra "João".
    expect(opcoes.getByText('João Lima')).toBeInTheDocument();
  });

  it('"Limpar filtros" devolve período, tipo e pessoas ao zero', () => {
    const onPeriodo = vi.fn();
    const onTipo = vi.fn();
    const onUsuarios = vi.fn();
    render(
      <Harness
        periodoInicial={{ preset: '30d' }}
        tipoInicial="call"
        usuariosIniciais={['maria']}
        onPeriodo={onPeriodo}
        onTipo={onTipo}
        onUsuarios={onUsuarios}
      />,
    );

    expect(screen.getByTestId('journey-filter-chips').children).toHaveLength(3);

    fireEvent.click(screen.getByTestId('journey-filters-clear'));

    expect(onPeriodo).toHaveBeenCalledWith({ preset: 'any', from: undefined, to: undefined });
    expect(onTipo).toHaveBeenCalledWith('all');
    expect(onUsuarios).toHaveBeenCalledWith([]);
    // Sem filtro ativo não sobra etiqueta nem botão de limpar.
    expect(screen.queryByTestId('journey-filter-chips')).toBeNull();
    expect(screen.queryByTestId('journey-filters-clear')).toBeNull();
    expect(gatilhoPeriodo()).toHaveTextContent('Qualquer data');
  });

  it('não introduz violação de acessibilidade', async () => {
    const { container } = render(
      <Harness
        periodoInicial={{ preset: '30d' }}
        tipoInicial="call"
        usuariosIniciais={['maria']}
        typeCounts={{ all: 60, call: 12 }}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
