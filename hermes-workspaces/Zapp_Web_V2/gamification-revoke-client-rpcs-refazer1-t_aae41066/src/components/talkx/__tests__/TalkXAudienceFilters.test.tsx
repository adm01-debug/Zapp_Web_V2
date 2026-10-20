/**
 * X126 — a trilha "Filtros de audiência" do passo 1 (mock 08) com os 7 controles
 * lendo o catálogo de filtros dos segmentos.
 *
 * Antes: só Empresa e Tag, de escolha única, e os dois SUMIAM quando não havia
 * valor na base (`TalkXContactSelector:137-158`); Status, Estágio no funil,
 * Vendedor, RFM e Localização não existiam.
 *
 * Este teste monta o componente REAL com o estado real das regras (o mesmo
 * contrato que o wizard passa: `rules` + `onChange`) e confere a regra que cada
 * escolha do usuário produz em `audience_filters` — o JSON do motor dos
 * segmentos. O caso do filtro sem coluna no motor cobre o A9: continua na tela,
 * desabilitado com "sem dados ainda", em vez de sumir.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { emptyRules, RULE_FIELDS, type SegmentRule, type SegmentRules } from '@/hooks/integrations/useTalkXSegments';
import { TalkXAudienceFilters, type AudienceFilterOptions } from '../TalkXAudienceFilters';

// O gatilho do Select (Radix) chama `hasPointerCapture` no pointerdown que o abre
// (o jsdom não implementa captura de ponteiro).
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const VENDEDOR_ID = '3f8d2c90-9a5b-4f1e-9b4a-1c2d3e4f5a6b';

const OPCOES: AudienceFilterOptions = {
  tags: ['VIP', 'Lead'],
  companies: ['Acme Brindes'],
  sellers: [{ id: VENDEDOR_ID, name: 'Ana Souza' }],
};

/** Regras que o componente entregou ao consumidor (o que vai para `audience_filters`). */
const enviadas: SegmentRules[] = [];
const limpezasExtras = vi.fn();

function ultimasRegras(): SegmentRules {
  return enviadas[enviadas.length - 1];
}

function Harness({ options = OPCOES, inicial }: { options?: AudienceFilterOptions; inicial?: SegmentRules }) {
  const [rules, setRules] = useState<SegmentRules>(() => inicial ?? emptyRules());
  const aplicar = (next: SegmentRules) => { enviadas.push(next); setRules(next); };
  return <TalkXAudienceFilters rules={rules} onChange={aplicar} options={options} onClear={limpezasExtras} />;
}

/** Abre um Select do Radix pelo evento do usuário e escolhe a opção. */
function escolher(label: string, opcao: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: label }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

function regrasDoCampo(field: string) {
  return ultimasRegras().groups.flatMap((group) => group.rules).filter((rule) => rule.field === field);
}

function textoDaRegra(field: string) {
  return regrasDoCampo(field).map((rule) => `${rule.field} ${rule.op} ${rule.value}`);
}

/** Regras de cada grupo, como texto, na última entrega ao consumidor. */
function textoPorGrupo() {
  return ultimasRegras().groups.map((group) => group.rules.map((rule) => `${rule.field} ${rule.op} ${rule.value}`));
}

let seq = 0;
const regra = (field: SegmentRule['field'], op: SegmentRule['op'], value: string): SegmentRule => ({
  id: `r${++seq}`, field, op, value,
});

beforeEach(() => {
  enviadas.length = 0;
  limpezasExtras.mockClear();
});

