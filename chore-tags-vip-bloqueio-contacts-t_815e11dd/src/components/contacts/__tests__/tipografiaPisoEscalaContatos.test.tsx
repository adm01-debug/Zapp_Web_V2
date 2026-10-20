/**
 * `text-[9px]` → `text-3xs` (piso da escala) — tranca da conversão (Contatos).
 *
 * O cartão trocou as 9 ocorrências de `text-[9px]` (arbitrário, ABAIXO do piso
 * da própria escala do sistema) por `text-3xs`, o menor token nomeado do
 * `tailwind.config.ts` (10px / line-height 13px). O badge de score do mesmo
 * `CRMContactCard` já usava `text-3xs`, então a troca também alinha os badges
 * vizinhos.
 *
 * Duas provas:
 *  A) COMPORTAMENTO — renderiza os componentes REAIS (`CRMContactCard` e
 *     `ContactSearchWithSuggestions`) com dados que fazem aparecer os badges e
 *     LÊ a classe que o React realmente aplicou no elemento. O tamanho
 *     resolvido é cruzado com a escala de `tailwind.config.ts` (a MESMA fonte
 *     que o guard `scripts/qa/medir-tipografia.cjs` lê) — não é o texto do
 *     arquivo, é o className que saiu do componente em execução.
 *  B) TRINCA DE FONTE — `ContactDetailPanel` e `ContactKanbanView` não são
 *     renderizáveis de forma barata aqui (dependem de Supabase/QueryClient),
 *     então travamos o literal proibido na fonte desses dois, o mesmo padrão de
 *     `src/components/__tests__`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CRMContactCard } from '@/components/contacts/CRMContactCard';
import { ContactSearchWithSuggestions } from '@/components/contacts/ContactSearchWithSuggestions';
import type { SearchContactResult } from '@/types/contactSearch';

afterEach(() => cleanup());

const ler = (nome: string) => fs.readFileSync(path.resolve(__dirname, '..', nome), 'utf8');

/** Escala de fontSize do tailwind.config.ts (mesmo recorte do guard de tipografia). */
function escalaTipografia(): Record<string, { px: number; lh: number }> {
  const cfg = fs.readFileSync(path.resolve(__dirname, '../../../../tailwind.config.ts'), 'utf8');
  const bloco = cfg.match(/fontSize:\s*\{([\s\S]*?)\n {6}\}/);
  if (!bloco) throw new Error('bloco fontSize não encontrado em tailwind.config.ts');
  const re =
    /["']?([a-z0-9-]+)["']?:\s*\[\s*["']([^"']+)["']\s*,\s*\{\s*lineHeight:\s*["']([^"']+)["']/g;
  const px = (v: string) =>
    v.endsWith('rem') ? parseFloat(v) * 16 : v.endsWith('px') ? parseFloat(v) : NaN;
  const escala: Record<string, { px: number; lh: number }> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloco[1]))) escala[m[1]] = { px: px(m[2]), lh: px(m[3]) };
  return escala;
}

/** Menor px resolvido por um className, entre os tokens NOMEADOS da escala. */
function menorTextoPx(className: string, escala: Record<string, { px: number }>): number | null {
  const classes = className.split(/\s+/);
  let menor: number | null = null;
  for (const c of classes) {
    if (!c.startsWith('text-')) continue;
    const token = c.slice('text-'.length);
    const def = escala[token];
    if (def && (menor === null || def.px < menor)) menor = def.px;
  }
  return menor;
}

describe('tipografia do card de Contatos — piso da escala (text-3xs)', () => {
  const escala = escalaTipografia();

  it('o token text-3xs é o piso nomeado e cabe no h-4 (16px) do badge', () => {
    // text-3xs = 10px, o menor token nomeado da escala do sistema.
    expect(escala['3xs'].px).toBe(10);
    // line-height do 3xs (13px) cabe dentro da altura do badge h-4 (1rem = 16px):
    // o pixel a mais sobre o antigo 9px não corta nem estoura o badge.
    expect(escala['3xs'].lh).toBe(13);
    expect(escala['3xs'].lh).toBeLessThanOrEqual(16);
  });

  it('o badge de estado do CRMContactCard REAL resolve em 10px (text-3xs), não em 9px', () => {
    const contato = {
      contact_id: 'c1',
      full_name: 'Fulano de Teste',
      nome_tratamento: null,
      apelido: null,
      cargo: null,
      departamento: null,
      relationship_score: 80,
      relationship_stage: null,
      sentiment: null,
      tags: ['alfa', 'beta'],
      company_id: null,
      company_name: 'Empresa Teste',
      company_cnpj: null,
      company_logo: null,
      company_ramo: null,
      company_status: null,
      company_estado: 'SP',
      company_cidade: null,
      vendedor_nome: null,
      cliente_ativado: true,
      ja_comprou: null,
      total_pedidos: null,
      valor_total_compras: null,
      ticket_medio: null,
      rfm_segment: 'Champions',
      rfm_score: null,
      phone_primary: null,
      email_primary: null,
      is_whatsapp: true,
    } as SearchContactResult;

    const { getByText, container } = render(<CRMContactCard contact={contato} />);

    // O elemento que o React renderizou traz a classe real; o tamanho sai dela.
    const badgeEstado = getByText('Ativo');
    expect(menorTextoPx(badgeEstado.className, escala)).toBe(10);
    expect(menorTextoPx(getByText('Champions').className, escala)).toBe(10);

    // Nenhum elemento do cartão em execução usa tamanho arbitrário (text-[Npx]).
    expect(container.innerHTML).not.toMatch(/text-\[[0-9.]+(px|rem|em)\]/);
  });

  it('o badge de sugestão da busca REAL resolve em 10px (text-3xs)', () => {
    const { getByText, getByPlaceholderText } = render(
      <ContactSearchWithSuggestions
        value="emp"
        onChange={() => {}}
        uniqueCompanies={['Empresa Teste']}
        uniqueTags={['emp-tag']}
        totalCount={3}
      />
    );
    // O foco abre o dropdown de sugestões com os badges Empresa/Tag.
    fireEvent.focus(getByPlaceholderText(/Buscar por nome/));

    expect(menorTextoPx(getByText('Empresa').className, escala)).toBe(10);
    expect(menorTextoPx(getByText('Tag').className, escala)).toBe(10);
  });

  it.each(['ContactDetailPanel.tsx', 'ContactKanbanView.tsx'])('%s não tem mais text-[9px]', (nome) => {
    expect(ler(nome)).not.toMatch(/text-\[9px\]/);
  });
});
