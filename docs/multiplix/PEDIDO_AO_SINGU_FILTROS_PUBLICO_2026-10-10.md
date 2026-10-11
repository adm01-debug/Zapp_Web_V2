# Pedido ao Singu — Multiplix: tipos de público e subfiltros dinâmicos (10/10/2026)

> Documento de PEDIDO, para a equipe do Singu avaliar e decidir — **nenhuma escrita foi feita no
> banco do Singu**. Segue o mesmo padrão do pedido de F27 (`_foreign/singu/20261001154000_singu_e014_b2b_e_papeis.sql`):
> qualquer alteração no Singu só acontece com autorização explícita do Joaquim, depois que a
> equipe do Singu confirmar os pontos em aberto da seção 4.

## 1. Pedido original (Joaquim, 10/10/2026)

No módulo Multiplix (`localhost:5500/?view=multiplix`), o filtro "Público" hoje só mostra
**Todos / Cliente / Fornecedor / Transportadora**. O pedido é:

1. O primeiro filtro deve listar **todos os tipos de público que existem no Singu**: além dos 3
   atuais, ele citou Colaboradores, Prestadores de Serviço e Praceiros como exemplos — a lista
   completa real depende do que o Singu tem cadastrado (ver §4).
2. **Subfiltros dinâmicos**, que mudam conforme o tipo escolhido:
   - **Fornecedor:** ramo de atividade (já existe).
   - **Transportadora:** tipo de transportadora, praças que atua.
   - **Cliente** (dado de EMPRESA, ligado ao contato): ramo de atividade (já existe), grupo
     econômico, status, tipo cooperativa, nicho cliente, capital social, e demais informações de
     CRM relevantes.
   - **Contato** (dado de PESSOA): sexo, idade, cargo, departamento, data de nascimento, e o que
     mais o Singu tiver.

## 2. O que existe hoje (lido no repositório do Zapp, `dia/2026-10-10`)

O Zapp **não acessa o banco do Singu diretamente** (projetos Supabase distintos, sem FDW/dblink —
`docs/multiplix/PONTE_SINGU.md`). Toda a leitura passa pela edge `multiplix-audience`, que chama
5 RPCs do Singu, espelhadas em `supabase/migrations/_foreign/singu/`:

| RPC | Parâmetros hoje | Fonte real (lida no espelho) |
|---|---|---|
| `multiplix_list_ramos` | nenhum | `companies.ramo_atividade` (agrupado) |
| `multiplix_list_ufs` | nenhum | `company_addresses.estado` (endereço primário) |
| `multiplix_search_audience` | `p_roles` (`cliente\|fornecedor\|transportadora`), `p_ramo`, `p_uf`, `p_search`, escopo, paginação | `companies.is_customer/is_supplier/is_carrier`, `ramo_atividade`, `company_addresses.estado` |
| `multiplix_count_audience` | mesmos filtros de busca, sem paginação | idem |
| `multiplix_resolve_recipients` | ids de empresa/contato + escopo | `companies`, `contacts`, `contact_phones`, `company_phones` |

Ou seja: hoje `public.companies` só expõe, para o Zapp, **3 flags de papel** (cliente, fornecedor,
transportadora) e **ramo de atividade** + **UF**. Nenhum dos campos pedidos em §1.2 está nas 5
RPCs. Busquei "Praceiro" no repositório inteiro (código, SQL, docs) — **zero ocorrências**; não
sabemos se é um tipo que existe no Singu com outro nome, ou se ainda não foi modelado lá.

## 3. O que está sendo pedido (desenho proposto, a confirmar com a equipe do Singu)

### 3.1 Tipos de público (novo RPC `multiplix_list_public_types`)

Hoje o "tipo" é inferido de 3 colunas boolean fixas. Para comportar N tipos sem recriar a RPC a
cada tipo novo, a proposta é um `public.companies` com uma coluna adicional — por exemplo
`tipos_publico text[]` (ou uma tabela `company_types` 1:N, se o Singu já modelar assim) — e uma
RPC nova que lista os tipos realmente cadastrados, no mesmo padrão de `multiplix_list_ramos`:

```sql
-- PROPOSTA — a equipe do Singu decide o nome/tipo real da coluna
CREATE OR REPLACE FUNCTION public.multiplix_list_public_types()
 RETURNS TABLE(tipo text, total bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT tipo, count(*)::bigint FROM (
    SELECT unnest(c.tipos_publico) AS tipo FROM public.companies c
    WHERE c.deleted_at IS NULL AND c.status = 'ativo'
  ) x GROUP BY 1 ORDER BY total DESC;
$function$
```

`multiplix_search_audience`/`multiplix_count_audience` trocariam o `p_roles` atual (3 valores
fixos) por uma lista aberta, validada contra os tipos reais.

### 3.2 Subfiltros por tipo (novo RPC `multiplix_list_subfilters(p_tipo text)`)

Para não hardcodar no front quais subfiltros cada tipo tem, a proposta é uma RPC que devolve, para
um tipo, os campos filtráveis e os valores distintos de cada um (mesmo padrão de
`multiplix_list_ramos`/`multiplix_list_ufs`, um `GROUP BY` por campo). Os parâmetros que o Zapp
precisaria enviar depois em `multiplix_search_audience`/`multiplix_count_audience`:

| Tipo | Subfiltro pedido | Coluna real no Singu | Observação |
|---|---|---|---|
| Transportadora | tipo de transportadora | `carriers.tipo_transporte` (text) | tabela própria `carriers`, 1:1 com `companies`; coluna existe, hoje vazia |
| Transportadora | praças que atua | `carriers.estados_atendidos`, `carriers.cidades_atendidas` (array) | idem — estrutura pronta, sem dado ainda |
| Cliente (empresa) | grupo econômico | `companies.grupo_economico` (text) + `companies.grupo_economico_id` → `economic_groups` | atenção: existe também `grupos_economicos` (plural, PT), que é OUTRA coisa — catálogo de sistemas de cooperativa de crédito, ligado por `coop_sistemas`; não confundir os dois |
| Cliente (empresa) | status | enum `company_status` = `ativo, inativo, suspenso` | |
| Cliente (empresa) | tipo cooperativa | `companies.tipo_cooperativa` + hierarquia `central_id`/`singular_id`/`confederacao_id` + tabela `coop_sistemas` | é campo à parte, não é um dos valores de `ramo_atividade` |
| Cliente (empresa) | nicho cliente | `companies.nicho_cliente` (text) | |
| Cliente (empresa) | capital social | `companies.capital_social` (numeric) | alimentado por enriquecimento da Receita Federal |
| Contato (pessoa) | sexo | `contacts.sexo` (text livre) | sem padronização hoje; existe um enum `gender` pronto no banco que essa coluna NÃO usa — vale a equipe do Singu migrar pra ele antes de expor como filtro |
| Contato (pessoa) | idade / data de nascimento | `contacts.data_nascimento` **e** `contacts.birthday` (duas colunas redundantes) | LGPD: ver §5 |
| Contato (pessoa) | cargo | `contacts.cargo` (text livre); existe também enum `contact_role` (decisor/comprador/financeiro/operacional/ti/jurídico/marketing/recepção) não usado por essa coluna | aparece hoje só na SIDEBAR do Singu, não em RPC filtrável |
| Contato (pessoa) | departamento | `contacts.departamento` (text livre) | mesma observação do cargo |

Cargo e departamento já têm precedente: o plano do módulo Contatos (08/10) mapeou que o Singu tem
esses dois campos na sidebar de contato, mas a RPC de busca avançada (`search_contacts_advanced`)
não filtra por eles hoje — é o mesmo ajuste que este pedido faz para o Multiplix, então vale
resolver os dois de uma vez se a equipe do Singu for mexer na mesma área.

### 3.3 Tipos de público reais (banco verificado 10/10)

O enum `company_type` do Singu tem **7 valores**: `cliente, fornecedor, parceiro, transportadora,
grafica, prospect, inativo`. Ou seja: "Colaborador", "Prestador de Serviço" e "Praceiro" (citados
no pedido original como exemplo) **não existem** no schema — nem como enum, nem coluna, nem
tabela. Em compensação, existem 4 tipos reais que o Multiplix nunca tratou: **parceiro**,
**grafica** (faz sentido direto no ramo de brindes), **prospect** e **inativo**. Ressalva: ainda
não confirmei qual coluna/tabela de fato USA esse enum hoje (pode estar numa tabela de
histórico/importação, não em `companies` diretamente) — item para a equipe do Singu confirmar
junto com a §4.

## 4. Perguntas para a equipe do Singu responder antes de qualquer SQL

1. ~~Lista completa dos tipos de público~~ — **respondida**: enum `company_type` (7 valores, §3.3).
   Falta só confirmar QUAL coluna/tabela usa esse enum na prática.
2. ~~Onde mora cada subfiltro~~ — **respondida para todos os campos da tabela acima** (coluna real
   identificada). Falta confirmar: "grupo econômico" é classificação própria ou relação
   empresa→empresa (matriz/filial)? E a inconsistência de maiúscula/minúscula em `contacts.sexo`
   — padronizar antes de expor como filtro, ou o Zapp normaliza na leitura?
3. "Capital social" e "idade/data de nascimento" são campos sensíveis — confirmar se já existe
   alguma política de acesso no Singu para eles, para o Zapp herdar o mesmo cuidado.
4. `contacts.data_nascimento` e `contacts.birthday` são redundantes — qual é a fonte de verdade?

## 5. Observação de proteção de dado (alinhado com a decisão do módulo Contatos, Q11 de 08/10)

Idade/data de nascimento, capital social e cargo/departamento de pessoa física são dados mais
sensíveis que ramo/UF. Se a equipe do Singu liberar esses campos, o Zapp deve tratá-los com a MESMA
regra já aprovada para o módulo Contatos (nenhuma informação explícita solta em lista, revelar sob
clique com registro) em vez de expor direto no filtro/lista do Multiplix — fica como ponto a
decidir junto com a equipe do Singu, não é automático.

## 6. Próximo passo

Este documento vai para o Joaquim levar à equipe do Singu. Depois das respostas de §4, volto com
o SQL concreto (no padrão de `_foreign/singu/20261001154000_singu_e014_b2b_e_papeis.sql`:
`DROP`+`CREATE` quando a assinatura de retorno muda, ACL restaurada, md5 registrado no
`_foreign/singu/README.md`) para autorização e aplicação — igual ao precedente de F27.

## Referências

- `docs/multiplix/PONTE_SINGU.md` — contrato das 5 RPCs atuais
- `supabase/migrations/_foreign/singu/` — espelhos versionados + precedente de alteração (F27/E014)
- Memória da sessão: plano do módulo Contatos (08/10), achado de cargo/departamento no Singu
