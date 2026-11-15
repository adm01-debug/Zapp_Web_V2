# claude_05/awesome-ramanujan-ufxolu — OBSOLETA

- `ref`: `origin/claude_05/awesome-ramanujan-ufxolu` · tip `5cc25fbfe` · merge_base `1252bb5a4` (2026-11-01) · último commit 2026-11-08 · 33 commits
- PRs com o mesmo tip: nenhuma. Sem comentário de fechamento, sem triagem anterior.

## Propósito
Sessão de triagem de PRs abertas (01→09/11/2026). **167 arquivos, 100% dentro de `analise-prs/`, nenhuma linha de código, migration, edge ou workflow** (`git diff --stat 1252bb5a4 origin/claude_05/awesome-ramanujan-ufxolu`: 167 files, 5440+/465-). Conteúdo: 162 dossiês `PR-NNNN.md` (#2417–#2883), `RELATORIO_FINAL.md`, `RELATORIO_PRS.md`, `baseline/`, `prs.json`/`prs.csv`/`progresso.json` e `regras-de-negocio.md`.

Todos os commits são `chore(analise-prs)`/`docs(analise-prs)` — diário de sessão, não produto.

## Por que o alvo não existe mais na `main`

| Fato | Evidência |
|---|---|
| A geração anterior de `analise-prs/` (198 arquivos no merge_base) foi **arquivada de propósito** como prosa morta | `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)` — criou `docs/_arquivo/analise-prs/` (211 arquivos hoje: `git ls-tree -r --name-only origin/main \| grep -c 'docs/_arquivo/analise-prs/'`) |
| `analise-prs/` foi **regenerado** depois, com outra convenção (`dossies/pr-NNNN.md` minúsculo) e outro escopo | `0575bc510 (#2617)` "entrega analise-prs/ — 294 PRs analisadas", `37822ce6f (#2752)`, `d084ca753 (#3063)`. Hoje: 37 arquivos |
| O relatório vivo é de 11–12/11, posterior à branch | `git show origin/main:analise-prs/RELATORIO_PRS.md:1` — "sessão de 11–12/11/2026", main de referência `bd62fc9d9`; `progresso.json` → `"atualizado": "2026-11-12T08:20Z"` |
| As PRs da branch que **ainda estão abertas** já têm dossiê **mais novo e mais fundo** na main | branch `PR-2881.md` = 20 linhas de checklist mecânico ("ELEGIVEL (AGUARDANDO_CI)"); main `analise-prs/dossies/pr-2881.md` = veredito + verificação adversarial + correção passo a passo + evidência (`fb36e30fc`/#2922, `a5bf6399e`/#2928). Mesma relação para 2555, 2556, 2813, 2818, 2838, 2846, 2856, 2859, 2869, 2879, 2880, 2883 |
| O resto dos dossiês trata de PRs encerradas (main já passou de #3063) | `analise-prs/RELATORIO_PRS.md` da main lista as 30 PRs do ciclo atual; nenhuma das #2417–#2558 |
| 13 dos 167 arquivos já existem por basename no arquivo morto | ex.: `docs/_arquivo/analise-prs/dossies/PR-1930.md`, `PR-2078.md`, `docs/_arquivo/analise-prs/baseline/BASELINE.md` |

Natureza do conteúdo: os dossiês registram **estado transitório** ("auto_merge ativo", "mergeable_state=blocked", "CI queued desde 23:23 UTC de 08/11", "aguardar Joaquim"). Valor expira com o estado. Exemplo: `analise-prs/baseline/BASELINE.md` da branch documenta "CI gate QUEBRADO — PR #2550 sobrescreveu TalkXCampaignReport.test.tsx" — problema resolvido desde então (a main tem o arquivo de teste íntegro e o relatório de 12/11 não o menciona).

## Único arquivo com conteúdo durável: `analise-prs/regras-de-negocio.md`

Divergência de propósito, não de versão:
- **branch** (269 linhas): regras de **domínio do produto** em 14 seções, extraídas do código com `arquivo:linha` (contatos, FSM de conversa, `enqueue_outbound_message`, campanhas TalkX, autorização, convites, tasks, SLA, tipos WhatsApp, conexões, B·R·I·N·D·E, E40, token de inbox, papéis).
- **main** (53 linhas): regras de **merge de PR** (critérios, Regra 8, método de merge). `git show origin/main:analise-prs/regras-de-negocio.md`.

O caminho foi reaproveitado de propósito para outra coisa. A necessidade (referência de regras de domínio para agentes) é coberta hoje por documentos **mantidos e mais novos**:

| Seção da branch | Onde vive hoje na main |
|---|---|
| 1 Contatos (D4, `contact-show-legacy`) | `docs/agentes/regras-dominio.md:13` ("Contatos — critério de contato visível (decisão D4)"); `docs/contexto/regras/manual/regras.md` §8 |
| 2 Conversas / FSM | `docs/contexto/regras/manual/regras.md` §4.1 — mais rica e mais nova (inclui `conversation_waiting_cannot_be_archived`, migration `20261113171300`, PR #3037) |
| 4 Campanhas TalkX | `docs/contexto/regras/manual/regras.md` §6 (consentimento, 500/dia, horário comercial, legado fora da audiência); `docs/talkx/v4/inventario/H_motor_backend.md` (`draft_creation_key`) |
| 5 e 14 Autorização / papéis | `docs/contexto/regras/manual/regras.md` §2 (tabela admin/supervisor/agent, `special_agent` excluído); `docs/ia/IA-004-matriz-autorizacao.md` (inclui `last_admin`) |
| 6 Convites de departamento | `docs/agentes/regras-dominio.md:23`; `regras.md` §8 |
| 7 Tasks | `docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md` |
| 8 SLA de primeira resposta | `docs/adr/ADR-009-arquitetura-sla-canonica.md`, `ADR-010`; `regras.md` §4.1 (15/30 min, push, e-mail 1 h) |
| 10 Conexões WhatsApp | `docs/contexto/regras/manual/regras.md` §4.2 — regra dos três níveis, muito mais completa |
| 11 B·R·I·N·D·E | `docs/copiloto/CV-005-brinde-spec.md` — especificação formal dos 6 campos |
| 12 Relatórios E40 owner-only | `docs/dashboard/README.md:36` (cita as duas migrations) |
| 13 Token `--inbox-panel-bg` | `docs/agentes/regras-dominio.md` §UI |
| 3 Mensagens (jornada) | `docs/JORNADA_MENSAGEM_WHATSAPP.md` §4 (fila = tabela `messages`, `ON CONFLICT (contact_id, client_message_id)`) |

**Resíduo não coberto (valor baixo, documentação):** a lista explícita dos gates de `enqueue_outbound_message` com código de erro. A `main` documenta a jornada e a idempotência, mas não a lista. Hunk, caso alguém queira portar para `docs/JORNADA_MENSAGEM_WHATSAPP.md` (não para `analise-prs/`, cujo caminho tem outro dono hoje):

```markdown
### Envio de mensagem (`enqueue_outbound_message`) — gates
1. `auth.role() = 'authenticated'` e `auth.uid() IS NOT NULL` — 42501
2. `user_has_permission(auth.uid(), 'send_messages') = true` — 42501
3. `is_contact_visible_to_user(contact_id, auth.uid()) = true` — 42501
4. `content` não nulo, `length(content) <= 65536`
5. `message_type IN ('text','image','audio','video','document','sticker','location')`
6. Tipos não-texto exigem `media_url` não nulo (exceto `location`)
7. `media_url` deve começar com `https://`
8. Conexão WhatsApp com `status = 'connected'` e `instance_id` não nulo
Escopo: não-admin só envia por conexão de fila da qual é membro ativo (`whatsapp_connection_out_of_scope`).
Idempotência: `ON CONFLICT (contact_id, client_message_id) DO NOTHING`; payload divergente → `client_message_id_reused_with_different_payload` (23505).
Fonte citada pela branch: migration 20261010211000.
```
Observação de verdade: a branch cita `20261010211000`; a `main` cita `20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:162` como definição da RPC. **NÃO VERIFICADO** em produção qual migration carrega o corpo atual — não foi necessário para o veredito (é documentação, não código).

Também não coberto: os campos opcionais de `ContactRow` (§1.3) e "`'finished'` NÃO é estado válido de campanha" (§4.1) — ambos são comentários que já vivem no próprio código (`src/types/contact.ts`, `src/hooks/integrations/useTalkXInsights.ts:93`). Valor nenhum como doc separada.

## Veredito
**OBSOLETA.** Zero código. 166 dos 167 arquivos são retrato de estado de PRs de 01–09/11, substituído de propósito na `main` (arquivamento `#2630` + regeneração `#2617`/`#2752`/`#3063`, relatório vivo de 12/11). O único arquivo durável tem o caminho reaproveitado para outro documento na `main` e seu conteúdo está coberto por `docs/contexto/regras/manual/regras.md`, `docs/agentes/regras-dominio.md`, `docs/ia/IA-004-matriz-autorizacao.md`, `docs/copiloto/CV-005-brinde-spec.md`, `docs/dashboard/README.md` e `docs/JORNADA_MENSAGEM_WHATSAPP.md` — todos mais novos e mantidos.

Nada a recuperar. Apagar a branch é seguro.

Método: verifiquei integralmente os 7 arquivos não-dossiê (os 5 `BOTH_CHANGED` + `RELATORIO_FINAL.md` + `baseline/main-1252bb5a-ci-state.md`) e li `regras-de-negocio.md` por inteiro; dos 160 dossiês li 2 na íntegra (`PR-2881`, `PR-1930`) e as amostras de todos os demais no JSON mecânico — mesmo template de checklist, mesma natureza efêmera.

---

## Verificação adversarial

**Veredito: CONCORDO com OBSOLETA. Apagar a branch é seguro.** Tentei refutar por quatro frentes; todas fecharam contra a branch.

### 1. Escopo: zero código, confirmado
`git diff --name-only 1252bb5a4 origin/claude_05/awesome-ramanujan-ufxolu | awk -F/ '{print $1}' | sort -u` → **um único diretório: `analise-prs`**. 167/167 arquivos. Nenhum `src/`, `supabase/`, `.github/`, `scripts/`, `e2e/`. Não existe hunk de código para perder.

### 2. Os 160 dossiês: todas as PRs documentadas estão encerradas (prova ao vivo, não inferência)
Este era o ponto mais frágil da triagem ("as PRs já estão encerradas"). Testei de forma independente:

- 137 dos 159 números de PR da branch **não têm dossiê em nenhum lugar da `main`** (nem em `analise-prs/dossies/`, nem em `docs/_arquivo/analise-prs/dossies/`). Se alguma dessas PRs estivesse aberta, o dossiê da branch seria a única triagem existente — seria lacuna real.
- `github_graphql` em `adm01-debug/Zapp_Web_V2`, `states:OPEN`: **`totalCount = 2`** — apenas **#3139** e **#3140**, nenhuma das duas no conjunto da branch. **Todas as 159 PRs documentadas estão fechadas ou mergeadas.**
- Os 2 únicos números que aparecem tanto nos 137 órfãos quanto no relatório vivo da `main` (`analise-prs/prs.json`) são **#2847 e #2865**, ambos com `estado_final = "MERGEADA por outro agente"` (`7e128bc40` e `71123cc07`).

Um retrato de `mergeable_state=blocked` / `CI queued` / `auto_merge ativo` de 01–09/11 sobre PRs todas encerradas tem valor de recuperação **zero**. Confirmado.

### 3. `analise-prs/regras-de-negocio.md`: conferi a substituição arquivo por arquivo, na linha citada
A triagem alega colisão de caminho + cobertura. Verifiquei as duas pontas:

- **Colisão de caminho é real e não é o mesmo documento.** `git show origin/main:analise-prs/regras-de-negocio.md` = *"# Regras de negócio para merge de PRs — Fonte: CLAUDE.md … Critérios de aprovação para merge automático"*. Nada a ver com regras de produto.
- **O arquivo em `docs/_arquivo/analise-prs/regras-de-negocio.md` (186 linhas) também é outro documento** (congelamento de features, tabela dos 9 fluxos críticos, `app_role` com `special_agent`), não uma versão anterior deste. Então o conteúdo da branch é de fato distinto — e foi por isso que abri a cobertura seção por seção, em vez de aceitar a alegação:

| Seção da branch | Cobertura verificada na `main`/`contexto` | Veredito |
|---|---|---|
| §1.1/§1.2 contato visível + toggle | `docs/agentes/regras-dominio.md:13-22` — mesmos 3 critérios, mesma regex, mesma migration `20260930450000`, **mais** o `localStorage contact-show-legacy`, o `useContactsKpi` e a regra "mudar o critério = mudar os três juntos" | superior |
| §2.1/§2.2 estados e FSM de conversa | `docs/contexto/regras/manual/regras.md` §4.1 + `docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md` | coberto |
| §3.1 gate de escopo de conexão | `docs/ia/IA-004-matriz-autorizacao.md:324` — `whatsapp_connection_out_of_scope` com migration:linha (`20260930200000:102-131`), prova de teste (10 PASS/0 FAIL em Postgres descartável), passo de CI (`db-guard.yml:350-353`) e duas ressalvas de honestidade | **muito** superior |
| §3.1 idempotência | `docs/JORNADA_MENSAGEM_WHATSAPP.md:34,62-66` (`ON CONFLICT (contact_id, client_message_id)`, `:225-236`) + corpo verbatim da função em `origin/contexto:docs/contexto/supabase/functions/public/enqueue_outbound_message__c7a5b59b44f3b3ff.sql` | coberto |
| §4.x TalkX (estados, autorização, audiência, `draft_creation_key`) | `docs/contexto/regras/manual/regras.md` §6 + `talkx_resolve_audience__44896f5169008008.sql` + `tables/public/talkx_campaigns.md` (gerados ao vivo do banco oficial) | coberto |
| §8 SLA de primeira resposta | `origin/contexto:docs/contexto/supabase/tables/public/conversation_sla.md` + `docs/adr/ADR-009-arquitetura-sla-canonica.md` | superior |
| §12 E40 `scheduled_report_configs` owner-only | `docs/dashboard/README.md:36` — e cita **duas** migrations (`20260926113806` + `20260926140000_fix_..._insert_owner_check`); a branch cita só a primeira | superior |
| §13 token `--inbox-panel-bg` | `docs/agentes/regras-dominio.md` §UI — mesma regra, com o precedente do bug | coberto |
| §14 papéis + piso do último admin | `docs/MIGRATIONS.md` e `docs/ia/IA-004-matriz-autorizacao.md` citam `admin_set_role_last_admin_floor`; a migration vive na `main` | coberto |

### 4. Achado que **reforça** OBSOLETA: a branch já está factualmente errada
§11 (B·R·I·N·D·E) da branch afirma os pesos *"B·R·I·N·D·E (0,4), Velocidade (0,3), Sugestões (0,2), Engajamento (0,1)"*. O código de hoje (`git show origin/main:src/hooks/copilot/useConversationScore.ts:23-26`) tem **`weight: 0.4` / `0.25` / `0.2` / `0.15`**. Recuperar esse documento importaria um fato desatualizado para dentro da `main`. Isso derruba a única seção que eu considerava candidata a valor médio.

### 5. Lacunas alegadas pela triagem: confirmo a classificação
- Lista dos 8 gates com códigos de erro — **valor baixo**, concordo. É resumo em prosa de um corpo de função que a `main` já tem verbatim via `contexto`, e o gate que realmente importa (`whatsapp_connection_out_of_scope`) está em IA-004 com prova de teste. O caminho `analise-prs/regras-de-negocio.md` hoje é das regras de merge — escrever ali seria sobrescrever documento vivo.
- Campos opcionais de `ContactRow` e a nota `'finished'` — **valor nenhum**, concordo: ambos são comentários no próprio código.

**Lacuna adicional encontrada: nenhuma.** Não achei um único hunk de valor ≥ médio fora da `main`.

**Conclusão:** veredito OBSOLETA mantido, branch pode ser apagada. Nenhum efeito no produto.
