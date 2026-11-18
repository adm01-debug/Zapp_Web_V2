import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CrmBadges } from '../CrmBadges';

// O componente usa Tooltip, que exige o provider — mesmo arranjo de
// ChatPanelHeader.test.tsx.
const montar = (props: React.ComponentProps<typeof CrmBadges>) =>
  render(
    <TooltipProvider>
      <CrmBadges {...props} />
    </TooltipProvider>,
  );

const empresa = { nome_fantasia: 'Aquarella Print', nome_crm: 'AQUARELLA PRINT LTDA' };
const cliente = {
  vendedor_nome: 'Maria Aparecida de Souza',
  total_pedidos: 12,
  ticket_medio: 1850.5,
  valor_total_compras: 22206,
  cliente_ativado: true,
};
const rfm = { segment_code: 'Champions' };

describe('CrmBadges', () => {
  it('mostra empresa, vendedor, segmento e situacao do cliente', () => {
    montar({ crmCompany: empresa, crmCustomer: cliente, crmRfm: rfm });

    // Prefere o nome fantasia ao nome da razao social.
    expect(screen.getByText('Aquarella Print')).toBeTruthy();
    // Vendedor so com os dois primeiros nomes: o cabecalho da conversa e estreito.
    expect(screen.getByText('Maria Aparecida')).toBeTruthy();
    expect(screen.getByText('Champions')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('sem dados de CRM nao renderiza selo nenhum', () => {
    const { container } = montar({ crmCompany: null, crmCustomer: null, crmRfm: null });
    expect(container.textContent).toBe('');
  });

  it('cliente desativado aparece como Inativo', () => {
    montar({
      crmCompany: null,
      crmCustomer: { ...cliente, cliente_ativado: false },
      crmRfm: null,
    });
    expect(screen.getByText('Inativo')).toBeTruthy();
    expect(screen.queryByText('Ativo')).toBeNull();
  });

  it('cai no nome do CRM quando nao existe nome fantasia', () => {
    montar({
      crmCompany: { nome_fantasia: null, nome_crm: 'AQUARELLA PRINT LTDA' },
      crmCustomer: null,
      crmRfm: null,
    });
    expect(screen.getByText('AQUARELLA PRINT LTDA')).toBeTruthy();
  });

  it('segmento desconhecido ainda aparece, sem quebrar', () => {
    montar({ crmCompany: null, crmCustomer: cliente, crmRfm: { segment_code: 'Segmento Novo' } });
    expect(screen.getByText('Segmento Novo')).toBeTruthy();
  });

  it('nao introduz violacao de acessibilidade', async () => {
    const { container } = montar({ crmCompany: empresa, crmCustomer: cliente, crmRfm: rfm });
    const resultado = await axe(container);
    expect(resultado.violations).toEqual([]);
  });
});
