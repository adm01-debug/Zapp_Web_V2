import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, cleanup, screen } from '@testing-library/react';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactListItem } from '@/components/contacts/ContactListItem';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { PAIRS, measure, parseThemes } from '../../../../scripts/qa/contraste-contatos.mjs';
import { baseContact, noop } from './contactDeleteFixtures';

/**
 * ZD-104 — contrato de qualidade do redesign de Contatos.
 *
 * Os testes de comportamento cobrem o que a tela FAZ; este arquivo tranca o que
 * o redesign PROMETEU e regride sem quebrar nenhum fluxo: o contraste AA dos
 * dois temas, o piso da escala tipografica, a area de toque no ponteiro grosso e
 * o custo de carregar fotos. Cada assercao falha em cima do commit que a quebrou.
 */

const raiz = process.cwd();
const ler = (...partes: string[]) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');

const tokens = ler('src/styles/tokens.css');

/** Extrai o bloco `selector { ... }` contando chaves — o CSS tem blocos aninhados. */
function bloco(css: string, seletor: string) {
  const inicio = css.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`bloco ${seletor} ausente`);
  let profundidade = 0;
  for (let i = css.indexOf('{', inicio); i < css.length; i++) {
    if (css[i] === '{') profundidade++;
    else if (css[i] === '}' && --profundidade === 0) return css.slice(inicio, i);
  }
  throw new Error(`bloco ${seletor} sem fechamento`);
}

afterEach(() => cleanup());

describe('ZD-098/ZD-097 — contraste AA dos tokens de Contatos', () => {
  it('todo par de texto do modulo passa 4.5:1 no claro e no escuro', () => {
    const temas = parseThemes(tokens);
    const pares = measure(temas);
    expect(pares.length).toBe(PAIRS.length * 2);
    const reprovados = pares.filter((p) => p.ratio < 4.5);
    expect(reprovados, JSON.stringify(reprovados, null, 2)).toEqual([]);
  });

  it('--contacts-quiet nao volta ao valor que reprovava no card escuro', () => {
    const claro = bloco(tokens, ':root');
    const escuro = bloco(tokens, '.dark');
    expect(claro).not.toContain('--contacts-quiet: 240 4% 58%');
    expect(escuro).not.toContain('--contacts-quiet: 220 7% 45%');
    expect(claro).toContain('--contacts-quiet: 240 4% 42%');
    expect(escuro).toContain('--contacts-quiet: 220 7% 58%');
  });
});

describe('ZD-098 — piso da escala tipografica', () => {
  const arquivos = fs
    .readdirSync(path.join(raiz, 'src/components/contacts'))
    .filter((nome) => /\.tsx?$/.test(nome) && !nome.includes('.test.'));

  it('nenhum componente do modulo usa tamanho abaixo de 10px', () => {
    const infratores: string[] = [];
    for (const nome of arquivos) {
      const fonte = ler('src/components/contacts', nome);
      for (const [, px] of fonte.matchAll(/text-\[(\d+)px\]/g)) {
        if (Number(px) < 10) infratores.push(`${nome}: text-[${px}px]`);
      }
    }
    expect(infratores).toEqual([]);
  });
});

describe('ZD-099 — rotulos acessiveis dos controles obrigatorios', () => {
  function props() {
    return {
      contact: baseContact({ id: 'c-1' }),
      isSelected: false,
      onToggleSelect: vi.fn(),
      onOpenDetails: vi.fn(),
      onOpenChat: vi.fn(),
      onEdit: noop,
      onDelete: noop,
      index: 0,
    };
  }

  it('o card expoe checkbox e menu de acoes com nome acessivel', () => {
    render(<ContactCard {...props()} />);
    expect(screen.getByRole('checkbox', { name: /Selecionar Ana Souza/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ações do contato Ana Souza/ })).toBeTruthy();
  });

  it('a lista e a tabela mantem o nome do contato no controle de detalhes', () => {
    render(<ContactListItem {...props()} />);
    expect(screen.getByRole('checkbox', { name: /Selecionar Ana Souza/ })).toBeTruthy();
    cleanup();
    render(
      <ContactsTable
        contacts={[baseContact({ id: 'c-1' })]}
        selectedIds={[]}
        onSelectIds={noop}
        onOpenDetails={vi.fn()}
        onOpenChat={vi.fn()}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Selecionar Ana Souza/ })).toBeTruthy();
  });

  it('o gatilho de Filtros Salvos nao depende do texto visivel no celular', () => {
    const fonte = ler('src/components/contacts/FilterPresets.tsx');
    expect(fonte).toContain('aria-label="Filtros Salvos"');
    expect(fonte).toContain('hidden sm:inline');
  });

  it('a contagem da tela e anunciada em regiao viva', () => {
    const fonte = ler('src/components/contacts/ContactsView.tsx');
    expect(fonte).toContain('aria-live="polite"');
    expect(fonte).toContain('data-contacts-live=""');
  });
});

describe('ZD-100 — area de toque no ponteiro grosso', () => {
  const utilidades = ler('src/styles/utilities.css');

  it('a utilidade de 44px existe e so age no ponteiro grosso', () => {
    const inicioRegra = utilidades.indexOf('.alvo-toque-44::after {');
    expect(inicioRegra).toBeGreaterThan(0);
    const trecho = utilidades.slice(inicioRegra - 400, inicioRegra + 400);
    expect(trecho).toContain('@media (pointer: coarse)');
    expect(trecho).toContain('width: 44px');
    expect(trecho).toContain('height: 44px');
  });

  it('o menu do card fica longe o bastante da area de toque do checkbox', () => {
    const fonte = ler('src/components/contacts/ContactCard.tsx');
    // O checkbox cresce para 38px no ponteiro grosso e o ::after de 44px chega a
    // 22px do centro; o menu precisa comecar depois disso.
    expect(fonte).toContain('right-[56px]');
    expect(fonte).not.toContain('max-[559px]:right-[46px]');
  });

  it('o checkbox usa a utilidade de area de toque', () => {
    expect(ler('src/components/ui/checkbox.tsx')).toContain('alvo-toque-44');
  });
});

describe('ZD-101 — orcamento de fotos do card', () => {
  it('so as tres primeiras posicoes carregam a foto com prioridade', () => {
    expect(ler('src/components/contacts/ContactCard.tsx')).toContain('priority={index < 3}');
  });

  it('o retrato respeita o modo de carregamento pedido', () => {
    const fonte = ler('src/components/contacts/ContactPortrait.tsx');
    expect(fonte).toContain("loading={priority ? 'eager' : 'lazy'}");
    expect(fonte).toContain('fetchPriority');
    expect(fonte).toContain('decoding="async"');
  });
});