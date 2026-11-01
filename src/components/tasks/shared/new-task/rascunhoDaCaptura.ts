import type { Priority } from '@/hooks/tasks/workItem.types';
import type { ContactOption } from '../ContactCombobox';

/**
 * Etapa 171 — rascunho que o `QuickAdd` deixa para o modal "Nova tarefa"
 * (o `openModal()` do contexto não aceita argumento). A leitura NÃO consome: sob
 * `StrictMode` o render roda duas vezes e um inicializador que apagasse a caixa
 * entregaria `null` na segunda passada. Quem esvazia é o fechamento do modal.
 *
 * Também é o caminho da RECUPERAÇÃO: a criação otimista fecha o modal antes do
 * INSERT; se o banco recusar, o próprio modal devolve o que foi digitado aqui e
 * reabre (ver `NewTaskDialog.criar`).
 */
export interface RascunhoDaCaptura {
  title: string;
  priority: Priority;
  dueDate: string | null;
  remindAt: string | null;
  contactId: string | null;
  /** Dados do contato já escolhido (avatar/nome na prévia, sem ir ao banco). */
  contact?: ContactOption | null;
}

let rascunho: RascunhoDaCaptura | null = null;

/** Deixa o rascunho para a próxima montagem do modal. */
export function guardarRascunhoDaCaptura(novo: RascunhoDaCaptura): void {
  rascunho = novo;
}

/** O rascunho pendente (ou `null`). Não apaga nada. */
export function lerRascunhoDaCaptura(): RascunhoDaCaptura | null {
  return rascunho;
}

/** Esvazia a caixa (o modal fechou por qualquer caminho). */
export function esquecerRascunhoDaCaptura(): void {
  rascunho = null;
}
