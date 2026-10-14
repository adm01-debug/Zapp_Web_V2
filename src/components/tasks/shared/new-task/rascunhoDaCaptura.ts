import type { Priority } from '@/hooks/tasks/workItem.types';

/**
 * Etapa 171 (plano, linha 451) — o que o `QuickAdd` já tinha digitado/ajustado
 * quando o `⋯` ("Mais opções…") manda abrir o modal "Nova tarefa".
 *
 * O modal é montado pelo `TasksModule` com `<NewTaskDialog />` sem props (o botão
 * do cabeçalho e a tecla `N` abrem o mesmo modal vazio) e o
 * `TasksUiContext.openModal()` não carrega argumento — então o rascunho passa por
 * aqui: o QuickAdd deposita, o modal lê ao nascer e a caixa é esvaziada quando o
 * modal FECHA.
 *
 * A leitura NÃO consome: sob `StrictMode` (ligado em `main.tsx`) o render roda
 * duas vezes e um inicializador de `useState` que apagasse a caixa entregaria
 * `null` na segunda passada. Limpar no fechamento mantém a segunda abertura
 * (botão do cabeçalho, tecla `N`) vazia, como sempre foi.
 *
 * É um canal de mão única, de vida curta, sem estado de tela (nada re-renderiza
 * por causa dele) e sem guardar dado de cliente além do que o usuário acabou de
 * digitar na própria captura.
 */
export interface RascunhoDaCaptura {
  title: string;
  priority: Priority;
  dueDate: string | null;
  remindAt: string | null;
  contactId: string | null;
}

let rascunho: RascunhoDaCaptura | null = null;

/** Deixa o rascunho para a próxima montagem do modal. */
export function guardarRascunhoDaCaptura(novo: RascunhoDaCaptura): void {
  rascunho = novo;
}

/** O rascunho pendente (ou `null`). Não apaga nada — quem apaga é o fechamento. */
export function lerRascunhoDaCaptura(): RascunhoDaCaptura | null {
  return rascunho;
}

/** Esvazia a caixa: o modal fecha (por qualquer caminho) ou o teste começa limpo. */
export function esquecerRascunhoDaCaptura(): void {
  rascunho = null;
}
