import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Item 270 / R2-AUTH-046 — "Seletor de proficiência sempre cadastra nível 3".
//
// O seletor de proficiência do agente (SkillBasedRoutingSettings) era
// decorativo: o <Select> tinha `onValueChange={() => {}}` e o insert gravava
// `skill_level: 3` fixo. O usuário escolhia 5 e salvava 3.
//
// Os primitivos do Radix são trocados por <select>/<option> nativos que
// repassam o evento do usuário para o `onValueChange` REAL do componente
// (mesmo padrão de src/components/contacts/__tests__/ContactToolbar.test.tsx):
// o handler de produção continua sendo exercitado.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const rows: Record<string, unknown[]> = {
    profiles: [{ id: 'p1', name: 'Ana' }],
    queues: [{ id: 'q1', name: 'Suporte', color: '#000000' }],
    agent_skills: [],
    queue_skill_requirements: [],
  };
  return { inserts, rows };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children,
    ...rest
  }: {
    value?: string;
    defaultValue?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
    [key: string]: unknown;
  }) => {
    let ariaLabel: string | undefined;
    React.Children.forEach(children, child => {
      if (React.isValidElement(child)) {
        const props = child.props as Record<string, unknown>;
        if (props['aria-label']) {
          ariaLabel = props['aria-label'] as string;
        }
      }
    });
    return (
      <select
        aria-label={ariaLabel}
        value={value ?? defaultValue ?? ''}
        onChange={e => onValueChange?.(e.target.value)}
        {...rest}
      >
        {children}
      </select>
    );
  },
  SelectTrigger: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <span {...props}>{children}</span>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainFor = (table: string) => {
    const result = { data: h.rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      delete: () => chain,
      insert: (payload: Record<string, unknown>) => {
        h.inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };
  return { supabase: { from: chainFor } };
});

import { SkillBasedRoutingSettings } from '../SkillBasedRoutingSettings';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** O <select> que contém a opção pedida (o nome dele vem do conteúdo, não da posição). */
function comboComOpcao(texto: string): HTMLSelectElement {
  const combo = screen
    .getAllByRole('combobox')
    .find(c => within(c).queryByRole('option', { name: texto }));
  if (!combo) throw new Error(`Nenhum seletor com a opção "${texto}"`);
  return combo as HTMLSelectElement;
}

/** Seleciona o agente e digita a skill; devolve o seletor de nível já localizado. */
async function prepararFormularioDeSkill(nomeDaSkill: string) {
  render(<SkillBasedRoutingSettings />, { wrapper });

  // A lista de agentes vem da query: só depois dela o seletor tem a opção "Ana".
  const seletorAgente = await waitFor(() => comboComOpcao('Ana'), { timeout: ESPERA_ESTADO_REAL });
  fireEvent.change(seletorAgente, { target: { value: 'p1' } });

  fireEvent.change(await screen.findByPlaceholderText('Nome da skill (ex: Inglês)', undefined, { timeout: ESPERA_ESTADO_REAL }), {
    target: { value: nomeDaSkill },
  });

  return comboComOpcao('Nível 5');
}

const skillGravada = () => h.inserts.find(i => i.table === 'agent_skills');

/**
 * Teto de espera das consultas assíncronas (`findBy*`/`waitFor`).
 *
 * O padrão do Testing Library é 1000 ms; com a máquina carregada a primeira
 * espera (o seletor de agente, que só ganha a opção "Ana" depois da query de
 * `profiles`) passa desse teto e o teste falhava por tempo, não por
 * comportamento (medido 1438 ms sob carga no cartão). A espera continua sendo
 * por ESTADO real: a mesma consulta, a mesma asserção, só com o teto explícito
 * e dimensionado. Não é sleep — nada espera tempo fixo.
 */
const ESPERA_ESTADO_REAL = 5000;

describe('SkillBasedRoutingSettings — seletor de proficiência (item 270)', () => {
  beforeEach(() => {
    h.inserts.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it('grava a skill com o nível escolhido pelo usuário', async () => {
    const seletorNivel = await prepararFormularioDeSkill('Inglês');

    fireEvent.change(seletorNivel, { target: { value: '5' } });
    expect(seletorNivel.value).toBe('5');

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(skillGravada()).toBeDefined(), { timeout: ESPERA_ESTADO_REAL });
    expect(skillGravada()!.payload).toMatchObject({
      profile_id: 'p1',
      skill_name: 'Inglês',
      skill_level: 5,
    });
  });

  it('mantém nível 3 como padrão quando o usuário não mexe no seletor', async () => {
    await prepararFormularioDeSkill('Espanhol');

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(skillGravada()).toBeDefined(), { timeout: ESPERA_ESTADO_REAL });
    expect(skillGravada()!.payload).toMatchObject({
      skill_name: 'Espanhol',
      skill_level: 3,
    });
  });
});

describe('SkillBasedRoutingSettings — acessibilidade dos seletores (N-157)', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it('4 comboboxes são encontrados por nome e axe não aponta violações', async () => {
    const { container } = render(<SkillBasedRoutingSettings />, { wrapper });

    // Seleciona um agente para revelar o seletor de nível de proficiência.
    const seletorAgente = await waitFor(
      () => comboComOpcao('Ana'),
      { timeout: ESPERA_ESTADO_REAL }
    );
    fireEvent.change(seletorAgente, { target: { value: 'p1' } });

    // Seleciona uma fila para revelar o seletor de nível mínimo da fila.
    const seletorFila = await waitFor(
      () => comboComOpcao('Suporte'),
      { timeout: ESPERA_ESTADO_REAL }
    );
    fireEvent.change(seletorFila, { target: { value: 'q1' } });

    // 4 comboboxes encontrados por nome acessível
    expect(screen.getByRole('combobox', { name: 'Selecionar agente' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nível de proficiência' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Selecionar fila' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nível mínimo da fila' })).toBeInTheDocument();

    // Axe zerado — roda sobre o container completo do componente (inclui CardContent
    // onde os selects vivem) e desliga regras de ruído page-level (region) e de
    // botões desabilitados preexistentes (button-name) que não pertencem a esta correção.
    const results = await axe(container, {
      rules: { region: { enabled: false }, 'button-name': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
