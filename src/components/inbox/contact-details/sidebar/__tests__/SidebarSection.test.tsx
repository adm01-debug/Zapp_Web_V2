import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { Briefcase } from 'lucide-react';
import { SidebarSection } from '../SidebarSection';

function renderSection(open = true) {
  return render(
    <Accordion type="multiple" defaultValue={open ? ['professional'] : []}>
      <SidebarSection index={0} value="professional" tone="blue" icon={<Briefcase />} title="Dados Profissionais" subtitle="Informações da sua vida profissional">
        <div>conteúdo da seção</div>
      </SidebarSection>
    </Accordion>,
  );
}

describe('SidebarSection (etapa 45)', () => {
  it('renderiza tile 28px com tom, título 14px e subtítulo muted', () => {
    const { container } = renderSection();
    const tile = container.querySelector('.w-7.h-7');
    expect(tile).toHaveClass('bg-kpi-blue', 'text-kpi-blue-fg');
    expect(screen.getByText('Dados Profissionais')).toBeInTheDocument();
    expect(screen.getByText('Informações da sua vida profissional')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-section-professional')).toBeInTheDocument();
  });

  it('aberto mostra o conteúdo; fechado esconde', () => {
    renderSection();
    expect(screen.getByText('conteúdo da seção')).toBeInTheDocument();
    renderSection(false);
    expect(screen.getAllByText('conteúdo da seção')).toHaveLength(1); // 2º painel, fechado
  });

  it('colapsa/expande pelo trigger Radix', () => {
    renderSection();
    const trigger = screen.getByRole('button', { name: /Dados Profissionais/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('sem subtitle não renderiza a linha do subtítulo', () => {
    render(
      <Accordion type="multiple" defaultValue={['professional']}>
        <SidebarSection index={0} value="professional" tone="blue" icon={<Briefcase />} title="Dados Profissionais">
          <div>conteúdo da seção</div>
        </SidebarSection>
      </Accordion>,
    );
    expect(screen.getByText('Dados Profissionais')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-section-subtitle')).not.toBeInTheDocument();
    // Nenhuma linha (nem vazia) abaixo do título.
    expect(screen.getByText('Dados Profissionais').nextElementSibling).toBeNull();
  });

  it('nenhuma cor literal nas classes', () => {
    const { container } = renderSection();
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}|rgb\(/);
  });
});
