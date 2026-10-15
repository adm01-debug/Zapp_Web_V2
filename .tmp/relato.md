Especialista: workersql

## Esta rodada (refazer 1: só relato, por ordem do cartão)
- Nenhum código novo: o commit desta rodada altera SÓ `.tmp/relato.md`. Todo o código (migration de extras, RPC com escopo, types, teste) é o da entrega anterior `568150c18`, que o revisor declarou correta.

## Pontos do revisor
- Ponto 1: primeira linha agora é exatamente `Especialista: workersql` (só relato).
- Ponto 2: removida a frase que punha na boca do cartão o que ele nunca disse; a dependência SD1 está descrita abaixo como foi feita de verdade (só relato).
- Ponto 3: as três saídas que negam estão coladas abaixo em "Prova que nega", mais o contraste que passa (só relato).
- Ponto 4: o teste alterado é `scripts/db-audit/sla-delivery-rules.test.sh` porque a máquina de FATOS não reconhece `.test.sh`.

## O que mudou e por quê (entrega anterior, mantida)

- `supabase/migrations/20261013030417_sla_delivery_rules_extras.sql` (NOVO): a regra de atraso de
  ENTREGA ganha o que a V3 tinha — `name text` (rótulo próprio, CHECK 1..120 após trim),
  `custom_message text` (mensagem própria: texto simples, 1..1000 após trim e sem tag HTML via
  `!~ '<[[:alpha:]/!]'`) e `applies_to text` (escopo por instância/canal, CHECK de formato;
  NULL = vale para todas). Os três CHECK são `is null or ...`, então a linha que já existe (o seed
  global 30/60 do SD1) passa a validação sem backfill e sem tocar `updated_at` — nenhum UPDATE
  nesta migration. RLS, políticas, GRANT de tabela e gatilho ficaram intocados (o teste reconfere
  RLS ligada e as 4 políticas depois da migration).
- A RPC `resolve_sla_delivery_rule` foi trocada por `(p_contact_id uuid, p_applies_to text default
  null)` devolvendo também `name`, `custom_message` e `applies_to`, e passou a respeitar o escopo:
  regra sem escopo vale para todas; regra com escopo só entra quando o escopo pedido é igual; sem
  canal informado só entram as regras sem escopo (uma regra de outra instância não vaza). A
  precedência antiga foi preservada — contato ativo mais recente > global ativa mais recente >
  padrão 30/60, com `source` = contact|global|default. A assinatura antiga `(uuid)` é dropada
  porque manter as duas criaria ambiguidade de overload; o parâmetro novo tem default, então quem
  chamar com um argumento continua funcionando, e não há consumidor da versão antiga
  (`git grep -n resolve_sla_delivery_rule -- src` fora do types.ts gerado: nenhum).
- `scripts/db-audit/sla-delivery-rules.test.sh`: estendi o teste de banco que a dependência já
  tinha (não criei `.test.sh` novo — o inventário de testes só aceita caminho já listado). Seções
  novas provam, em PostgreSQL 17 descartável e com papel real: as 3 colunas e os 3 CHECK; a linha
  legada intacta (3 campos nulos = sem backfill); a RPC nova existindo e a antiga sumindo; o
  escopo (instância vence sem-escopo, outra instância não herda, sem canal não vaza, escopo do
  contato de outra instância não entra); a precedência contato > global; o padrão 30/60 sem
  nome/mensagem/escopo; entrada inválida recusada (nome em branco, mensagem de 1001, tag HTML,
  escopo com espaço) e texto simples com `<` isolado aceito; anon sem EXECUTE e sem privilégio de
  tabela; o rollback do cabeçalho executando de verdade e restaurando a RPC antiga com os grants;
  e a reaplicação idempotente. A primeira asserção da seção 7 é o vermelho dentro da própria
  execução: antes de aplicar as extras, 0 colunas e a RPC com escopo inexistente.
- `src/integrations/supabase/types.ts`: as 3 colunas em Row/Insert/Update e a RPC com `p_applies_to?`
  e os 3 campos novos no retorno, no mesmo formato do arquivo gerado.

## Dependência (SD1) e fora do escopo

- FAIXA DO PAI: o SD1 (`d1ead1b2e`, cartão `t_5db4faa7`) não estava na minha base:
  `git merge-base --is-ancestor d1ead1b2e HEAD` → saída 1 (falso). Trouxe com `git cherry-pick`
  a faixa `dia/2026-10-11..d1ead1b2e` do JSON da fila (1 commit; conflito só no inventário
  `scripts/ci/check-test-inventory.mjs`, resolvido mantendo as duas entradas). Na branch há o
  commit do SD1 cherry-pickado (`77c416f12`) e o meu (`568150c18`).
