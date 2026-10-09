/**
 * SL-077 · CP8 — QA das 8 abas do painel central do inbox.
 *
 * O QA do CP8 nasceu manual, em preview (12 prints + `inbox-measure.mjs` +
 * `inbox-colors.mjs` + `inbox-func.mjs`, os quatro em `/workspace/qa`, fora do
 * repositório). Este arquivo é a parte AUTOMÁTICA e repetível desse QA: cada
 * bloco prova uma dimensão do CP8 sobre a fonte de verdade, sem navegador —
 * mesmo padrão de `src/components/tasks/__tests__/movimentoEContraste.test.tsx`
 * (E.2/E.3 provados por leitura da fonte onde o render não mede).
 *
 *  - geometria — altura da barra e da aba ativa, nas classes que o navegador
 *    aplica. O `tabBar 48±2` do plano está DESATUALIZADO: vale `h-[53px]`
 *    desde `d99b78dd4` ("mesma altura do header Detalhes do Contato"), e o
 *    valor segue em 53 depois do SL-076 — o assert do E.2 é que envelheceu;
 *  - cores carvão — nenhum literal de cor (hex/rgb/hsl) na barra: só tokens;
 *  - funcional — barra e conteúdo têm de cobrir EXATAMENTE os mesmos 8 ids:
 *    aba na barra sem painel é clique que não abre nada;
 *  - mobile — rótulo só a partir de `2xl` e scroll próprio na barra: as 8 abas
 *    não empurram a largura da página (`scrollW <= innerW` do E.2);
 *  - light — a barra usa só tokens e nenhum ajuste `dark:`: os dois modos saem
 *    do mesmo par de tokens;
 *  - reduced-motion — com a preferência ligada a pílula da aba ativa não monta
 *    o `motion.span` (nenhum layout animation).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const reduceMotion = vi.hoisted(() => ({ value: false }));

// Só o hook homônimo e a pílula animada são substituídos; o resto da lib segue
// real (mesmo padrão do E63 do LocationPicker e do CT-70 do catálogo). O
// marcador `data-pilula-animada` diz QUAL ramo do componente foi montado.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const PilulaAnimada = ({ className, children }: { className?: string; children?: ReactNode }) => (
    <span data-pilula-animada="1" className={className}>
      {children}
    </span>
  );
  return {
    ...actual,
    useReducedMotion: () => reduceMotion.value,
    motion: { ...actual.motion, span: PilulaAnimada as unknown as typeof actual.motion.span },
  };
});

import { ConversationTabs, type ConversationTab } from '../ConversationTabs';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

const RAIZ = process.cwd();
const FONTE_ABAS = fs.readFileSync(
  path.join(RAIZ, 'src/components/inbox/chat/ConversationTabs.tsx'),
  'utf8',
);
const FONTE_CONTEUDO = fs.readFileSync(
  path.join(RAIZ, 'src/components/inbox/chat/ConversationTabContent.tsx'),
  'utf8',
);

/** Os 8 ids na ordem contratada (Chat sempre o primeiro). */
const IDS = ['chat', 'files', 'ia', 'crm', 'orders', 'history', 'tasks', 'notes'];

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

afterEach(() => {
  cleanup();
  reduceMotion.value = false;
});

function renderBarra(activeTab: ConversationTab = 'chat', counts: ConversationTabCounts = ZERO) {
  render(<ConversationTabs activeTab={activeTab} onTabChange={vi.fn()} counts={counts} />);
  return screen.getByTestId('conversation-tabs');
}

/** Toda classe usada na barra e nas abas, em uma lista só. */
function classesDaBarra(barra: HTMLElement): string[] {
  const alvos = [barra, ...barra.querySelectorAll<HTMLElement>('*')];
  return alvos.flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/)).filter(Boolean);
}

