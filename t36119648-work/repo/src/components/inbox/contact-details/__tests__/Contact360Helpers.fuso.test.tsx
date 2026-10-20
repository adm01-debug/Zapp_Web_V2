/**
 * SL-004 (R3-04) — data de nascimento e data de fundação apareciam um dia antes.
 *
 * Os dois campos vêm de coluna `date` do CRM (`'1985-03-14'`), e o JS lê essa string como
 * meia-noite **UTC**: `format(new Date('1985-03-14'), 'dd/MM/yyyy')` devolve `13/03/1985`
 * em UTC-3. Fuso do aparelho forçado a São Paulo de propósito: é o cenário do defeito.
 */
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CompanyCard, ContactDetailCard } from '@/components/inbox/contact-details/Contact360Helpers';
import type { Contact360Company, Contact360Contact } from '@/types/contact360';

afterEach(cleanup);

const empresa: Contact360Company = {
  id: 'emp-1',
  nome_crm: null,
  razao_social: 'Aurora Brindes LTDA',
  nome_fantasia: 'Aurora Brindes',
  cnpj: null,
  inscricao_estadual: null,
  website: null,
  ramo_atividade: null,
  status: null,
  logo_url: null,
  cores_marca: null,
  nicho_cliente: null,
  porte_rf: null,
  natureza_juridica_desc: null,
  capital_social: null,
  data_fundacao: null,
  bitrix_company_id: null,
};

const contato: Contact360Contact = {
  id: 'ct-1',
  first_name: 'Maria',
  last_name: 'Silva',
  full_name: 'Maria Silva',
  nome_tratamento: null,
  apelido: null,
  cargo: null,
  departamento: null,
  cpf: null,
  data_nascimento: null,
  sexo: null,
  relationship_stage: null,
  relationship_score: 0,
  sentiment: null,
  tags: [],
  behavior: null,
  notes: null,
  source: null,
  assinatura_contato: null,
  bitrix_contact_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('Contact360 — data sem hora mostrada no dia gravado (SL-004)', () => {
  it('fundação gravada como yyyy-MM-dd aparece no dia gravado, não no anterior', () => {
    render(<CompanyCard company={{ ...empresa, data_fundacao: '1985-03-14' }} />);

    expect(screen.getByText('14/03/1985')).toBeInTheDocument();
    expect(screen.queryByText('13/03/1985')).toBeNull();
    // O resto do cartão continua na tela.
    expect(screen.getByText('Aurora Brindes')).toBeInTheDocument();
  });

  it('nascimento gravado como yyyy-MM-dd aparece no dia gravado, não no anterior', () => {
    render(<ContactDetailCard contact={{ ...contato, data_nascimento: '1985-03-14' }} />);

    expect(screen.getByText('Nascimento')).toBeInTheDocument();
    expect(screen.getByText('14/03/1985')).toBeInTheDocument();
    expect(screen.queryByText('13/03/1985')).toBeNull();
  });

  it('data gravada como meia-noite UTC (formato do banco) mantém o dia; instante com hora usa o dia local', () => {
    const { unmount } = render(
      <CompanyCard company={{ ...empresa, data_fundacao: '1942-07-20T00:00:00.000Z' }} />,
    );
    expect(screen.getByText('20/07/1942')).toBeInTheDocument();
    expect(screen.queryByText('19/07/1942')).toBeNull();
    unmount();

    render(<ContactDetailCard contact={{ ...contato, data_nascimento: '1942-07-20T00:00:00.000Z' }} />);
    expect(screen.getByText('20/07/1942')).toBeInTheDocument();
    unmount();

    // Instante com hora não é data-sem-hora: vale o dia do relógio do usuário
    // (08/10 23:00 em UTC-3 é 09/10 02:00 UTC).
    render(<ContactDetailCard contact={{ ...contato, data_nascimento: '2026-10-09T02:00:00.000Z' }} />);
    expect(screen.getByText('08/10/2026')).toBeInTheDocument();
  });
});