- O glob do cartão traz `supabase/tests/**`, mas a prova de banco deste repositório mora em
  `scripts/db-audit/*.test.sh` (é o caminho que o inventário e o `db-guard` conhecem). Estendi o
  arquivo existente; nenhum arquivo novo de CI, nenhum GRANT/papel alterado fora do que a própria
  RPC pede, nenhum workflow tocado.

## Prova

- vermelho antes (dentro da suíte, no estado só-com-SD1):
  `bash scripts/db-audit/sla-delivery-rules.test.sh` → assertiva "extras: ausentes antes da
  migration" confirma `0` colunas novas e `to_regprocedure('public.resolve_sla_delivery_rule(uuid,text)')`
  nulo.
- verde depois (rodado de novo nesta rodada): `bash scripts/db-audit/sla-delivery-rules.test.sh` →
  `SLA delivery rules PostgreSQL 17 behavioral contract: PASS` (todas as linhas `[PASS]`, zero
  falha; a suíte cobre SD1 + extras).
- verificação: `zapp-verify . --rapido` →
  `VERIFY: VERDE SEM BANCO (7s)` (banco_local não verificado sem nome de conjunto; a prova de
  banco é a suíte acima).
- Prova que nega (Ponto 3): na entrega anterior as duas migrations foram aplicadas no banco local
  da tarefa (v2-2610122358f38d, APLICADA_LOCAL em `.hermes-tarefa`) com a conferência que passa
  como `authenticated`. Nesta rodada o conjunto não está mais de pé
  (`zapp-db-local psql . v2-2610122358f38d` → "conjunto v2-2610122358f38d não está de pé") e o
  `zapp-db-local up` não sobe agora (`Stack host is draining`, `ERRO: o conjunto não subiu`).
  Por isso as três negações foram reproduzidas em PostgreSQL 17 descartável, aplicando os mesmos
  dois arquivos de migration na mesma ordem e com os mesmos papéis reais (anon/authenticated — a
  mesma técnica da suíte):
  - anon executa `resolve_sla_delivery_rule(uuid,text)` →
    `ERROR:  permission denied for function resolve_sla_delivery_rule` (saída 1);
  - anon lê `sla_delivery_rules` →
    `ERROR:  permission denied for table sla_delivery_rules` (saída 1);
  - agente (authenticated não-staff) insere regra →
    `ERROR:  new row violates row-level security policy for table "sla_delivery_rules"` (saída 1);
  - contraste que passa (agente lê e executa): `1` e `30|60|global` (saída 0).

## Arquivos fora da lista do cartão (por que foram indispensáveis)

- `scripts/ci/check-test-inventory.mjs` NÃO é trabalho meu: chegou pelo `git cherry-pick` do commit
  do SD1 (dependência que o próprio cartão manda recuperar) — o conflito do cherry-pick era
  exatamente essa lista de inventário e foi resolvido mantendo as duas entradas (a do E44 e a do
  SD1). O marcador `>>>>>>>` que sobrou dessa resolução quebrava a verificação (lint: "Unexpected
  token >>>" em `scripts/ci/check-test-inventory.mjs:122`) e foi removido — é o único ajuste além
  da lista do cherry-pick.
- `scripts/db-audit/sla-delivery-rules.test.sh` é o teste de banco da minha área (é onde mora a
  prova de migration neste repositório; o `db-guard` e o inventário de testes só conhecem
  `scripts/db-audit/*.test.sh`). O glob do cartão traz `supabase/tests/**`, mas não há suíte .sql
  ali para este caso e criar um `.test.sh` novo seria recusado por órfão no inventário. Estendi o
  arquivo que a dependência já trouxe, sem tocar em workflow.

## O que NÃO fiz e por quê

- Não editei a migration do SD1 (regra: correção = migration nova) e não renomeei
  `warning_minutes`/`breach_minutes` (a assinatura do SD1 fica como está; a paridade de nomes com
  a V3 não foi pedida e quebraria contrato).
- Não forcei `name` NOT NULL: exigiria backfill da linha do seed (DML em dado existente, reescreve
  `updated_at`) — o campo é opcional e NULL = a tela usa o rótulo padrão.
- Não toquei tela/hook que consuma a RPC (não há nenhum em `src/**` hoje); quando houver, o
  contrato novo tem `p_applies_to` opcional e os 3 campos no retorno.
- Nesta rodada (refazer 1), por ordem do cartão: nenhum código novo, só o relato.
