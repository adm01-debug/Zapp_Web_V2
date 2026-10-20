import { useEffect } from 'react';
import { Plus, MoreVertical, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTasksUi, type TasksDensity } from './tasksUi';

/**
 * Etapas 014 e 015 do plano (linhas 252 e 253; imagem 05, linha 133): as duas
 * ações do cabeçalho do módulo — o botão primário "+ Nova tarefa" e o menu ⋮
 * ("Atalhos de teclado" e "Densidade da lista").
 *
 * Mora num componente FILHO de propósito: quem monta o `<TasksUiProvider>` é o
 * `TasksModule`, então só a partir daqui existe `useTasksUi()`. É por isso que
 * o botão e o atalho emitem a abertura pelo contexto em vez de mexerem em
 * `useState` no pai.
 *
 * O menu não exporta, não baixa, não copia tudo e não imprime: as duas opções
 * são de tela (regra permanente de 07–08/10/2026).
 */
export function TasksHeaderMenu() {
  const { modalOpen, openModal, density, setDensity } = useTasksUi();

  // Etapa 014 — a tecla `N` JÁ é registrada no registry global
  // (`defaultShortcuts.ts`, escopo `tasks`, id `tasks-focus-quickadd`) e chega
  // aqui pelo mesmo evento `tasks-shortcut` dos outros 6 atalhos. Antes desta
  // etapa o comando levava o foco ao QuickAdd; agora ele abre o modal de
  // criação (imagem 04, bloco H). O QuickAdd continua na tela com o próprio
  // campo — a tecla é que passou a apontar para a criação completa.
  useEffect(() => {
    const aoAtalhar = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === 'tasks-focus-quickadd') openModal();
    };
    document.addEventListener('tasks-shortcut', aoAtalhar);
    return () => document.removeEventListener('tasks-shortcut', aoAtalhar);
  }, [openModal]);

  return (
    <>
      <Button
        type="button"
        onClick={openModal}
        aria-haspopup="dialog"
        aria-expanded={modalOpen}
        data-testid="tasks-nova-tarefa"
      >
        <Plus aria-hidden="true" />
        Nova tarefa
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Mais opções do módulo"
          >
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* O painel de atalhos já existe no app e escuta este evento
              (`useGlobalKeyboardShortcuts`, ação `show-shortcuts-help`). */}
          <DropdownMenuItem
            data-testid="menu-atalhos-de-teclado"
            onSelect={() => document.dispatchEvent(new CustomEvent('show-shortcuts-help'))}
          >
            <Keyboard aria-hidden="true" />
            Atalhos de teclado
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Densidade ÚNICA: a do contexto. O menu não guarda cópia própria —
              só escreve pelas mesmas `density`/`setDensity` do `TasksUi`. */}
          <DropdownMenuLabel>Densidade da lista</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={density}
            onValueChange={(valor) => setDensity(valor as TasksDensity)}
          >
            <DropdownMenuRadioItem value="comfortable">Confortável</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="compact">Compacta</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
