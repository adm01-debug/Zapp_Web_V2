# Impacto da nova regra de visibilidade de contatos (CT-022) — 08/10/2026

Feito pelo Claude, **somente leitura** no banco de produção (agentes não acessam produção). Nada foi alterado.

## Regra de hoje (policy `contacts_select_policy` → `can_edit_contact`)
Um usuário vê um contato se:
1. é administrador ou supervisor (vê todos); ou
2. o contato está atribuído a ele (`assigned_to` = perfil dele) — e, só se ele tiver o papel `special_agent`, também aos agentes liberados em `agent_visibility_grants`; ou
3. é **membro ativo da fila** do contato (`queue_members`) — **qualquer contato da fila**, mesmo de outro vendedor ou sem atribuição.

(Correção ao que foi dito antes: não existe "subordinado" por hierarquia; o alcance extra vem de `special_agent` + `agent_visibility_grants`.)

## Regra nova (decidida pelo Joaquim, Q21)
O vendedor vê só os contatos atribuídos a ele (e, se `special_agent`, os liberados); supervisor/administrador veem todos; a regra de fila sai.

## Fotografia da produção (08/10/2026)
- Perfis: 9 ativos. Papéis: 4 admin, 3 supervisor, 3 agent.
- Contatos não excluídos: **3.106**. Sem atribuição: **318**. Atribuídos a 5 pessoas: Teste Design 1.388, ti Promo 1.388, E2E Teste (CI) 7, Admin 01 4, Multiplix Compras 1.
- Uma única fila tem contatos; 4 membros ativos.

## Impacto por vendedor (perfis que não são admin/supervisor)
| Vendedor | Vê hoje | Veria com a regra nova | Deixaria de ver |
|---|---|---|---|
| ti Promo | 3.098 | 1.388 | 1.710 |
| Teste Design | 3.098 | 1.388 | 1.710 |

Hoje cada um enxerga quase todo o banco **pela fila** (3.098 de 3.106). Com a regra nova passam a ver só os 1.388 deles.

## Atenção
- Os **318 contatos sem atribuição** passariam a ser visíveis só para admin/supervisor. É preciso decidir quem atende contato sem dono (atribuir antes de ligar a regra, ou criar o conceito de "caixa de entrada" para supervisor distribuir).
- **Os contatos são reais**: chegaram pela Evolution API (WhatsApp). Conferido: 3.106 telefones distintos, nenhum repetido; os 1.388 de cada vendedor são contatos diferentes. Portanto o impacto é real: hoje ti Promo e Teste Design enxergam a carteira inteira pela fila; com a regra nova cada um enxergaria só a sua metade (1.388). O perfil "E2E Teste (CI)" (7 contatos) é de teste.
- Antes de ligar a regra, o Joaquim precisa confirmar que a divisão atual das carteiras (1.388 / 1.388 / 318 sem dono) é a divisão desejada.
- Mudança de RLS fica na trilha de banco: só local até o Joaquim autorizar a aplicação em produção.

## Como repetir
Consulta somente leitura: para cada perfil não admin, contar contatos com `assigned_to` no conjunto visível (próprio + grants se `special_agent`) e, separadamente, os que só aparecem por `queue_members` ativo.
