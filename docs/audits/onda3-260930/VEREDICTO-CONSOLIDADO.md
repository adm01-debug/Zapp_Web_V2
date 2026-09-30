# Verdicto consolidado — auditoria adversarial da Onda 3 (30/09/2026)

**Alvo:** as três correções cross-módulo desta sessão — #1265 (policy fraca `team_message_reactions`),
#1266 (RPC `get_team_messages_page` ambígua + recursão de `tcm_select_own`) e #1267 (guards da Multiplix
fail-open) — mais os fixes de front da Onda 2 (#1290/#1294/#1297).
**Base:** `origin/main` = `d3ed11cb` no encerramento (a auditoria começou em `92e884ee`).
**Método:** 1 líder + 5 especialistas independentes (`delegate_task`), cada um com sandbox próprio,
banco canônico em SELECT-only, e a obrigação de colar comando + saída crua. Nenhum auditor fechou
trabalho, commitou ou escreveu no banco. Todo achado P0/P1 foi **reproduzido pelo líder** antes de
entrar aqui: a marca `[conferido por mim]` diz que o comando foi rodado de novo por mim, não aceito
por relato.

> **Este documento é SOMENTE-LEITURA: não autoriza executar correção alguma.** Cada achado vira etapa
> própria, planejada antes de ser aplicada.

---

## 1. Veredicto por domínio

| # | Domínio | Auditor | Veredicto | Achados |
|---|---|---|---|---|
| A | Banco vivo / DBA | a1-db | **RESSALVA** | 1 MÉDIA novo confirmado; 1 "CRÍTICA" **refutada**; 1 contagem errada minha |
| B | Mutação dos harnesses | a2-mut | **RESSALVA** | 4 lacunas de prova (2 delas no #1266) |
| C | Brownfield / over-closing | a3-brown | **APROVADO** | nenhum over-closing; 1 nuance de severidade do #1266 |
| D | Forense de CI + produção | a4-ci | **APROVADO** | 1 achado **contra o meu próprio trabalho** (Sonar) |
| E | Red team de números | a5-red (1ª tentativa interrompida; 2ª entregou) | **RESSALVA** | 3 números meus **refutados/parcialmente falsos** + 1 classe nova viva (Talk X) |
| F | PoC em Postgres descartável | poc | **CONFIRMADO** | os 2 achados do team chat **reproduzidos com exploit**, com controle negativo que negou |

---

## 2. O que foi CONFIRMADO (as correções funcionam)

### #1265 — policy fraca de reação cross-team `[conferido por mim]`
- A policy fraca `reactions_insert` **não existe mais** (`pg_policies` = 0 linhas); sobrou só
  `team_message_reactions_insert` com
  `WITH CHECK (perfil é o próprio AND is_team_conversation_member(auth.uid(), tm.conversation_id))`.
- `toggle_team_reaction`: `prosecdef=true`, `proconfig={search_path=public}` (pinado), valida
  `not_member` **antes** dos dois ramos e preenche `conversation_id` (coluna NOT NULL que antes
  fazia o ramo `added` estourar).
- **Dado real medido por mim:** `total_reacoes=0`, `autores_nao_membros=0` (2 conversas, 4 vínculos)
  → o fix **não** deixou reação órfã nem invisível na base.
- **Over-closing testado e descartado** (a3-brown, com arquivo:linha): a UI só lista conversas onde o
  usuário tem linha em `team_conversation_members` (`useTeamConversations.ts:17`), o hook de reação
  existe só dentro do `TeamChatPanel` (`useTeamChatPanel.ts:58`) e `team_messages` SELECT exige
  vínculo → **não-membro não tem caminho até o botão de reagir**.

### #1266 — ambiguidade + recursão `[conferido por mim]`
- Assinatura **inalterada** (`p_conversation_id uuid, p_before_id uuid DEFAULT NULL, p_limit integer
  DEFAULT 50`) → nenhum chamador quebra; a linha crua `WHERE conversation_id = p_conversation_id`
  **sumiu** do corpo vivo (a versão `tcm.` está lá).
- `tcm_select_own` = `is_team_conversation_member(auth.uid(), conversation_id)` — **sem**
  auto-referência; nenhuma outra policy recursiva em `team_conversation_members`.
- Helper: `SECURITY DEFINER`, `search_path='public'`, `anon` **sem** EXECUTE.
- **Nuance de valor (a3-brown):** o 42702 era **latente** (a RPC não tem chamador em
  `src/`/edge/cron) → BAIXA; o que tinha impacto real era a **recursão**, que quebrava a lista de
  conversas → MÉDIA, agora fechada.

### #1267 — guards fail-closed `[conferido por mim]`
- `20260930300000_multiplix_guards_fail_closed` **aplicada** no ledger (`multiplix_guards_fail_closed`)
  e o arquivo **está em `origin/main`** (`git ls-tree` = 1). Os dois guards estão **FAIL-CLOSED** em
  produção: `pg_get_functiondef` contém `multiplix_guard_auth_role_undefined`.
- **Nenhum caminho legítimo é fechado** (a3-brown, rastreado por código e catálogo): as 15 RPCs do
  motor são `SECURITY DEFINER` com EXECUTE **revogado** de `authenticated`; as edge functions usam
  `SUPABASE_SERVICE_ROLE_KEY`; o front só faz SELECT; e **os 11 jobs de `cron.job` rodam como
  `postgres`** `[conferido por mim]`.
- Prova no CI do próprio PR #1314 (linha crua do log): o passo rodou
  `retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-rls.test.sh` e imprimiu
  `PASS: Multiplix hardening — ... guarda de mutabilidade (fail-closed por papel real desde #1267) ...`.

### Paridade de produção (Onda 2 + #1314) `[relatado pelo auditor a4]`
- `version.json` de `zapp-web-v2.vercel.app` = `160f34052619a837a5fd00c522a4ca338ff1d2fb` = **merge
  commit do #1314**, ancestral de `main` e contendo #1290/#1294/#1297.
- Snapshot de produção (**381 chunks**) igual ao build local do mesmo commit; **0 diferenças** depois
  de normalizar a cascata de hash do `__ZAPP_BUILD_ID__`; marcadores encontrados no bundle servido:
  `#1297` (`ContactForm-Bo9h-nuy.js`, a mensagem "O endereço foi alterado, mas a localização
  (coordenada) continua a anterior…"), `#1290` (`SuggestionList-DgxH_AzC.js`, `case 'CLEAR'` /
  `rateLimitedUntil`), `#1294` (símbolo `mapa.searchbox-autocomplete` ausente em **todos** os 381
  chunks — que é o resultado esperado do fix).

### CI dos três PRs `[relatado pelo auditor a4]`
- #1309 (`b4581381`) e #1313 (`9d37567e`): **todos** os checks `pass`, 1 run por workflow, sem rerun.
- #1314: único não-verde era o `🎭 E2E` (durou 19m49s) — fila/duração do job, **não** defeito meu.
- Os 3 testes de contrato estão **ligados** ao CI (passos no `db-guard.yml` do commit certo, com
  número de linha); **476 linhas `[PASS]`** no log, 0 falha real.
- Sem `toomanyrequests` / `Data limit exceeded` / `exit 125` nos 3 logs do DB Guard offline.

---

## 3. Achados

### A1 — MÉDIA — `mark_team_conversation_read` escreve recibos cross-team `[conferido por mim]`
**O quê:** `public.mark_team_conversation_read(p_conversation_id uuid)` é `SECURITY DEFINER` com
EXECUTE para `authenticated` e **não checa vínculo** — só `v_profile_id IS NULL`. O corpo vivo
(extraído por mim) insere em `team_message_receipts` as linhas de **todas** as mensagens de
**qualquer** `p_conversation_id` informado, contornando a policy estrita
`Members can insert own receipts` (que exige `profile_id = current_profile_id() AND membro da
conversa`).

```sql
CREATE OR REPLACE FUNCTION public.mark_team_conversation_read(p_conversation_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_profile_id uuid := public.current_profile_id(); ...
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;   -- só isto
  INSERT INTO public.team_message_receipts(message_id, profile_id, status, delivered_at, read_at)
  SELECT m.id, v_profile_id, 'read', v_now, v_now FROM public.team_messages m
   WHERE m.conversation_id = p_conversation_id AND m.sender_id <> v_profile_id AND NOT EXISTS (...)
  ON CONFLICT (message_id, profile_id) DO UPDATE SET status='read', read_at=v_now;
  UPDATE public.team_conversation_members SET last_read_at = v_now
   WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;
END; $function$
```

**Impacto (limitado, medido):** o `ON CONFLICT` só toca linhas do **próprio autor**, e a função não
retorna dados → não há como sobrescrever recibo alheio nem ler conteúdo; o efeito é poluir/forjar os
próprios recibos e contadores de leitura para conversas das quais o chamador não participa.
**Classe:** mesma família do #1265 (policy endurecida + **função DEFINER que a contorna**).
**Precondição:** conhecer o UUID da conversa (a policy de SELECT de `team_conversations` não entrega
conversas de terceiros a um não-membro).
**Prova pendente:** exploit de ponta a ponta em Postgres descartável com JWT de dois times
(em execução — frente `poc`).

### A2 — MÉDIA — `tcm_insert_member` deixa um membro inscrever qualquer perfil `[conferido por mim]`
**O quê:** `WITH CHECK` = *"o inseridor é membro daquela conversa"* **OU** *"o inseridor é
admin/supervisor"*. Não há nada restringindo **quem** pode ser inserido: qualquer membro pode trazer
para dentro da conversa **qualquer perfil**, sem ser admin.
**Impacto:** um membro comum amplia a audiência do time — o perfil que ele inscrever passa a ler as
mensagens do time e a reagir. Vetor de exposição **para fora**, controlado por não-admin.
**NÃO é bypass do meu #1265** (testei os dois contornos): (i) auto-inscrição cross-team é barrada
(a 1ª branch exige que o *inseridor* já seja membro daquela conversa); (ii) auto-promoção a admin é
barrada pela policy `Block sensitive field changes by non-admins`, que obriga
`role`/`access_level`/`permissions`/`is_active` **inalterados** para não-admin.
**Varredura da classe (feita por mim):** das 5 policies de INSERT do team chat, **4 estão
corretamente escopadas** (`team_messages`, `team_message_receipts`, `team_message_reactions`,
`team_conversations`) e `tcm_insert_member` é a **única outlier**.
**Dissenso registrado:** o auditor a1 classificou este item como BAIXA; eu mantenho MÉDIA porque o
efeito é conceder leitura de mensagens do time a um terceiro escolhido por um não-admin.

### A3 — BAIXA — harnesses sem asserção nomeada e sem cobertura do `search_path` (a2-mut)
- **#1266:** 2 das 3 mutações morrem **sem linha `[FAIL]`** — o SQL mutado aborta o script
  (`set -Eeuo pipefail` + `expect_value_as` que faz `actual="$(...)"`) e sai com o erro cru do psql
  (`column reference "conversation_id" is ambiguous` / `infinite recursion detected in policy`). O
  harness **mata**, mas não **nomeia**: a asserção que pegou o defeito não é declarada.
- **#1266:** `RESET search_path` do helper **SOBREVIVEU** (exit 0) → dimensão sem cobertura.
- **#1267:** a asserção do dono `postgres` no passo (3) é **redundante** — a mutação que nega
  `postgres` morre antes, em `F11b` (porque `sweep_multiplix_stuck_recipients` é DEFINER do
  `postgres`); só `service_role` chega ao passo (3).
- **#1267:** o harness aplica a migration **duas vezes** → exige DDL idempotente (a minha é; um DDL
  não idempotente geraria falso-morto por arte da mutação).

### A4 — BAIXA — 4 de 44 testes de contrato não rodam no CI `[conferido por mim]`
`comm` entre `scripts/db-audit/*.{test.sh,py}` e o que o `db-guard.yml` invoca, em `origin/main`:
`ai-block03-vocabulary-contract.test.sh`, `mapa-f1-address-contract.test.sh` (**contrato de endereço
da Onda 2 — trabalho meu**), `multiplix-send-mutation.py` (runner de mutação **manual** do worker
edge; **não toca os guards** — grep = 0), `talkx-settings-rls.test.sh`. Regressão nesses módulos
passa invisível.

### A5 — MÉDIA (contra o meu trabalho) — o meu #1314 estourou o gate de duplicação do `main` `[conferido por mim]`
Série do SonarCloud no branch `main` (API pública, sem token):

| análise | revisão | `new_duplicated_lines_density` | status |
|---|---|---|---|
| 17:45 | `9d37567e` (meu #1266) | 2,8 | OK |
| 17:57 | `92e884ee` (antes do #1314) | 2,8 | OK |
| **18:18** | **`160f3405` (meu #1314)** | **3,1** | **ERROR** |
| 18:34 | `d3ed11cb` (merge posterior) | 3,4 | ERROR |

`/api/measures/component` do meu arquivo:
`supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` → **`duplicated_lines_density`
= 47,3%** (80 de 169 linhas). Causa: o corpo dos dois guards é quase idêntico (só o preâmbulo difere),
e o Sonar conta duplicação **dentro do mesmo arquivo**. A métrica cruzou o limite **no meu merge**, e
a ordem de grandeza bate (≈0,3% de 49.758 linhas ≈ 149 linhas; o meu arquivo carrega 80).
Atribuição: **provável, não exata** — o denominador é a janela inteira de New Code.
Nota: a condição `new_reliability_rating` (C contra A) é **pré-existente** (presente nos 4 merges da
janela, inclusive nos que não são meus) e não é minha.

### A6 — BAIXA — duas afirmações minhas erradas no corpo do PR #1314
1. **"17 funções Multiplix citam `auth.role()`"** → o catálogo mede **15** (13 RPCs + 2 triggers).
2. O texto sugere que a auditoria fechou "os guards" — o certo é: 13 RPCs já eram FAIL-CLOSE e **só
   os 2 triggers** eram FAIL-OPEN. A proporção "15 fail-close / 2 fail-open" do corpo está correta,
   mas o total não.

### A7 — BAIXA — resíduos de robustez do #1266 (a1)
- `get_team_messages_page` ordena por `created_at` **sem desempate** → paginação instável em empate
  de timestamp.
- `p_limit` não é barrado para valores negativos.
- `conversation_id` da reação não é validado contra a `message_id` (a FK existe, mas nada força a
  coerência entre os dois).

### A8 — BAIXA (método) — o sandbox dos auditores dentro do workspace contamina a medição seguinte `[conferido por mim]`
Os auditores extraíram **cópias inteiras do repositório** dentro do `.tmp/` do meu workspace
(`.tmp/a4-ci` = 994 MB, `.tmp/a4-build` = 880 MB, `.tmp/a2-mut` = 92 MB, `.tmp/a2-pristine` = 68 MB,
`.tmp/a4-build-head` = 124 MB). O `.tmp` é ignorado pelo git, mas **não** pelo ESLint, que varre o
filesystem: o ratchet de lint passou a medir `atual=5053` contra `baseline=971` → `novas=4105` e
**falhou**. Removidas as cópias (evidência pequena preservada em
`~/hermes-validacao/auditoria-onda3-260930/artefatos/`), a re-medição na árvore limpa deu
**`baseline=971, atual=948, mantidas=948, removidas=23, novas=0` → OK**, idêntico ao CI.
**Não havia regressão de lint** — o "vermelho" era sonda de auditoria. Lição: quem audita em
`.tmp` do workspace da tarefa precisa limpar antes que o coordenador meça um gate de árvore.

### A9 — ALTA — os **dois guards do Talk X estão FAIL-OPEN em produção** `[conferido por mim]`
`enforce_talkx_campaign_mutability` (guarda `talkx_campaigns`) e
`enforce_talkx_recipient_snapshot_mutability` (guarda `talkx_recipients`) têm **exatamente** o
predicado do defeito do #1267:

```sql
IF COALESCE(auth.role(), '') <> 'authenticated' THEN
  RETURN COALESCE(NEW, OLD);
```

Medido no canônico hoje: **os dois FAIL-OPEN**. É o mesmo defeito do #1267 **vivo, em outro módulo**,
sem correção. (O red team também mediu que o "~63 ocorrências" que eu estimei era escopo misturado:
são **44** ocorrências em **24** migrations não-Multiplix, das quais **39 são fail-CLOSE (ruído)** e
apenas **5 são fail-open**, todas do Talk X — com **2 ainda vivas**.)

### A10 — MÉDIA — `transfer_team_conversation_department` sem checagem de vínculo `[conferido por mim]`
`SECURITY DEFINER`, `EXECUTE` para `authenticated`, e **não cita** nem `team_conversation_members`
nem `is_team_conversation_member`. Vale como **candidato a MÉDIA** (mover uma conversa de
departamento sem pertencer a ela), **com ressalva declarada**: o red team diz que o corpo exige papel
global admin/supervisor — se for isso, o alcance está restrito a esses papéis e a severidade cai para
BAIXA. **Não li o corpo inteiro** (só os predicados de ACL/vínculo), então trato como candidato, não
como confirmado.

### A11 — MÉDIA/ALTA — divergência repo↔produção na policy de recibos `[conferido por mim]`
Histórico no `origin/main`:
- `20260927270005` (E14) cria `Members can insert own receipts` só com o próprio perfil;
- `20260927270016` (E26 "fix_receipt_insert_policy") **endurece**: próprio **+** vínculo de time;
- `20260928430000` **recria a policy FRACA**: `WITH CHECK (profile_id = current_profile_id())`,
  **sem** vínculo;
- `20260930260000` (minha) **só comenta** — não toca a policy.

Em produção a policy está **ESTRITA** (semântica do E26, `profile_id = current_profile_id() AND
EXISTS (membro)`). Logo: **replay do repo a partir do zero termina na versão FRACA; produção tem a
ESTRITA.** E **nenhum harness assere essa policy** (`git grep "insert own receipts" scripts/` = vazio)
→ a divergência é invisível no CI. Consequência real: um ambiente reconstruído a partir do repo
(staging, reconciliação ou squash) recebe a policy fraca e **reabre a classe de furo que o #1265
fechou** para reações. A origem da versão estrita em produção **não é rastreável** pelas migrations
do repo.

---

## 4. Falsos positivos que a auditoria derrubou (inclusive dos próprios auditores)

| Afirmação | Origem | Veredicto | Prova |
|---|---|---|---|
| "**CRÍTICA**: DDL de produção alterado no meio da auditoria; commit do #1267 fora de `origin/main`; divergência repo×produção" | a1-db | **REFUTADA** | `git ls-tree origin/main` acha o arquivo (=1) e o ledger tem `20260930300000|multiplix_guards_fail_closed`. O `9845569d` do branch não ser ancestral de `main` é o **artefato normal do squash merge** (o squash é `160f3405`). O auditor mediu antes do merge das 18:18:16Z e não refez o `fetch`. O apply pós-merge é o **fluxo desenhado** (classe contrato), não um desvio. |
| "Ele mesmo: duas policies de DELETE e duas de SELECT em `team_message_reactions` = mesmo padrão do #1265 (OR)" | líder (hipótese inicial) | **NÃO É FURO** | Predicados medidos: as **duas** de DELETE são *a própria reação* (`profile_id = current_profile_id()` / `p.user_id = auth.uid()`) e as **duas** de SELECT **exigem vínculo**. Redundantes, não exploráveis. |
| "O banco caiu / o gateway está fora" | líder (ao ver 522/503) | **PARCIAL** | Era `RESTARTING` do projeto (ver §5), com a borda respondendo 401 em <0,1 s. O `status.supabase.com` marcava `minor / Partially Degraded Service`. |

---

## 5. Evento de produção observado (não causado por esta sessão)

Entre **18:45Z e 18:53Z** o projeto `tnnnlkbymytvtqngbbqh` esteve em `RESTARTING`: SQL devolvendo
`HTTP 522`, `HTTP 503 (PGRST002 — could not query the database for the schema cache)` e
`FATAL: 57P03: the database system is shutting down`. No mesmo momento: borda respondendo `401` em
0,09 s, `/auth/v1/health` `401` em 0,09 s, site publicado `200` em 0,19 s, e o status oficial da
Supabase em **degradação parcial**. Nada foi reiniciado, corrigido ou "consertado" por mim — o
registro é só para o histórico (e explica os fails de `Contrato DB vivo` daquela janela).

---

## 6. Cobertura de prova por correção

| Correção | Prova de comportamento | Prova de que o teste tem dentes | Estado em produção |
|---|---|---|---|
| #1265 | harness `team-reaction-membership` 14/14 + policies no canônico | **morte nomeada** nos 2 sentidos (fix enfraquecido e exagerado) | aplicada; policy fraca extinta |
| #1266 | harness `team-chat-rpc-ambiguity` 17/17 + corpo vivo qualificado | morre, mas **sem nome** em 2 de 3 | aplicada; recursão morta |
| #1267 | harness `multiplix-rls` PASS no CI (476 `[PASS]`) | **morte nomeada** nos 3 mutantes, incl. o par "exagerado" | aplicada; 2 guards FAIL-CLOSED |
| Onda 2 (front) | — | — | **paridade de bundle provada** (381 chunks, 0 diffs) |

---

## 7. Fila de follow-ups proposta (cada um vira etapa própria, um PR por item)

1. **ALTA** — os **dois guards do Talk X** (`enforce_talkx_campaign_mutability` sobre `talkx_campaigns`
   e `enforce_talkx_recipient_snapshot_mutability` sobre `talkx_recipients`) ainda são FAIL-OPEN em
   produção: mesmo defeito do #1267, outro módulo, correção idêntica (papel real primeiro, erro
   depois) + o mesmo tipo de prova.
2. **ALTA/MÉDIA** — `mark_team_conversation_read`: exigir vínculo via `is_team_conversation_member` +
   teste de regressão. **O exploit já foi reproduzido em Postgres descartável** (recibos de um perfil
   de outro time criados por RPC, com o insert direto barrado pela RLS como controle negativo) — o
   PoC vira o teste.
3. **MÉDIA/ALTA** — `tcm_insert_member`: exigir admin/supervisor para inserir **outro** perfil
   (mantendo o auto-insert legítimo). Reproduzido: um membro comum inscreveu um terceiro.
4. **MÉDIA/ALTA** — divergência repo↔produção da policy `Members can insert own receipts`: o repo
   termina na versão **fraca** (`20260928430000`) e produção está estrita. Fechar a lacuna com uma
   migration que fixe a versão estrita **e** um teste de contrato (hoje nenhum harness a assere).
5. **MÉDIA** — revisar `transfer_team_conversation_department` (DEFINER sem vínculo): ler o corpo
   inteiro e decidir se o papel global admin/supervisor basta.
6. **MÉDIA (autor: eu)** — reduzir a duplicação intra-arquivo da migration `20260930300000`
   (80/169 linhas) que levou o `new_duplicated_lines_density` do `main` de 2,8% para 3,1%
   (limite 3%). Caminho: extrair o predicado comum para **uma** função auxiliar chamada pelos dois
   triggers — os harnesses atuais provam que o comportamento não muda.
7. **BAIXA** — nomear as asserções do harness do #1266 (2 mutações morrem sem `[FAIL]`) e cobrir o
   `search_path` do helper.
8. **BAIXA** — ordenar `get_team_messages_page` com desempate (`created_at, id`) e barrar `p_limit`
   negativo.
9. **BAIXA** — validar `conversation_id` da reação contra a `message_id`.
10. **BAIXA** — ligar ao CI os 4 testes de contrato órfãos (prioridade: `mapa-f1-address-contract`,
    que é o contrato do fix de endereço da Onda 2), e criar teste de CI para a trava de escalada de
    privilégio em `profiles` (hoje sem teste).
11. **Documentação/correções minhas** — "17 funções" → **15** (13 RPCs + 2 triggers); "~63
    ocorrências" → **44 ocorrências / 24 migrations, das quais só 5 fail-open**; e a frase "nem em
    `scripts/`" sobre chamadores de `get_team_messages_page` é **falsa** — o meu próprio
    `scripts/db-audit/team-chat-rpc-ambiguity.test.sh` chama a RPC.

**Fora do meu escopo (dono identificado, não é meu):** o PR **#1306** (sessão paralela) tem duas
migrations em `origin/main` **fora do ledger** (`20260930240000_cron_secret_dedicado_l5`,
`20260930250000_reschedule_cron_secrets_l5`) com `PENDENTE_POS_MERGE` — e o `cron.job` (jobs 4, 8 e
12) **ainda usa a `zapp_anon_key`**, corroborando que o L5 não foi aplicado. Não é meu para aplicar.

**Residual ACEITO pelo usuário (inalterado, baixo):** os *default privileges* do `supabase_admin`
ainda concedem `anon` em f/r/S — sem caminho de fix (migrations e SQL Editor rodam como `postgres`
não-membro de `supabase_admin`). Nenhuma ação.

---

## 8. O que NÃO foi verificado (declarado, não maquiado)

- **Exploit de ponta a ponta** dos achados A1 e A2 em Postgres descartável com JWT de dois times —
  em execução na frente `poc`; até fechar, a severidade de A1 é baseada em leitura do corpo vivo +
  catálogo, **não** em execução.
- **Recursão em runtime** de `tcm_insert_member` (exigiria INSERT real) — a análise é estática.
- **Autoria exata** do breach de duplicação do Sonar (a atribuição é provável, não exata).
- **Red team de números (frente E):** o primeiro agente foi interrompido sem entregar relatório; a
  frente foi re-despachada. Os números que eu publico foram medidos **por mim**:
  - ratchets na árvore limpa: lint `novas=0`, typecheck `OK`, implicit-any `0` (baseline 0) `[conferido por mim]`;
  - suíte (`bunx vitest run`, 345 arquivos): rodada 1 = `1 failed | 4529 passed | 40 todo`,
    rodada 2 = `exit 0` sem nenhum `FAIL`, rodada 3 = `345 passed (345)` / `4530 passed | 40 todo`
    (**idêntico ao CI**), com `load average` = 14,7 na rodada 3 e a máquina sob 5 auditores +
    containers na rodada 1 → **falha intermitente sob carga, não regressão**. O nome do teste que
    falhou na rodada 1 **não foi capturado** (o `grep` pegou só o resumo) — declarado como lacuna,
    não maquiado.
- **`new_reliability_rating` = C** no `main`: pré-existente, não investiguei a origem.
