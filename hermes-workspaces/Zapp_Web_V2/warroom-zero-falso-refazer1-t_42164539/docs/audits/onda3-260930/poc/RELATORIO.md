# RELATÓRIO — PoC descartável: dois achados de autorização do team chat

- **Data:** 2026-09-30 (Hora oficial do Brasil)
- **Alvo:** achados medidos no canônico de produção do `Zapp_Web_V2`
- **Ambiente:** PostgreSQL 17 descartável (container `postgres:17-alpine`), 1 container por execução
- **Artefato:** `poc/team-chat-two-findings.test.sh` (auto-contido; mesma vida de container dos testes do repo)
- **Saída bruta:** `poc/run-final.log` (exit code 0, todas as asserções passaram)
- **Produção:** NÃO foi tocada. Somente SELECT via MCP read-only (`mcp__zapp_v2_db_ro`).
- **Repo:** apenas lido. `git status` do clone de referência permanece limpo.

## Como o espelho foi montado (fidelidade)

O pré-estado **não** foi copiado dos arquivos de migration — foi reconstruído a partir do
**canônico de produção** (`pg_policies` + `pg_get_functiondef`), porque o repositório e a
produção divergem em pelo menos um ponto relevante (ver "Divergência encontrada").

Fontes de produção usadas (SELECT read-only, 2026-09-30):

- Policies reais de `team_message_receipts`, `team_conversation_members`, `team_conversations`;
- Corpos reais de `mark_team_conversation_read`, `current_profile_id`,
  `is_team_conversation_member`, `is_admin_or_supervisor`;
- Grants reais de `authenticated` nas 4 tabelas;
- Colunas reais (ex.: `team_message_receipts.conversation_id NOT NULL`).

Confirmações de produção que sustentam os achados:

- `mark_team_conversation_read` é `SECURITY DEFINER`, `proacl` inclui
  `authenticated=X/postgres`, e o corpo só checa `v_profile_id IS NULL` → **sem vínculo**.
- Policy `Members can insert own receipts` (INSERT, `{authenticated}`) tem
  `WITH CHECK = (profile_id = current_profile_id()) AND EXISTS (... membro da conversa ...)`
  → **estrita** (produção tem a versão estrita, não a fraca de `20260928430000`).
- Policy `tcm_insert_member` (INSERT) tem
  `WITH CHECK = EXISTS(membro da conversa) OR EXISTS(profiles.role IN ('admin','supervisor'))`
  → **membro sem papel de admin pode incluir terceiro**.

### Divergência encontrada (importante)

O **arquivo de migration** `20260928580000_team_chat_e22_team_conversation_members_policies.sql`
define `tcm_select_own` como um `EXISTS` **auto-referente** sobre `team_conversation_members`.
A **produção** tem `tcm_select_own USING (is_team_conversation_member(auth.uid(), conversation_id))`.

Espelhar a versão do arquivo produziu `ERROR: infinite recursion detected in policy for
relation "team_conversation_members"` no controle negativo. A versão de produção (usada na
rodada final) não recursa. Isto é evidência de que **o arquivo de migration do repo não é
fiel à produção** para essa policy — achado colateral, útil para a auditoria de drift.

## ACHADO (1) — `mark_team_conversation_read` escreve recibos cross-team

**Verdict: CONFIRMADO** (exploit executou; controle negativo negou corretamente).

Cenário: perfil **A (ATILA)** membro só do Time A; Time B tem 2 mensagens de **BETO**.
A chama a RPC passando o UUID do **Time B** (do qual não é membro).

Comando (sessão `authenticated` + claims normais do app):

```sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',false);
SELECT public.mark_team_conversation_read('e0000000-0000-0000-0000-00000000000b'); -- Time B
```

Saída bruta (exit 0):

```
recibos_de_A_no_TimeB_antes=0
saida crua (exit=0): {"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}
[PASS] 1.exploit: a RPC retornou exit 0 (sem not_member/not_authenticated)
recibos_de_A_no_TimeB_depois=2
[PASS] 1.1 (EXPLOIT) A criou recibos no Time B do qual NAO e membro (2 mensagens de B)
[PASS] 1.2 recibos nascem com status=read
```

→ **2 linhas novas** em `team_message_receipts` para o perfil A numa conversa da qual ele
**não é membro**, contornando a policy estrita (a RPC é `SECURITY DEFINER`, não passa por RLS).

**Controle negativo (teve de negar) — PASSOU:**

```sql
INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at)
VALUES ('d0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-000000000001','read',now(),now());
```

```
[PASS] 1.neg1 insert DIRETO de recibo no Time B (caminho PostgREST) e barrado pela RLS
[PASS] 1.neg2 o insert direto negado NAO gravou nada
```

(o erro cru é `new row violates row-level security policy for table "team_message_receipts"`).
**O controle nega → o espelho está bem montado**: o buraco é exclusivamente da RPC.

Controle positivo: A chamando a RPC na **própria** conversa cria recibo normalmente
(`[PASS] 1.pos1` / `1.pos2`).

## ACHADO (2) — `tcm_insert_member` deixa um membro inscrever qualquer perfil

**Verdict: CONFIRMADO** (exploit executou; 2 controles negativos negaram).

Cenário: A (membro do Time A, `role='agent'`, **sem** papel admin/supervisor) insere
**CARLA** (perfil de outro usuário, não-membro) no Time A.