describe('CP8 · geometria das 8 abas', () => {
  it('a barra mantém a altura do header do painel (53px) e não volta aos 48px do plano', () => {
    const barra = renderBarra();
    expect(barra.getAttribute('class')).toContain('h-[53px]');
    // Regressão que o QA tem de pegar: rebaixar a barra para a altura antiga
    // (h-12 = 48px) desalinharia a barra do header "Detalhes do Contato".
    expect(barra.getAttribute('class')).not.toContain('h-12');
  });

  it('a aba ativa mede 36px (h-9) — dentro do alvo 36±2 do E.2', () => {
    renderBarra('crm');
    const ativa = screen.getByTestId('conversation-tab-crm');
    expect(ativa.getAttribute('aria-selected')).toBe('true');
    expect(ativa.getAttribute('class')).toContain('h-9');
  });

  it('todas as 8 abas têm a mesma altura (nenhuma aba encolhe ao ser selecionada)', () => {
    renderBarra('files');
    for (const id of IDS) {
      expect(screen.getByTestId(`conversation-tab-${id}`).getAttribute('class')).toContain('h-9');
    }
  });
});

describe('CP8 · cores carvão (nenhuma tinta nova)', () => {
  it('a barra não usa literal de cor — só tokens do sistema', () => {
    const barra = renderBarra('chat', { tasksOpen: 2, notesTotal: 1, filesTotal: 3 });
    const literais = classesDaBarra(barra).filter(
      (c) => /#[0-9a-f]{3,8}\b/i.test(c) || /\b(hsl|rgb|rgba|hsla)\(/i.test(c),
    );
    expect(literais).toEqual([]);
  });

  it('a barra e a pílula ativa usam os tokens carvão contratados', () => {
    // Aba ativa COM badge: assim o par `bg-primary`/`text-primary-foreground`
    // (badge da aba ativa) e o par `bg-muted`/`text-muted-foreground` (badge
    // das inativas) aparecem juntos, como no app.
    const barra = renderBarra('tasks', { tasksOpen: 2, notesTotal: 1, filesTotal: 3 });
    const classes = classesDaBarra(barra).join(' ');
    // superfície do painel + pílula + tinta de texto/borda
    for (const token of ['bg-inbox-panel', 'bg-accent', 'border-primary/40', 'text-foreground']) {
      expect(classes).toContain(token);
    }
    // estado inativo e badges
    for (const token of ['text-muted-foreground', 'bg-muted', 'bg-primary', 'text-primary-foreground']) {
      expect(classes).toContain(token);
    }
  });
});

