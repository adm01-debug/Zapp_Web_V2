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

/**
 * Decide se o botão "Excluir" da barra de ações em massa fica habilitado, a partir
 * dos contatos que a lista carregada conhece.
 *
 * A seleção sobrevive à troca de página e de filtro, então um id selecionado pode
 * não estar na lista de agora: sem informação sobre ele, o botão **não** é
 * bloqueado (mesma regra do item avulso — `undefined` = segue disponível). O bug
 * que isto corrige: o cálculo era feito direto sobre a página visível, então
 * paginar deixava o botão desabilitado com a mensagem "nenhum dos contatos
 * selecionados pode ser excluído", mesmo havendo contatos que o usuário pode excluir.
 *
 * Basta UM selecionado conhecido com permissão para habilitar — o lote é parcial
 * por natureza: o banco exclui o que pode e devolve a contagem.
 */
export function canDeleteSelectedContacts(
  selectedIds: string[],
  contacts: Pick<Contact, 'id' | 'can_delete'>[],
): boolean | undefined {
  if (selectedIds.length === 0) return undefined;
  const conhecidos = contacts.filter(c => selectedIds.includes(c.id));
  if (conhecidos.length === 0) return undefined;
  return conhecidos.some(c => canDeleteContact(c));
}

/**
 * Decide se o botão "Mesclar" da barra de ações em massa deve ser oferecido.
 *
 * Diferente de excluir, mesclar não tem permissão por contato: a RPC
 * `merge_contacts_atomic` (migration
 * `20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql`) recusa com
 * `42501` qualquer usuário que não seja `is_admin_or_supervisor(auth.uid())` —
 * e o merge faz DELETE físico dos contatos secundários. É um predicado único e
 * global (`EXISTS (SELECT 1 FROM user_roles WHERE role IN ('admin','supervisor'))`).
 *
 * De onde vem o dado no front: `useCRMAdminAccess()` (`@/hooks/crm`), que chama
 * justamente a RPC `is_admin_or_supervisor` — o mesmo dado do banco, não uma
 * segunda cópia da regra. Ele devolve `boolean | null` (`null` = consulta em
 * andamento).
 *
 * `null`/`undefined` mantém o comportamento anterior à correção: botão
 * oferecido. Só esconde quando o servidor diz que não — mesma semântica de
 * `canDeleteContact`/`canDeleteSelectedContacts` (evita "piscar" o botão durante
 * o carregamento do perfil).
 */
export function canMergeContacts(adminAccess: boolean | null | undefined): boolean {
  return adminAccess !== false;
}