```sql
INSERT INTO public.team_conversation_members (conversation_id, profile_id)
VALUES ('e0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-000000000001'); -- CARLA
```

Saída bruta (exit 0):

```
saida crua (exit=0): {"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}
[PASS] 2.exploit: INSERT do terceiro passou (exit 0)
[PASS] 2.1 (EXPLOIT) CARLA virou membro do Time A sem ser admin
[PASS] 2.2 quem inseriu foi ATILA (perfil nao-admin, role=agent)
```

**Controles negativos (tiveram de negar) — PASSARAM:**

```
[PASS] 2.neg1 BETO (nao-membro) tentando se inserir no Time A e barrado pela RLS
[PASS] 2.neg2 o auto-insert negado NAO gravou nada
[PASS] 2.neg3 ATILA inserindo terceiro no Time B (de que NAO e membro) e barrado
[PASS] 2.neg4 o insert alheio negado NAO gravou nada
```

→ A policy não é um buraco aberto: ela exige **ser membro da conversa** (ou admin). O defeito é
que **não exige admin/supervisor para incluir OUTRA pessoa** — basta ser membro para puxar
qualquer perfil (incluindo um supervisor/alvo) para dentro da conversa.

## (C) Alcançabilidade com JWT normal do app + descoberta do UUID

- **Alcançável com as claims normais** de um JWT do app: ambas as ações rodam como
  `authenticated` (confirmado `[PASS] C.4 auth.role() = authenticated`). O front faz
  `rpc('mark_team_conversation_read', ...)` e o INSERT direto em `team_conversation_members`
  via PostgREST — exatamente os caminhos exercitados.
- **Precondição do achado (1):** conhecer o UUID da conversa-alvo. A policy de SELECT de
  `team_conversations` (`Members can view their conversations`, `USING is_team_conversation_member
  OR created_by = ...`) **esconde** a conversa de um não-membro:
  `[PASS] C.1 A só vê 1 conversa` / `[PASS] C.2 Time B não aparece` / `[PASS] C.3 não lista o UUID`.
- **Impacto na severidade:** o achado (1) **não** é um "listar e apagar qualquer time": exige o
  UUID. Mas o UUID circula em canais que este PoC **não** mediu (convites, payloads de
  notificação/realtime, respostas de outras RPCs de inbox/preview, URLs/links). Se qualquer um
  desses vazar o UUID, o exploit fica trivial. Veredito de severidade: **MÉDIO–ALTO,
  condicionado ao vazamento do UUID** — a ser refinado por quem medir esses canais.
- O achado (2) **não** depende de UUID secreto para o alvo realista: o atacante já é **membro**
  da conversa, então **já conhece** o UUID. A precondição extra é apenas conhecer o `profile_id`
  de um alvo (descobrível via `profiles`/diretório). Severidade: **ALTO** dentro do modelo
  (membro sem privilégio escalando composição do time sem passar por admin).

## O que NÃO foi provado / limitações

- Não foi provado que o UUID da conversa seja vazado por algum canal real do app (não estava no
  escopo medir notificações/realtime/invites). O achado (1) fica **condicionado** a isso.
- O espelho usa `postgres:17-alpine` (o mesmo dos testes do repo), não a imagem Supabase exata;
  as definições de RLS/funções foram copiadas da produção, mas diferenças de comportamento de
  extensões do Supabase fora dessas funções não foram exercitadas.
- Triggers de recibos foram incluídos (`team_receipts_fill_conversation_id`,
  `team_receipts_no_own_sender`); outros triggers alheios ao caminho não foram reproduzidos.
- Não se mediu se `is_team_conversation_member` resolve o `profile_id` de forma ambígua quando o
  mesmo `user_id` tem múltiplos perfis (não ocorre no espelho).
- **Achado colateral não investigado a fundo:** a divergência de `tcm_select_own` entre o arquivo
  de migration `20260928580000` (auto-referente, recursa) e a produção
  (`is_team_conversation_member`). Isso é matéria do guard de drift de migration.

## Veredicto por achado

| # | Achado | Verdict |
|---|--------|---------|
| 1 | `mark_team_conversation_read` escreve recibos cross-team sem checar vínculo (SECURITY DEFINER) | **CONFIRMADO** (exploit rodou: +2 recibos no Time B; insert direto negado pela RLS como controle) |
| 2 | `tcm_insert_member` deixa um membro inscrever qualquer perfil na própria conversa | **CONFIRMADO** (exploit rodou: CARLA virou membro do Time A por A, sem admin; 2 controles negativos negaram) |

## Reprodutibilidade

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
POC_DIR=/home/joaquim_ataides/hermes-validacao/auditoria-onda3-260930/poc
TEAM_AUTH_POC_POSTGRES_IMAGE=postgres:17-alpine bash "$POC_DIR/team-chat-two-findings.test.sh"; echo "EXIT=$?"
```

Saída final: todas as asserções `[PASS]`, `EXIT=0`. Container removido no trap; nenhum
container `team-auth-poc-*` residual (`docker ps -a` verificado).

> Nota de execução: o wrapper `scripts/db-audit/retry-disposable-postgres-test.sh` é um shim de
> retry/pré-pull e não pôde ser executado a partir do clone de referência (guard de repo
> read-only). O script do PoC implementa o **mesmo ciclo de vida** de container/`SET ROLE`/
> claims que os testes `*.test.sh` do repo e é auto-contido.
