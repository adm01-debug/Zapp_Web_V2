/**
 * paridade-06 · envio — REGISTRO DAS PROVAS PENDENTES (2ª passada do doc 06).
 *
 * Cada `it.todo` aponta o cartão dono da correção. As provas de comportamento só
 * podem existir depois que o cartão correspondente for integrado: hoje o
 * comportamento defeituoso é o vigente e um teste verde aqui provaria o DEFEITO,
 * não a correção (ver `area-testes-do-produto`). Por isso ficam como pendência
 * explícita, não como teste que finge.
 *
 * Nada duplica os testes dos cartões: quando cada PK-xx integrar, ele escreve o
 * próprio teste no arquivo do código que tocar (PK-21/22/24/25 são de hooks e
 * envio; PK-23 é de componente) e o `it.todo` correspondente sai daqui.
 *
 * Cabimento da pendência (conferido no código da cópia viva em 13/10/2026):
 *  - PK-21: o compositor trava até enqueue + despacho no Edge + dois refetches;
 *    não há fila serial por contato.
 *  - PK-22: `useNewConversation` escolhe a 1ª conexão `connected` e passa a
 *    conexão explícita (que vence no RPC), mesmo para contato que já tem a dele.
 *  - PK-24: `ChatService.enrichLinkPreview` não tem chamador — envio nunca grava
 *    `link_preview`.
 *  - PK-25: o áudio sobe arquivo e cria `client_message_id` novos a cada
 *    retentativa (sem `pendingUploadsRef`, ao contrário do FileUploader).
 */
import { describe, it } from 'vitest';

describe('paridade-06 · envio (provas pendentes)', () => {
  it.todo(
    'PK-21: Enter repetido enfileira em série por contato, preserva a ordem e libera o compositor logo após o enqueue local',
  );
  it.todo('PK-21: falha de enqueue preserva o rascunho e não toca a animação/som de enviado');
  it.todo('PK-21: o caminho de envio não refaz o fetch da lista de conversas');

  it.todo('PK-22: contato existente com conexão A e outra B conectada sai por A');
  it.todo('PK-22: conexão do contato desconectada → aviso, sem troca silenciosa de número');
  it.todo('PK-22: contato novo usa a conexão escolhida e o diálogo mostra de qual número sai');

  it.todo('PK-24: URL no texto gera prévia gravada depois do aceite do envio');
  it.todo('PK-24: falha do enriquecimento não impede o envio; texto sem URL não chama o enriquecimento');

  it.todo('PK-25: retentativa de áudio reusa o upload e o client_message_id (um só upload, mesmo id)');
  it.todo('PK-25: cancelar a gravação limpa o upload pendente');
});
