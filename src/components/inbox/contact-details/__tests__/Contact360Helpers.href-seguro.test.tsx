/**
 * SEC-FRONTEND-02 — auditoria de front-end de 07/10/2026 (achado P2, urgente).
 *
 * Cenário do relatório: `website`/`url` de rede social da empresa é gravado no CRM
 * externo ("Gestão de Clientes") como `javascript:…`. O painel 360 montava o `href`
 * com esse valor cru — o esquema ia para o DOM sem nenhum guard do app, e o clique
 * ficava por conta do que o renderizador fizesse com ele. Aqui os componentes REAIS
 * são renderizados com o dado hostil (antes da correção o elemento existia com o
 * esquema cru no `href`; depois, não existe link) e com o dado legítimo (prova
 * positiva de que o uso normal continua funcionando).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompanyCard, SocialLinks } from '../Contact360Helpers';
import type { Contact360Company, Contact360Social } from '@/types/contact360';

const EXPLOIT = 'javascript:alert(document.cookie)';

function empresa(patch: Partial<Contact360Company>): Contact360Company {
  return {
    id: 'empresa-1',
    nome_crm: 'Empresa Teste',
    razao_social: null,
    nome_fantasia: 'Empresa Teste',
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
    ...patch,
  };
}

function redeSocial(patch: Partial<Contact360Social>): Contact360Social {
  return { plataforma: 'instagram', handle: '@empresa', url: null, ...patch };
}

describe('CompanyCard — website/logo vindos do CRM externo (SEC-FRONTEND-02)', () => {
  it('não renderiza link quando o website gravado é javascript:', () => {
    const { container } = render(<CompanyCard company={empresa({ website: EXPLOIT })} />);

    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('website http(s) legítimo continua virando link clicável', () => {
    render(<CompanyCard company={empresa({ website: 'https://empresa.example.com/catalogo' })} />);

    const link = screen.getByRole('link', { name: /empresa\.example\.com\/catalogo/i });
    expect(link).toHaveAttribute('href', 'https://empresa.example.com/catalogo');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('não carrega imagem quando logo_url tem esquema inseguro', () => {
    const { container } = render(<CompanyCard company={empresa({ logo_url: EXPLOIT })} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain(EXPLOIT);
  });

  it('logo http(s) legítima continua carregando', () => {
    const { container } = render(<CompanyCard company={empresa({ logo_url: 'https://cdn.example.com/logo.png' })} />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });
});

describe('SocialLinks — url vinda do CRM externo (SEC-FRONTEND-02)', () => {
  it('rede social com url javascript: não vira link, mas continua identificada', () => {
    render(<SocialLinks social={[redeSocial({ url: EXPLOIT })]} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('@empresa')).toBeInTheDocument();
  });

  it('rede social com url https legítima continua virando link', () => {
    render(<SocialLinks social={[redeSocial({ url: 'https://instagram.com/empresa' })]} />);

    expect(screen.getByRole('link', { name: /@empresa/ })).toHaveAttribute('href', 'https://instagram.com/empresa');
  });
});
