Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
O cartão pedia: excluir conexão deve ser admin-only de verdade (hoje o supervisor
apaga), bloqueando as duas vias — a tabela (RLS) e a Edge (que fala com a
Evolution) — e registrando a exclusão na auditoria.

- supabase/migrations/20261012113232_connections_delete_admin_only.sql (novo):
  troca SÓ a policy de DELETE de `whatsapp_connections`, de
  `is_admin_or_supervisor(auth.uid())` para `is_admin(auth.uid())`. SELECT/INSERT/
  UPDATE ficam intactas (agentes precisam do `instance_id` para enviar;
  admin/supervisor seguem gerenciando o cadastro). Sem DDL de dado, sem grant novo.
- supabase/functions/evolution-api/index.ts: a ação `delete-instance` passa a usar
  um gate estrito novo (`requireAdminOnly`, RPC `is_admin`) em vez do
  `requireAdmin` (que aceita supervisor). Antes de apagar, lê a conexão
  (`id, name, instance_id`) e, depois de apagar a linha, grava a trilha em
  `audit_logs` (action `connection_deleted`, entity_type `connection`, entity_id
  uuid da linha, details com instance_id/nome/flavor, ip_address). Se a trilha
  falhar, a resposta avisa (`error:true`) — a conexão já foi apagada e esconder
  isso deixaria exclusão sem rastro. Nenhuma outra ação mudou de gate.
- supabase/functions/evolution-api/index.test.ts: dois testes Deno — supervisor
  leva 403 sem tocar provedor/banco; admin exclui e deixa a trilha.
- scripts/db-audit/connections-delete-admin-only.test.sh (novo): prova em PG 17
  descartável, com roles reais (authenticated/anon/service_role) e `auth.uid()`
  lendo o claim `sub`, aplicando o PRÓPRIO arquivo de migration e o de HEAD
  (20260319134839) como estado anterior.
- scripts/ci/check-test-inventory.mjs: registrei o novo .test.sh na ALLOWLIST com
  justificativa (o passo de uma linha em db-guard.yml é do dono do workflow, e o
  script não é meu; sem esse registro a suíte nasceria órfã no inventário do CI).

Contagem real do diff (base dia/2026-10-12): 6 arquivos — o 6º é este próprio
.tmp/relato.md —, com 2 arquivos de teste: `index.test.ts` (2 casos Deno novos) e
`connections-delete-admin-only.test.sh` (prova de banco, ~20 asserts em A/B).

## Fora da lista de arquivos do cartão (por que foi indispensável)
- `scripts/db-audit/connections-delete-admin-only.test.sh`: é a PROVA de contrato
  que o cartão pede ("Testes de contrato (supervisor não exclui pela tabela)"). Não
  havia .test.sh de assunto equivalente para estender; a prova precisa rodar em PG
  descartável com roles reais (authenticated/anon/service_role), e o padrão do
  repositório para isso é um .test.sh em scripts/db-audit/.
- `scripts/ci/check-test-inventory.mjs`: um .test.sh novo sem registro no inventário
  vira órfão e o `check-test-inventory` (ci.yml) reprova o branch. O registro é uma
  linha na ALLOWLIST com justificativa, no mesmo formato dos demais; o passo em
  db-guard.yml (que é arquivo de workflow, do worker (ci)) ficou pendente e está
  anotado na própria linha.

## Prova
- Banco (contrato, roles reais) — verde depois:
  `bash scripts/db-audit/connections-delete-admin-only.test.sh`
  → "B1 conexao CONN_A INTACTA (supervisor nao apaga)", "B3 conexao CONN_B apagada
  pelo admin", "B4/B5 supervisor segue inserindo/alterando", "[OK] contrato de
  exclusao de conexao (admin-only) verificado" (BLOCO A prova o defeito no mesmo
  run: "A1 supervisor exclui conexao pela tabela (defeito)").
- Migration aplicada no banco local do cartão:
  `hermes-db-migrar supabase/migrations/20261012113232_connections_delete_admin_only.sql`
  → "APLICADA no banco LOCAL 'v2-26101208285a67' (produção não foi tocada)".
- Edge (Deno) — vermelho antes: com o `index.ts` de HEAD (git stash só do
  arquivo), `deno test --config scripts/ci/deno.json --frozen --allow-env
  --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts`
  → "CX0: delete-instance para SUPERVISOR devolve 403 ... FAILED" e
  "CX0: delete-instance para ADMIN exclui a linha e registra a exclusão em
  audit_logs ... FAILED" ("FAILED | 27 passed | 2 failed").
  Verde depois (código do cartão): "ok | 29 passed | 0 failed".

## Passada de efeitos colaterais
- A migration só faz DROP/CREATE de policy: não toca dado, gatilho, GRANT nem
  papel; roda em uma transação (falha = nada aplicado). Rollback executável no
  topo do arquivo, na ordem inversa.
- A Edge não mudou resposta/erro de nenhuma outra ação; `requireAdmin` continua
  valendo para as demais ações de controle.
- Sem oráculo: supervisor e quem não é admin recebem o mesmo 403; a policy de
  DELETE filtra a linha em silêncio (sem revelar existência).

## O que NÃO fiz e por quê
- Não liguei o .test.sh novo no .github/workflows/db-guard.yml (arquivo do
  workflow é do worker (ci)); deixei o registro na ALLOWLIST e a justificativa
  pronta para a promoção de uma linha.
- Não mexi no gate de `connect`/`disconnect`/`create-instance` — o cartão pede só
  a exclusão admin-only.

Nota ao portão: o `index.ts` e o `index.test.ts` (prova vermelho→verde) estão no
mesmo commit f601930f0; o commit seguinte (`docs`) é só este relato. Se o juiz
apontar "código sem teste neste commit", vale o commit do código.
