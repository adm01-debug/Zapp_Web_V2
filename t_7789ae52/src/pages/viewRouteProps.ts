import type { TaskMode } from '@/components/tasks/shared/ModeSwitcher';

/** B7 (etapa 47): contrato de entrada das rotas do modulo de Tarefas.
 *
 *  O MODULO e o mesmo para os dois itens do menu; o que muda e a rota —
 *  `pipeline` ("Quadro") abre SEMPRE no Quadro, enquanto `tasks` ("Tarefas") nao
 *  passa props e por isso retoma o ultimo modo salvo (ou a Lista).
 *
 *  Fica fora do `ViewRouter` para o arquivo continuar exportando so componentes
 *  (regra `react-refresh/only-export-components`) e para o teste poder pinar o
 *  contrato sem carregar o roteador inteiro.
 */
export const TASKS_ROUTE_PROPS: Record<string, { defaultMode?: TaskMode; forceMode?: boolean }> = {
  pipeline: { defaultMode: 'board', forceMode: true },
};
