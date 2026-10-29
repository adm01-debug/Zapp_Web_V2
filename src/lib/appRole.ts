import type { AppRole } from '@/services/role.service';

/**
 * Paridade V3 (E60) — guard runtime de AppRole no boundary.
 *
 * O `<Select>` entrega `string`; a V2 fazia `v as AppRole` (AdminUsersTable e
 * AdminView), então um valor fora da lista (ex.: `''` de item removido, ou um
 * papel de outro produto como `owner`/`superadmin`) passava direto para a RPC
 * `admin_set_role`. Aqui a validação é real: só os 4 papéis da V2 entram, e o
 * `AppRole` continua vindo de uma fonte só (`role.service`, reexportado por
 * `useUserRole`) — este módulo só consome o tipo, não redefine.
 */
export const APP_ROLE_VALUES: readonly AppRole[] = ['admin', 'supervisor', 'agent', 'special_agent'];

/** `true` só para valor exatamente igual a um papel da lista (sem trim, sem cast). */
export function isAppRole(valor: string): valor is AppRole {
  return (APP_ROLE_VALUES as readonly string[]).includes(valor);
}