describe('X126 · os 7 filtros de audiência (mock 08)', () => {
  it('na ordem do mock: Tags, Status do contato, Empresa, Estágio no funil, Vendedor, RFM, Localização', () => {
    const { container } = render(<Harness />);

    const ordem = Array.from(container.querySelectorAll('[data-talkx-filter]'))
      .map((elemento) => elemento.getAttribute('data-talkx-filter'));
    expect(ordem).toEqual(['tags', 'contact_status', 'company', 'funnel_stage', 'seller', 'rfm', 'location']);
  });

  it('Tags é múltipla: cada tag marcada vira uma regra "tags contém"', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'VIP' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lead' }));

    expect(textoDaRegra('tags')).toEqual(['tags contains VIP', 'tags contains Lead']);

    // Desmarcar tira só aquela tag (a outra continua no filtro).
    fireEvent.click(screen.getByRole('checkbox', { name: 'VIP' }));
    expect(textoDaRegra('tags')).toEqual(['tags contains Lead']);
  });

  it('Status do contato usa a entrada do catálogo (`conversation_status`) com as opções canônicas', () => {
    const opcoesDoCatalogo = RULE_FIELDS.find((field) => field.value === 'conversation_status')?.options ?? [];
    expect(opcoesDoCatalogo.length).toBeGreaterThan(0);

    render(<Harness />);
    escolher('Status do contato', opcoesDoCatalogo[0]);

    expect(textoDaRegra('conversation_status')).toEqual([`conversation_status eq ${opcoesDoCatalogo[0]}`]);
  });

  it('Empresa escolhida vira a regra "company é igual a"', () => {
    render(<Harness />);
    escolher('Empresa', 'Acme Brindes');

    expect(textoDaRegra('company')).toEqual(['company eq Acme Brindes']);
  });

  it('Vendedor escolhido vira a regra "assigned_to é igual a" com o id do perfil', () => {
    render(<Harness />);
    escolher('Vendedor', 'Ana Souza');

    expect(textoDaRegra('assigned_to')).toEqual([`assigned_to eq ${VENDEDOR_ID}`]);
  });

  it('Localização (UF e cidade) vira uma regra de UF e uma de cidade', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'UF' }), { target: { value: 'SP' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), { target: { value: 'Campinas' } });

    expect(textoDaRegra('state')).toEqual(['state eq SP']);
    expect(textoDaRegra('city')).toEqual(['city eq Campinas']);
  });

  it('"Limpar filtros" zera as regras (e pede as limpezas extras do consumidor)', () => {
    render(<Harness />);
    escolher('Empresa', 'Acme Brindes');
    fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), { target: { value: 'Campinas' } });
    expect(regrasDoCampo('company')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(ultimasRegras().groups.flatMap((group) => group.rules)).toEqual([]);
    expect(limpezasExtras).toHaveBeenCalledTimes(1);
  });

  it('Estágio no funil e RFM (coluna fora do motor) ficam desabilitados com "sem dados ainda"', () => {
    render(<Harness />);

    const estagio = within(screen.getByRole('group', { name: 'Estágio no funil' }));
    const rfm = within(screen.getByRole('group', { name: 'RFM' }));

    expect((estagio.getByRole('button', { name: 'sem dados ainda' }) as HTMLButtonElement).disabled).toBe(true);
    expect((rfm.getByRole('button', { name: 'sem dados ainda' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('filtro sem dado na base aparece desabilitado com "sem dados ainda", em vez de sumir', () => {
    render(<Harness options={{ tags: [], companies: [], sellers: [] }} />);

    // Os 7 controles continuam na tela...
    expect(screen.getByRole('group', { name: 'Tags' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Empresa' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Vendedor' })).toBeTruthy();

    // ...e os que dependem de dado da base ficam desabilitados, não somem.
    const desabilitados = screen.getAllByRole('button', { name: 'sem dados ainda' }) as HTMLButtonElement[];
    expect(desabilitados).toHaveLength(5);
    expect(desabilitados.every((botao) => botao.disabled)).toBe(true);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('"Limpar filtros" fica desabilitado sem filtro ativo', () => {
    render(<Harness />);
    expect((screen.getByRole('button', { name: 'Limpar filtros' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('X126 · regras que os 7 controles não mostram (recusa de 09/10)', () => {
  it('rascunho com regra date/number, outro operador e 2º grupo: tudo aparece em "Outras regras" e sai uma a uma', () => {
    const inicial: SegmentRules = {
      groups: [
        {
          id: 'g1', match: 'and', rules: [
            regra('tags', 'contains', 'VIP'),
            regra('updated_at', 'in_last_days', '30'),
            regra('lead_score', 'gt', '50'),
            regra('company', 'contains', 'acme'),
          ],
        },
        { id: 'g2', match: 'or', rules: [regra('state', 'eq', 'RJ'), regra('city', 'eq', 'Niterói')] },
      ],
    };
    render(<Harness inicial={inicial} />);

    // A regra do controle continua no controle...
    expect((screen.getByRole('checkbox', { name: 'VIP' }) as HTMLButtonElement).getAttribute('data-state')).toBe('checked');

    // ...e as que ele não mostra ficam à vista, com o grupo e o E/OU de cada um.
    const outras = within(screen.getByRole('group', { name: 'Outras regras' }));
    expect(outras.getByText('Grupo 1 (o dos filtros acima) · todas as regras (E)')).toBeTruthy();
    expect(outras.getByText('Grupo 2 · qualquer regra (OU)')).toBeTruthy();
    expect(outras.getByText('Última interação · nos últimos (dias) · 30')).toBeTruthy();
    expect(outras.getByText('Lead score · maior que · 50')).toBeTruthy();
    expect(outras.getByText('Empresa · contém · acme')).toBeTruthy();
    expect(outras.getByText('UF · é igual a · RJ')).toBeTruthy();
    expect(outras.getByText('Cidade · é igual a · Niterói')).toBeTruthy();
    expect(outras.queryByText(/Tags · contém · VIP/)).toBeNull();

    // Remover uma tira só ela; as outras seguem como estavam.
    fireEvent.click(outras.getByRole('button', { name: 'Remover regra Última interação · nos últimos (dias) · 30' }));
    expect(textoPorGrupo()).toEqual([
      ['tags contains VIP', 'lead_score gt 50', 'company contains acme'],
      ['state eq RJ', 'city eq Niterói'],
    ]);

    // Esvaziar o 2º grupo tira o grupo junto.
    fireEvent.click(screen.getByRole('button', { name: 'Remover regra UF · é igual a · RJ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover regra Cidade · é igual a · Niterói' }));
    expect(textoPorGrupo()).toEqual([['tags contains VIP', 'lead_score gt 50', 'company contains acme']]);
  });

  it('1º grupo combinado por OU fica à vista mesmo quando todas as regras são dos controles', () => {
    render(<Harness inicial={{ groups: [{ id: 'g1', match: 'or', rules: [regra('state', 'eq', 'SP'), regra('city', 'eq', 'Campinas')] }] }} />);

    const outras = within(screen.getByRole('group', { name: 'Outras regras' }));
    expect(outras.getByText('Grupo 1 (o dos filtros acima) · qualquer regra (OU)')).toBeTruthy();
  });

  it('sem regra fora dos controles, "Outras regras" não aparece', () => {
    render(<Harness inicial={{ groups: [{ id: 'g1', match: 'and', rules: [regra('tags', 'contains', 'VIP')] }] }} />);
    expect(screen.queryByRole('group', { name: 'Outras regras' })).toBeNull();
  });

  it('UF e Cidade: o valor gravado sai normalizado ("sp" → "SP", sem espaço nas pontas)', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'UF' }), { target: { value: 'sp' } });
    expect(textoDaRegra('state')).toEqual(['state eq SP']);

    fireEvent.change(screen.getByRole('textbox', { name: 'UF' }), { target: { value: ' rj ' } });
    expect(textoDaRegra('state')).toEqual(['state eq RJ']);

    fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), { target: { value: '  Campinas  ' } });
    expect(textoDaRegra('city')).toEqual(['city eq Campinas']);

    // O espaço entre palavras não some enquanto a pessoa digita.
    fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), { target: { value: 'São ' } });
    expect((screen.getByRole('textbox', { name: 'Cidade' }) as HTMLInputElement).value).toBe('São ');
    expect(textoDaRegra('city')).toEqual(['city eq São']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), { target: { value: 'São Paulo' } });
    expect(textoDaRegra('city')).toEqual(['city eq São Paulo']);

    // Só espaço = sem filtro.
    fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), { target: { value: '   ' } });
    expect(textoDaRegra('city')).toEqual([]);
  });

  it('o controle lê e grava o MESMO grupo: valor do 2º grupo não aparece no controle e não é apagado por ele', () => {
    const inicial: SegmentRules = {
      groups: [
        { id: 'g1', match: 'and', rules: [] },
        { id: 'g2', match: 'and', rules: [regra('state', 'eq', 'RJ'), regra('tags', 'contains', 'Lead')] },
      ],
    };
    render(<Harness inicial={inicial} />);

    // O controle mostra só o que ele consegue trocar/limpar (1º grupo)...
    expect((screen.getByRole('textbox', { name: 'UF' }) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('checkbox', { name: 'Lead' }).getAttribute('data-state')).toBe('unchecked');
    // ...e o valor do 2º grupo fica em "Outras regras".
    const outras = within(screen.getByRole('group', { name: 'Outras regras' }));
    expect(outras.getByText('UF · é igual a · RJ')).toBeTruthy();
    expect(outras.getByText('Tags · contém · Lead')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'UF' }), { target: { value: 'SP' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lead' }));
    expect(textoPorGrupo()).toEqual([
      ['state eq SP', 'tags contains Lead'],
      ['state eq RJ', 'tags contains Lead'],
    ]);

    // Limpar o controle tira a regra dele, sem tocar no 2º grupo.
    fireEvent.change(screen.getByRole('textbox', { name: 'UF' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lead' }));
    expect(textoPorGrupo()).toEqual([[], ['state eq RJ', 'tags contains Lead']]);
  });

  it('trocar a Empresa no controle preserva a regra salva com outro operador ("contém")', () => {
    render(<Harness inicial={{ groups: [{ id: 'g1', match: 'and', rules: [regra('company', 'contains', 'acme')] }] }} />);

    escolher('Empresa', 'Acme Brindes');

    // A regra "contém" fica com o operador salvo (não vira "eq" calada) e segue à vista.
    expect(textoDaRegra('company')).toEqual(['company contains acme', 'company eq Acme Brindes']);
    expect(within(screen.getByRole('group', { name: 'Outras regras' })).getByText('Empresa · contém · acme')).toBeTruthy();

    // Voltar o controle para "Todos" tira só a regra dele.
    escolher('Empresa', 'Todos');
    expect(textoDaRegra('company')).toEqual(['company contains acme']);
  });

  it('valor gravado que não está nas opções da base continua visível no controle', () => {
    render(<Harness inicial={{ groups: [{ id: 'g1', match: 'and', rules: [regra('tags', 'contains', 'Antiga')] }] }} />);
    expect(screen.getByRole('checkbox', { name: 'Antiga' }).getAttribute('data-state')).toBe('checked');
  });
});
