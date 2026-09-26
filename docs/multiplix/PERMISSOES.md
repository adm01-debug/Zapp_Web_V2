# Multiplix — Permissões (E007)

Não é a matriz final (essa nasce em E015, Fase 1, depois do E003 decidido). Este documento
registra o achado real desta sessão e a proposta a validar.

## Achado

O ZAPP tem um modelo **role + permissão nomeada** (`user_roles` → `role_permissions` →
`permissions`, RPC `user_has_permission`), sem noção de departamento ou carteira. Isso só existe
no Singu: `companies.user_id` (dono/vendedor), `companies.is_supplier`, `companies.is_carrier`.

## Proposta para E015 (a validar na Fase 1, depois de E003)

Novas permissões nomeadas, atribuídas por role via `role_permissions` (mesmo mecanismo já
existente, sem tabela nova):

| Permissão | Efeito no filtro da RPC `multiplix_search_audience` |
|---|---|
| `multiplix.audience.suppliers` | inclui empresas com `is_supplier = true` |
| `multiplix.audience.carriers` | inclui empresas com `is_carrier = true` |
| `multiplix.audience.customers.own` | inclui só `companies.user_id = <mapeamento do usuário ZAPP no Singu>` |
| `multiplix.audience.customers.all` | inclui todas com `is_customer = true`, sem filtro de dono |
| `multiplix.audience.admin` | ignora as regras acima (visão completa) |

O filtro de escopo aplica-se **dentro da RPC do Singu** (nunca no front, per E015). "Vendedor vê
só sua carteira" = a RPC intersecta o resultado com `companies.user_id = :usuario` quando o
usuário só tem `customers.own`.

**Dependência não resolvida aqui**: como um usuário do ZAPP (`user_roles.user_id`, auth do
Supabase ZAPP) se identifica no Singu (`companies.user_id`, auth do Supabase Singu — bancos
diferentes, dois `auth.users` diferentes). Precisa de uma tabela de mapeamento explícita
(usuário ZAPP ↔ usuário/vendedor Singu) — matéria de E007 completo na Fase 1, não coberta aqui.
