/**
 * Nomes acessíveis e alcance no toque dos botões de ação do cartão de fila.
 *
 * Antes da correção:
 *  - o botão "Adicionar atendente" (só o ícone +) e o botão de remover atendente
 *    (só o ícone UserMinus) não tinham nome acessível — o leitor de tela
 *    anunciava apenas "botão";
 *  - o botão de remover atendente ficava `opacity-0 group-hover:opacity-100`:
 *    sem ponteiro com hover (celular/tablet) `group-hover` nunca dispara, então
 *    ele ficava invisível e (com `pointer-events-none`) morto ao toque.
 *
 * A prova renderiza o QueueCard REAL dentro de um router, com um fixture de
 * fila/membro; só o fixture é de teste, o componente é o de produção.
 *
 * Além do nome, este teste trava a GEOMETRIA da área de toque ampliada
 * (N-180.6): 44 px de altura e no máximo o passo entre botões vizinhos de
 * largura — esticar mais roubaria o toque do avatar seguinte (o mesmo cuidado
 * de `src/components/inbox/tabs/fileActionButton.ts`).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueueCard } from '../QueueCard';
import { QueueAlertsDisplay } from '../QueueAlertsDisplay';
import type { QueueWithMembers } from '@/hooks/business/useQueues';
import type { QueueAlert } from '@/hooks/business/useQueueGoals';

// O fixture replica as colunas usadas pelo cartão (mesma forma de
// QueuesView.test.tsx); o cast é só para satisfazer o tipo de linha do banco.
const queue = {
  id: 'q1',
  name: 'Suporte',
  color: '#3B82F6',
  is_active: true,
  max_wait_time_minutes: 30,
  priority: 1,
  description: null,
  created_at: '',
  updated_at: '',
  waiting_count: 3,
  members: [
    {
      id: 'm1',
      queue_id: 'q1',
      profile_id: 'p1',
      is_active: true,
      created_at: '',
      profile: { id: 'p1', name: 'Ana Souza', avatar_url: null, is_active: true },
    },
    {
      id: 'm2',
      queue_id: 'q1',
      profile_id: 'p2',
      is_active: true,
      created_at: '',
      profile: { id: 'p2', name: 'Bruno Lima', avatar_url: null, is_active: true },
    },
  ],
} as unknown as QueueWithMembers;

function renderCard() {
  return render(
    <MemoryRouter>
      <QueueCard
        queue={queue}
        alertCount={0}
        onAddMember={vi.fn()}
        onRemoveMember={vi.fn()}
        onSetGoals={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('QueueCard — botões de ação com nome acessível e alvo de toque', () => {
  it('o botão do "+" anuncia "Adicionar atendente à fila <nome>"', () => {
    renderCard();

    expect(
      screen.getByRole('button', { name: 'Adicionar atendente à fila Suporte' }),
    ).toBeInTheDocument();
  });

  it('o botão de remover anuncia o atendente e fica visível no toque e por foco', () => {
    renderCard();

    const remover = screen.getByRole('button', { name: 'Remover Ana Souza da fila' });
    const classes = remover.className.split(/\s+/);

    // Continua escondido no desktop (mouse) — revelado no hover do grupo.
    expect(classes).toContain('opacity-0');
    expect(classes).toContain('group-hover:opacity-100');
    // ...e passa a ser alcançável por toque (sem hover) e por teclado (foco).
    expect(classes).toContain('[@media(hover:none)]:opacity-100');
    expect(classes).toContain('focus-visible:opacity-100');
    // Sem `pointer-events-auto` o botão invisível/desabilitado ao ponteiro não
    // receberia o toque; as variantes reabrem o ponteiro nos mesmos estados.
    expect(classes).toContain('[@media(hover:none)]:pointer-events-auto');
    expect(classes).toContain('group-hover:pointer-events-auto');
    expect(classes).toContain('focus-visible:pointer-events-auto');

    // Foco visível no teclado.
    expect(classes).toContain('focus-visible:ring-2');
  });

  it('a área de toque ampliada tem 44 px de altura e não invade o avatar vizinho', () => {
    renderCard();

    const remover = screen.getByRole('button', { name: 'Remover Bruno Lima da fila' });
    const classes = remover.className.split(/\s+/);

    // Todas as utilities de `::after` entram só sob ponteiro de toque
    // (`@media (pointer: coarse)`), então no desktop nada muda no visual.
    const after = classes.filter((c) => c.includes('after:'));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((c) => c.startsWith('[@media(pointer:coarse)]:'))).toBe(true);

    // Altura 44 px (after:h-11) — o alvo confortável de dedo.
    expect(classes).toContain('[@media(pointer:coarse)]:after:h-11');
    // Largura 24 px (after:w-6): o botão do avatar vizinho fica a 24 px
    // (avatar w-8 = 32 px sobreposto em 8 px pelo `-space-x-2`); qualquer
    // largura maior cobriria o botão do vizinho e removeria o atendente errado.
    expect(classes).toContain('[@media(pointer:coarse)]:after:w-6');

    const LARGURA_DO_ALVO_PX = 24; // after:w-6
    const PASSO_ENTRE_BOTOES_PX = 32 - 8; // w-8 - sobreposição do -space-x-2
    expect(LARGURA_DO_ALVO_PX).toBeLessThanOrEqual(PASSO_ENTRE_BOTOES_PX);
  });
});

describe('QueueAlertsDisplay — nome do botão de dispensar (já integrado)', () => {
  it('o botão X anuncia "Dispensar alerta <tipo>"', () => {
    const alerta = {
      type: 'waiting_contacts',
      queueId: 'q1',
      queueName: 'Suporte',
      queueColor: '#3B82F6',
      message: '3 contatos aguardando atendimento',
      severity: 'warning',
      currentValue: 3,
      threshold: 10,
    } as QueueAlert;

    render(<QueueAlertsDisplay alerts={[alerta]} onDismiss={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Dispensar alerta contatos aguardando' }),
    ).toBeInTheDocument();
  });
});
