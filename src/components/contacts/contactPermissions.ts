import type { Contact } from './types';

/**
 * O item "Excluir" só deve ser oferecido quando o usuário pode excluir aquele
 * contato. A resposta vem do banco (`can_delete_contacts`, que usa o mesmo
 * predicado de `delete_contact`): admin/supervisor, responsável pelo contato ou
 * membro ativo da fila dele.
 *
 * Por que não replicar a regra no front: a condição depende de `assigned_to` e
 * `queue_id` do contato, que a lista não carrega, e de dados do usuário
 * (perfil, filas ativas, concessões de visibilidade). Calcular no cliente seria
 * uma segunda cópia da regra — foi assim que "Editar" e "Excluir" divergiram
 * (o item aparecia para todos e o erro só surgia no clique, PR #1187).
 *
 * `undefined` (RPC ainda não respondeu ou falhou) mantém o comportamento
 * anterior à correção: item visível. Só esconde quando o servidor diz que não.
 */
export function canDeleteContact(contact: Pick<Contact, 'can_delete'>): boolean {
  return contact.can_delete !== false;
}
