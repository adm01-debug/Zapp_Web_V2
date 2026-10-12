/**
 * Ponte entre o painel "Base de Conhecimento" (detalhes do contato) e o
 * compositor do chat.
 *
 * O rascunho tem UM dono — o `ChatPanel`, que segura o `inputValue` — e o painel
 * fica em `contact-details/`, montado como irmão dele em `RealtimeInboxView` (sem
 * `ref` de um para o outro). Então o painel PEDE a inserção aqui e o ChatPanel
 * registra aqui quem escreve no input. Mesmo padrão do bus de favoritos/adiamentos
 * (`useConversationActions`) e da ponte `chatMessageNavigation`.
 *
 * Módulo-folha de propósito: não importa nada, então pode ser lido dos dois lados
 * sem arrastar a árvore de um recurso para dentro do outro.
 */
export type ComposerInsertHandler = (text: string) => void;

let handler: ComposerInsertHandler | null = null;

/** Registrado pelo ChatPanel (dono do rascunho) ao montar; `null` ao desmontar. */
export function registerComposerInsert(next: ComposerInsertHandler | null): void {
  handler = next;
}

/**
 * Insere o trecho no rascunho do compositor, sem enviar.
 *
 * Devolve `false` quando não há compositor montado (painel aberto fora do inbox,
 * por exemplo) — quem chamou decide o que dizer ao usuário em vez de falhar calado.
 */
export function requestComposerInsert(text: string): boolean {
  if (!handler || !text.trim()) return false;
  handler(text);
  return true;
}