describe('CP8 · funcional — as 8 abas existem na barra E têm painel', () => {
  it('a barra renderiza exatamente os 8 ids contratados, sem aba extra', () => {
    renderBarra();
    const ids = screen.getAllByRole('tab').map((b) => b.getAttribute('data-testid'));
    expect(ids).toEqual(IDS.map((id) => `conversation-tab-${id}`));
  });

  it('cada aba da barra tem um painel correspondente em ConversationTabContent', () => {
    // Fonte de verdade dos dois lados: os ids declarados na barra e os ramos
    // `activeTab === '<id>'` do conteúdo. Aba sem painel = clique morto.
    const naBarra = [...FONTE_ABAS.matchAll(/^\s*\{ id: '([a-z0-9]+)'/gm)].map((m) => m[1]);
    // `chat` aparece duas vezes no conteúdo (o wrapper escondido e o banner);
    // o contrato é o CONJUNTO de ids atendidos.
    const noConteudo = [...new Set([...FONTE_CONTEUDO.matchAll(/activeTab === '([a-z0-9]+)'/g)].map((m) => m[1]))];
    expect(naBarra).toEqual(IDS);
    // Barra e conteúdo cobrem o MESMO conjunto. `chat` entra pelos dois lados
    // (na barra é o id, no conteúdo é o wrapper que fica sempre montado).
    expect([...noConteudo].sort()).toEqual([...IDS].sort());
  });

  it('clicar em cada uma das 8 abas entrega o id certo (nenhuma aba morta)', () => {
    const onTabChange = vi.fn();
    render(<ConversationTabs activeTab="chat" onTabChange={onTabChange} counts={ZERO} />);
    for (const id of IDS) {
      fireEvent.click(screen.getByTestId(`conversation-tab-${id}`));
    }
    expect(onTabChange.mock.calls.map(([id]) => id)).toEqual(IDS);
  });
});

describe('CP8 · mobile — as 8 abas não estouram a largura', () => {
  it('o rótulo só aparece a partir de 2xl: abaixo disso as abas são só ícone', () => {
    const barra = renderBarra();
    const rotulos = [...barra.querySelectorAll('span')].filter((s) =>
      ['Chat', 'Arquivos', 'IA', 'CRM 360°', 'SalesView', 'Journey', 'Tarefas', 'Notas'].includes(
        s.textContent ?? '',
      ),
    );
    expect(rotulos).toHaveLength(8);
    for (const rotulo of rotulos) {
      expect(rotulo.getAttribute('class')).toContain('hidden 2xl:inline');
    }
  });

  it('a barra tem scroll próprio e não cresce com a largura mínima das abas', () => {
    const barra = renderBarra();
    expect(barra.getAttribute('class')).toContain('shrink-0');
    const tablist = screen.getByRole('tablist');
    expect(tablist.getAttribute('class')).toContain('overflow-x-auto');
    // nenhuma aba com largura mínima fixa: sem isso o `min-w` somado das 8
    // abas venceria o `scrollW <= innerW` do E.2 em 390x844.
    for (const id of IDS) {
      expect(screen.getByTestId(`conversation-tab-${id}`).getAttribute('class')).toContain('shrink-0');
      expect(screen.getByTestId(`conversation-tab-${id}`).getAttribute('class')).not.toMatch(/\bmin-w-/);
    }
  });
});

describe('CP8 · light — um par de tokens serve os dois modos', () => {
  it('a barra não carrega ajuste `dark:` (o fundo vem do token, não do tema)', () => {
    const classes = classesDaBarra(renderBarra('tasks'));
    expect(classes.filter((c) => c.startsWith('dark:'))).toEqual([]);
  });

  it('o token do fundo da barra tem valor nos dois modos', () => {
    const css = fs.readFileSync(path.join(RAIZ, 'src/styles/tokens.css'), 'utf8');
    const blocos = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, seletor, corpo]) => ({
        seletor: seletor.trim().split('\n').pop()?.trim() ?? '',
        corpo,
      }))
      .filter((b) => b.corpo.includes('--inbox-panel-bg'));
    const seletores = blocos.map((b) => b.seletor);
    expect(seletores.some((s) => s.includes(':root'))).toBe(true);
    expect(seletores.some((s) => s.includes('.dark'))).toBe(true);
  });
});

describe('CP8 · reduced-motion — a pílula da aba ativa', () => {
  it('com a preferência ligada a pílula é um span estático (nenhum layout animation)', () => {
    reduceMotion.value = true;
    const barra = renderBarra('chat');
    const pilula = barra.querySelector('span.absolute.inset-0');
    expect(pilula).not.toBeNull();
    expect(pilula?.getAttribute('class')).toContain('bg-accent');
    // O ramo reduzido é JSX puro: o `motion.span` não entra na árvore.
    expect(barra.querySelector('[data-pilula-animada]')).toBeNull();
  });

  it('controle: sem a preferência a pílula é animada (layoutId segue montado)', () => {
    reduceMotion.value = false;
    const barra = renderBarra('chat');
    expect(barra.querySelector('[data-pilula-animada]')).not.toBeNull();
    expect(barra.querySelector('span.absolute.inset-0')).not.toBeNull();
  });

  it('o componente consulta a preferência e mantém o ramo sem animação', () => {
    expect(FONTE_ABAS).toContain('const reduceMotion = useReducedMotion() ?? false;');
    expect(FONTE_ABAS).toMatch(/reduceMotion \?/);
    expect(FONTE_ABAS).toMatch(/<motion\.span[\s\S]*layoutId="conversation-tab-pill"/);
  });
});
