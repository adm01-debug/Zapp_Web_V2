# Multiplix — Permissões e escopo por carteira (E007/E015)

Complementa `ESTADO_INICIAL.md` e o ADR-007. Este arquivo cobre dois pontos que a
descoberta inicial não fechou: o modelo de permissão do ZAPP e — **correção
verificada por query direta no Singu** — qual coluna carrega de fato a carteira do
vendedor.

## ZAPP não tem departamento — tem role + permissão nomeada

`src/hooks/system/usePermissions.ts` + `supabase/migrations/20251215025014_*.sql`:
`user_roles` (role por usuário) → `role_permissions` (permissão por role) →
`permissions` (catálogo) → RPC `user_has_permission`. Enum `app_role`:
`('admin', 'supervisor', 'agent')`. **Não existe "departamento" nem "carteira" no
ZAPP.** "Vendedor → carteira", "Compras → fornecedores", "Logística →
transportadoras" (E015 do plano) só existem do lado Singu.

## Correção: `companies.user_id` NÃO é a carteira do vendedor

O `ESTADO_INICIAL.md` (medição da outra sessão) registra: *"`companies.user_id` é a
carteira"*. **Verificado por query direta no Singu nesta sessão: é falso.**

```sql
select
  count(*) filter (where c.user_id is not null) as com_user_id,
  count(*) filter (where c.user_id is not null and u.id is not null) as bate_com_auth_users
from public.companies c
left join auth.users u on u.id = c.user_id;
-- com_user_id = 3833, bate_com_auth_users = 0
```

3.833 empresas têm `companies.user_id` preenchido — **zero** batem com `auth.users`
do próprio Singu. Não é referência a usuário nenhum reconhecível (provavelmente
resíduo de import do Bitrix). **A carteira real é outra tabela:**

- `public.customers.vendedor_id` (integer) → `public.users.id` (staff interno do
  Singu, tabela própria `id/name/email/is_vendedor/is_active/departamento`, **não**
  é `auth.users`).
- View já existente `vw_carteira_vendedores` confirma o padrão: `customers cu JOIN
  users u ON cu.vendedor_id = u.id`.
- `public.users.email` bate com e-mails reais dos dois lados — ex.: `adm01@promobrindes.com.br`
  existe em `auth.users` do ZAPP **e** em `public.users`/`auth.users` do Singu.

## Vínculo usuário ZAPP ↔ vendedor Singu: por e-mail, sem tabela nova

Não é preciso criar tabela de mapeamento. A edge `multiplix-audience` (E020) resolve
assim, depois de validar o JWT do ZAPP:

1. Pega o e-mail do usuário ZAPP autenticado (`auth.users.email`, já no JWT).
2. Passa esse e-mail como parâmetro para a RPC do Singu.
3. Dentro da RPC (`SECURITY DEFINER`): `SELECT id FROM public.users WHERE email =
   :email AND is_vendedor = true AND is_active = true` → dá o `vendedor_id`.
4. Escopo "carteira própria" = `EXISTS (SELECT 1 FROM customers cu WHERE
   cu.company_id = c.id AND cu.vendedor_id = :vendedor_id)`.

Se o e-mail não bater com nenhum `public.users` do Singu (caso de hoje: os únicos
usuários ZAPP são `admin`/`agent`/`ti`, não os `comercial01..09@promobrindes.com.br`
que são os vendedores reais no Singu), o escopo "carteira própria" simplesmente não
resolve nenhuma empresa — comportamento seguro por padrão, não um erro.

## Proposta de permissões nomeadas (E015)

Novas permissões no catálogo já existente (`permissions`/`role_permissions`), sem
tabela nova:

| Permissão | Efeito no filtro da RPC |
|---|---|
| `multiplix.audience.suppliers` | `is_supplier = true` |
| `multiplix.audience.carriers` | `is_carrier = true` |
| `multiplix.audience.customers.own` | `is_customer = true` **e** dentro da carteira do vendedor (via e-mail, acima) |
| `multiplix.audience.customers.all` | `is_customer = true`, sem filtro de dono |
| `multiplix.audience.admin` | ignora as regras acima |

O filtro aplica-se **dentro da RPC do Singu**, nunca no front (E015/E020).
