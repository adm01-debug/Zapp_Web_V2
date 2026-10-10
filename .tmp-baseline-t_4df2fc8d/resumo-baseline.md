# Baseline do `zapp-verify` — reprodução do problema do cartão pai `t_c5a96aba`

Cartão `t_4df2fc8d` (tarefa 0, perfil worker) — 07/10/2026.
Esta etapa NÃO editou nada: só leitura de artefatos + execução de comandos reais com `HOME` de ensaio.
Assinatura: Especialista: worker (geral).

Pasta desta evidência:
- primária (pedida no cartão): `C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_c5a96aba\.tmp\evidencias-baseline`
- espelho durável (mesmo conteúdo, sha256 igual): `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-baseline-t_4df2fc8d`

## Resposta curta

1. O `check-diferencas.txt` **real** citado no cartão pai está em
   `/home/joaquim_ataides/.local/share/zapp-local/stacks/v2-26100617458c7f/estado/check-diferencas.txt`
   (128 linhas, sha256 `cb31c19f51fa6fb9312644e1616df6ab66e247f51979c0634f72038229419cbe`, gravado em 06/10 18:55).
2. **Cenário A (retrato velho = o manifesto da cópia da branch `dia/2026-10-06`): 128 diferenças**, rc=1.
   Reproduzido ao vivo, contra o banco local do conjunto, **byte a byte igual** ao arquivo real (mesmo sha256).
3. **Cenário B (retrato canônico fresco = `99ff88bf2:supabase/schema-manifest.json`): 2 diferenças, não 9** —
   `functions|f:complete_multiplix_item(...)` e `functions|f:sweep_multiplix_stuck_items(...)`, as duas citadas
   pela migration pendente do cartão (`20261006204953_multiplix_cascata_bloco_terminal.sql`).
4. As **"9 residuais"** do cartão pai existem e foram capturadas uma a uma, mas o sentido é o **inverso** do
   que o cartão pai supõe: são 9 linhas do diff **velho** cuja chave **não existe** no retrato fresco — o
   retrato fresco **apaga** essas 9 (são objetos que a produção **já não tem**). Nenhuma delas é diferença
   entre o banco local e o retrato: em todas as 9, a chave também **não existe no banco local**.
5. **Achado que muda o problema:** para rodadas conduzidas por agente, o passo `banco_local` **nunca chega ao
   explicador**. O `zapp-db-ler` é bloqueado ao agente (`rc=77`, regra R1), então `LEDGER_OK=0` e qualquer
   diferença de estrutura vira **FALHOU/VERMELHO** — inclusive o cenário B, com **2** diferenças legítimas e
   citadas. Com o registro legível (fixture), o mesmo cenário B sai **AVISO verde** e o A sai **FALHOU com
   84 linhas não explicadas**. Ou seja: o que reprova o cartão hoje é o bloqueio do registro + o retrato
   defasado, não uma regra de atribuição que "culpa o cartão" pelas 9.

## Contagens medidas

| # | cenário | retrato na árvore | diferenças | registro da produção | veredito do passo `banco_local` |
|---|---------|-------------------|-----------|----------------------|---------------------------------|
| 1 | A, ao vivo | velho (cópia 294) | **128** | bloqueado ao agente (rc=77) | `FALHOU` — `VERIFY: VERMELHO em banco_local` |
| 2 | B, ao vivo | fresco (99ff88bf2) | **2** | bloqueado ao agente (rc=77) | `FALHOU` — `VERIFY: VERMELHO em banco_local` |
| 3 | A, ao vivo | velho | 128 | legível (fixture) + conjunto da própria cópia | `FALHOU` — 84 não explicadas |
| 4 | B, ao vivo | fresco | 2 | legível (fixture) + conjunto da própria cópia | `AVISO` — toda diferença citada (verde) |

Filtro de HOJE (o que está em `~/.local/bin/zapp-verify`, sha256 `70c0b223…`):
- cenário A: 128 linhas → **44 explicadas, 84 NÃO explicadas** → `diferença não explicada por migration pendente: rls|gmail_oauth_states; rls|talkx_storage_purge_queue; columns|audit_logs.dedupe_key (+81)`.
- cenário B: 128→2 linhas → `ok` (rc=0).

Filtro do patch já pronto (`.tmp/zapp-verify.novo`, sha256 `c95e371a…`, do cartão pai) — só para comparar:
- cenário A: 44 explicadas, **76 atribuídas a drift canônico**, **8 ainda não explicadas**
  (`indexes` 2, `constraints` 3, `column_grants` 1, `default_grants` 2 — nomes automáticos e grant global).
- cenário B: `ok|drift=0`.

## As 9 linhas (arquivo `nove-residuais.txt`, texto integral)

