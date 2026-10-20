# MCP read-only e grafo de conhecimento — estado das etapas 099 e 100

> **Status:** PARCIAL — camada MCP do banco entregue e gateada; servidor MCP HTTP ausente. Grafo de conhecimento versionado fora de `graphify-out/`.
> **Atualizado em:** 2026-10-08 (Hora oficial do Brasil)
> **Referência fixada:** ponta da base `dia/2026-10-08` @ `210c3e7c1`

Este documento é o registro canônico do estado das etapas **099 — MCP server real (JSON-RPC,
read-only, RLS)** e **100 — Grafo de conhecimento, docs canônicos e fechamento** do
[`docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md`](../plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md)
(Bloco 10). Ele **não** substitui o plano: registra o que existe, o que não existe e onde cada
lacuna pode ser fechada.

## Convenção dos docs canônicos de arquitetura

Todo documento de arquitetura versionado neste diretório carrega, no topo:

```
> **Status:** <estado>
> **Atualizado em:** AAAA-MM-DD (Hora oficial do Brasil)
```

O contrato [`tests/contracts/sl221-mcp-grafo-canonico.contract.test.ts`](../../tests/contracts/sl221-mcp-grafo-canonico.contract.test.ts)
trava essa convenção: arquivo novo sem `Status:` e sem data ISO falha no teste. É o critério
de aceite da etapa 100 — "nenhum doc de arquitetura sem data ou sem status" — em forma executável.

## Etapa 099 — MCP server real (JSON-RPC, read-only, RLS)

**Estado: PARCIAL.** O lado banco existe e está auditado; o servidor HTTP para agentes **não existe**.

### O que existe (verificado em 2026-10-08)

| Peça | Caminho | O que garante |
|---|---|---|
| `public.mcp_exec(sql, max_rows)` e `mcp_exec_many` | `supabase/migrations/20260829020000_mcp_exec_functions_harden.sql` | `SECURITY DEFINER` endurecido: `SET search_path TO 'pg_catalog', 'public'`, strip de `;`/espaço no fim, `query_canceled`/`lock_not_available` re-levantados (não engolidos) |
| Revogação de `EXECUTE` do `authenticated` | `supabase/migrations/20260827000100_security_revoke_mcp_exec_from_authenticated.sql` | Só `postgres` e `service_role` executam SQL pelo gateway |
| Stub do ambiente sem as funções | `supabase/migrations/20260829020100_mcp_exec_functions_harden_stub.sql` | Ambiente local/disposable fica consistente |
| Contrato de ACL fail-closed | `scripts/db-audit/check-mcp-exec-acl.sql` + `check-mcp-exec-acl.test.sh` | Assinatura, overload, owner/`SECURITY DEFINER`, grant direto/herdado, `PUBLIC`, `WITH GRANT OPTION`, `search_path` e corpo (fingerprints por `prosrc`) |
| O gate roda de verdade | `.github/workflows/db-guard.yml` (passo do `check-mcp-exec-acl.test.sh`) | O contrato acima é executado em CI em Postgres descartável |

Ou seja: a superfície de execução de SQL do MCP **já tem** o "zero escrita, zero SQL público" do
lado servidor de banco, com auditoria automática.

### O que não existe

- **Nenhum diretório `supabase/functions/mcp` ou `supabase/functions/mcp-server`.** O único
  vestígio de "API externa" no repositório é `supabase/functions/public-api/index.ts`, que é um
  **tombstone**: responde `410 Public API is disabled` sem ler credencial nem executar efeito
  (com teste em `index.test.ts` e gate em `scripts/db-audit/public-api-disable.test.sh`).
- Logo, `tools/list`, `tools/call` e as tools `whoami`, `list_whatsapp_connections`,
  `search_contacts`, `list_queues` e `get_conversation_summary` **não existem**.

### Por que não foi construído neste cartão

A etapa 099 é uma **Edge Function nova** (`mcp-server`) e tem **Gate `[PROD]`** — o plano pede
"registrar no MCP próprio do 'Claude Cérebro'", o que significa deploy em produção e concessão de
acesso a agente. As regras permanentes do cartão proíbem DDL/Edge Function/migration e produção é
decisão do dono. Construir aqui seria o diff de outro cartão.

**Onde fechar:** trilha de Edge (`worker (edge)`) ou `complexo`, com autorização do dono.
Aceite da etapa quando for construída: `tools/list` responde; `search_contacts` respeita a RLS do
usuário autenticado; nenhuma tool escreve; auth por JWT do app; segredo (`mcp-query`) só por env,
fail-closed 503.

## Etapa 100 — Grafo de conhecimento e docs canônicos

**Estado: PARCIAL.** O grafo **existe e está íntegro**, só não mora em `graphify-out/`.

### `graphify-out/` ausente é desenho, não lacuna

- `.gitignore:116` ignora `graphify-out/` inteiro, e o `CLAUDE.md` (seção *graphify*) e o
  `AGENTS.md` explicam: cada clone gera o seu (~50 MB) por `bun run graph:setup`
  (`scripts/graphify/setup.sh`, pacote `graphifyy[sql]==0.9.68`). Os hooks do husky gravam o
  caminho do Python da máquina — versionar o diretório quebraria clone alheio.
- Versionar `GRAPH_REPORT.md` (pedido literal do plano) exigiria rodar o `graphify update` no
  container `claude-code` — fora do alcance de um cartão worker local.

### O artefato versionado do grafo existe e foi conferido

| Peça | Caminho | Conferência |
|---|---|---|
| Grafo (comprimido) | `docs/reconciliation/evidence/graphify-graph.json.gz` | descomprime para **24.533.992 bytes**; `sha256 = a81594a29ae1afe995bbd2422796b3d565788fcc5805bcb5046941b782fec4e7` |
| Manifesto assinado | `docs/reconciliation/evidence/graphify_evidence_manifest.json` | `graph_sha256` idêntico ao acima; base `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`; **19.319 nós / 49.910 arestas**, 0 chamadas de LLM |

O `sha256` do manifesto **bate** com o arquivo versionado: o grafo de conhecimento do projeto está
no repositório, com integridade verificável. É esse par que a pergunta "o grafo existe?" deve
consultar — não o diretório local `graphify-out/`, que é cache por clone.

### Lacunas que continuam abertas (não fechadas aqui)

Os documentos canônicos que a etapa 100 lista **não existem** no repositório:

`docs/ARQUITETURA_CANONICA.md`, `docs/SECRETS_INVENTORY.md`, `docs/DICIONARIO-BANCO.md`,
`docs/RUNBOOK_OBSERVABILITY.md`, `docs/DOCUMENTATION_CONVENTIONS.md`, `docs/ci-workflow-inventory.md`,
`docs/ESTADO.md`, `docs/FEATURE_REGISTRY.md`.

São entrega de redação/consolidação, não correção de defeito — e o inventário de segredos é decisão
do dono (nada de informação sensível sai do sistema por cartão de agente). Ficam registrados como
pendência aqui, com nome e caminho, para virarem cartões próprios.

### O que **foi** corrigido (única edição de conteúdo do cartão)

`docs/architecture/edge-functions.md` era o único doc de arquitetura **sem data e sem status** e
estava **desatualizado** em conteúdo: citava 42 funções, das quais `sicoob-bridge` e
`sicoob-bridge-reply` **não existem mais** no disco, enquanto **34 das 74** funções de
`supabase/functions/` não eram citadas. Ganhou o cabeçalho canônico (Status + data) e a nota de
desatualização com o ponteiro para a fonte de verdade (o próprio diretório).