Todas com `velho=True fresco=False local=False`:
```text
functions|f:record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean)
routine_grants|f:record_incoming_call_event(...)|postgres|EXECUTE|grantor=postgres
routine_grants|f:record_incoming_call_event(...)|service_role|EXECUTE|grantor=postgres
routine_grants|f:record_incoming_call_event(... p_should_notify boolean, p_direction text)|PUBLIC|EXECUTE|grantor=postgres
routine_grants|f:record_incoming_call_event(... p_should_notify boolean, p_direction text)|authenticated|EXECUTE|grantor=postgres
routine_grants|f:record_talkx_campaign_lifecycle_event()|PUBLIC|EXECUTE|grantor=postgres
routine_grants|f:record_talkx_campaign_lifecycle_event()|authenticated|EXECUTE|grantor=postgres
routine_grants|f:record_talkx_campaign_lifecycle_event()|service_role|EXECUTE|grantor=postgres
relation_grants|r:public.team_conversations|authenticated|UPDATE|grantor=postgres
```

## Decomposição das 128 linhas do cenário A (o que cada uma é)

| no retrato velho | no retrato fresco | n | leitura |
|------------------|-------------------|---|---------|
| só local | **igual** | 110 | objeto que o banco local tem e o retrato **fresco** já alcançou (o velho estava atrás) → desaparece no cenário B |
| só produção | **ausente nos dois** | **9** | só existe no retrato velho: o retrato fresco **apagou** → são as "9 residuais" do pai, não sobras |
| diferente | igual | 7 | valor divergia no velho e é idêntico no fresco |
| diferente | **diferente** | **2** | as 2 funções `complete_multiplix_item` / `sweep_multiplix_stuck_items` — as **únicas** diferenças reais que sobram, ambas citadas pela migration pendente |

## Achados extra (para as tarefas seguintes)

- **`explicada()` é código morto em rodada de agente.** `zapp-verify` (linha 43) chama `zapp-db-ler`; o guard do
  Hermes responde `PROIBIDO a agentes: zapp-db-ler consulta o banco de PRODUÇÃO (regra R1)` e sai **rc=77**.
  Logo `LEDGER_OK=0` → a linha 62/66 (`elif ... LEDGER_OK = 1`) nunca é satisfeita → a decisão cai na linha 121
  (`passo banco_local zapp-db-local check`), que reprova em qualquer diferença. Medido ao vivo (rodadas 1 e 2).
  Consequência: **nenhum cartão passa em `banco_local` com diferença de estrutura**, nem com retrato fresco.
- **5 das 128 linhas são de tipos que `explicada()` não trata em nenhum ramo**: `rls` (2) e `column_grants` (3)
  — `rls|gmail_oauth_states`, `rls|talkx_storage_purge_queue`,
  `column_grants|r:public.team_conversations.{avatar_url,name,updated_at}|authenticated|UPDATE|grantor=postgres`.
  Essas nunca são atribuídas a migration pendente, nem com o retrato fresco. Confirma o achado do cartão `t_5aaad6ca`.
- O conjunto do conjunto `v2-26100617458c7f` estava **de pé** (contêineres com 13 h de uptime), e o banco local
  **não mudou** desde 18:55: o `manifest-local.json` de agora difere do de 18:55 só no campo `generated_at`.
- Migration pendente do conjunto = `20261006204953_multiplix_cascata_bloco_terminal.sql` (derivada localmente:
  é a única migration da cópia que não existe em `dia/2026-10-06`); ela **cita** as duas funções (linhas 52 e 140).
- `falhas.tsv` do conjunto tem 21 falhas esperadas e **não** inclui a migration pendente (não é o caso de
  "migration pendente falhou no conjunto").

## Como reproduzir (arquivo `comandos.txt`)

Árvores de ensaio mínimas (`arvore-A` = retrato velho, `arvore-B` = retrato fresco; cada uma com
`supabase/config.toml`, `supabase/schema-manifest.json`, `supabase/migrations` (symlink só leitura),
`scripts/db-audit/manifest.sql`) + `HOME` de ensaio. Nada fora desta pasta foi escrito; o estado real do
conjunto ficou intacto (mtime 06/10 18:55:49).

## Limites desta evidência

- Não rodei o `zapp-verify` inteiro (tipos/lint/testes/build): o objeto do cartão é o passo `banco_local`, e um
  portão completo não chegaria a ele em árvore de ensaio sem o código de aplicação. Rodei o **bloco real** do
  `zapp-verify` (linhas 8–29 + 35–124, extraídas byte a byte) com os comandos reais (`zapp-db-local check`).
- Nas rodadas 3/4 o "registro da produção" é uma **fixture** (`fixture-zapp-db-ler/`, versões das migrations da
  base canônica `dia/2026-10-06`), porque ao agente a leitura da produção é proibida (R1). O cenário real de
  agente são as rodadas 1/2.
- Não alterei `~/.local/bin/zapp-verify` (sha256 segue `70c0b223…`) nem `zapp-db-local` (sha256 `9a1cd599…`).
