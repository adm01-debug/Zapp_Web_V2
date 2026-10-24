# Reverificação dos 11 achados "Reverificar" — Zapp Web V2 (04/10/2026)

Os 11 achados do GPT (`FINDINGS.json`, baseline `2e7cf81c`) cujos arquivos de evidência mudaram depois da auditoria. Cada um foi conferido no código atual (`origin/main` = `7a1585279`) e, quando envolve banco, no banco de produção `tnnnlkbymytvtqngbbqh` pelo `zapp-db-ler` (só leitura, ~15:05 UTC). Nada foi alterado.

## Resultado

| ID | Sev | Assunto | Veredito |
|---|---|---|---|
| OTH-004 | P1 | Exportação do Catálogo pode omitir produtos com nome empatado | **DE_PE** |
| IA-WEBHOOK-001 | P1 | Webhook ElevenLabs aceita replay e não confere falha do insert | **DE_PE** |
| IA-EGRESS-001 | P1 | Endpoint e nome do secret de IA configuráveis sem vínculo seguro | **DE_PE** |
| TC-003 | P1 | Membership do Team Chat sem bootstrap/último dono; grants largos | **DE_PE** |
| TC-004 | P1 | RPCs de sair/remover do Team Chat usam coluna `role` inexistente | **DE_PE** |
| OTH-007 | P2 | Filtro "Novidades" do Catálogo ignora a janela de 30 dias | **DE_PE** |
| TX01 | P2 | Placar STATUS do Talk X V4 defasado e medido por commit | **PARCIAL** |
| TX03 | P2 | X047: adoção dos estados (carregando/erro/vazio) incompleta | **PARCIAL** |
| TRA-008 | P2 | types-sync com gates e recuperação imprecisos | **PARCIAL** |
| SV-003 | P2 | Matriz visual SalesView: "cheio" idêntico ao "vazio" e referências faltando | **DE_PE** |
| TC-008 | P2 | Convites de departamento e vocabulário de auditoria legados | **DE_PE** |

**Total: 8 DE_PE, 3 PARCIAL, 0 CORRIGIDO.** Nos 8 achados DE_PE, o commit que mexeu no arquivo de evidência tratou de outra coisa. Na maioria foi a regeneração do `schema-manifest.json`/`schema-catalog.json` pelo #1863, que não muda o comportamento do banco.

## Evidência por achado

### OTH-004 — DE_PE
- O arquivo foi mexido só pelo #1875 (CT-19, cabeçalho `x-degraded`), sem relação com a ordenação.
- `supabase/functions/promogifts-catalog/index.ts:389-391` ainda faz `.order(order_by, { ascending }).range(offset, …)`. Não há desempate único (por exemplo, `id`). O padrão continua `name` (l.46).
- `src/components/catalog/catalogExport.ts:170-192` (`collectCatalogExportRows`) só descarta ID repetido (l.183). Não recupera a linha que "pulou" de página.

### IA-WEBHOOK-001 — DE_PE
- A evidência mudou só no `schema-manifest.json` (regenerado, #1863). `elevenlabs-webhook/index.ts` e `_shared/webhook-signature.ts` não mudaram.
- `supabase/functions/elevenlabs-webhook/index.ts:53` faz `await supabase.from('audit_logs').insert({...})` sem ler o `{ error }` e devolve 200 na l.89.
- Banco vivo: `audit_logs` só tem `audit_logs_pkey (id)` e índices não únicos (`created_at`, `action+created_at`, `user_id`). Não há chave de evento/nonce nem gatilho. Uma entrega repetida grava de novo.

### IA-EGRESS-001 — DE_PE
- A evidência mudou só no `schema-catalog.json` (#1863). `_shared/ai-generate.ts` e `_shared/ai-providers.ts` não mudaram.
- `_shared/ai-generate.ts:444-450` e `:525-526` leem `Deno.env.get(provider.api_key_secret_name)` com qualquer nome vindo da tabela. `_shared/ai-providers.ts:108` faz `fetch(params.endpoint, …)` com `Authorization: Bearer` e não valida destino, DNS, redirect nem porta.
- Banco vivo: `ai_providers` só tem PK e FK (nenhum CHECK em `api_key_secret_name`/`api_endpoint`), e a escrita é só de admin (`has_role(auth.uid(),'admin')`). O risco continua exigindo um administrador mal-intencionado ou um erro de configuração, como o achado já dizia.

### TC-003 — DE_PE (confirmado no banco)
- Policy viva `tcm_insert_member`: exige já ser membro **ou** `profiles.role` admin/supervisor. Não exige `member_role='member'`, então a criação de grupo em duas etapas continua sem bootstrap.
- Policy viva `tcm_delete_own_or_admin`: deixa o usuário apagar a própria linha sem proteger o último dono.
- Grants vivos: `authenticated` tem `UPDATE` (e `INSERT`/`DELETE`/`SELECT`) na tabela `team_conversations` inteira. `src/hooks/team-chat/useTeamChatMutations.ts` não mudou.

### TC-004 — DE_PE (confirmado no banco)
- As definições vivas de `leave_team_group` usam `SELECT tcm.role INTO v_role`, `FILTER (WHERE tcm.role = 'owner')` e `SET role = 'owner'`. As de `remove_team_member` usam `tcm.role` duas vezes.
- As colunas vivas de `team_conversation_members` são `id, conversation_id, profile_id, joined_at, last_read_at, is_muted, is_pinned, is_archived, member_role`. **Não existe `role`**, então sair do grupo e remover membro dão erro.
- Nenhuma migration depois da `20260929430000_team_chat_e46…` redefine essas RPCs.

### OTH-007 — DE_PE
- `src/components/catalog/catalogExport.ts:157`: o filtro `new_30d` vira só `{ is_new: true }`.
- `supabase/functions/promogifts-catalog/index.ts:357`: `if (is_new) q = q.eq("is_new", true)`. Não há ramo por `created_at` e `new_or_recent` não aparece em `src/` nem em `supabase/` (`git grep` vazio).

### TX01 — PARCIAL
- **Feito:** `docs/talkx/v4/STATUS.md` foi regenerado pelo #1713 (`2869fc286`, 04/10 12:30) e mostra **42 de 200**. Isso bate com os 42 marcadores `(Xnnn)` distintos nos commits da main. Depois dele não entrou commit Talk X, e o CI roda `v4-status.mjs --check --ref origin/main` (`ci.yml:198`).
- **Falta:** `scripts/talkx/v4-status.mjs` não mudou. A conta continua sendo "commit com `(Xnnn)` no título", sem checar o critério de pronto. X047 (6 commits, parcial) e X057 (só o schema, #1706; X057b pendente pela decisão da caixa) contam como etapas inteiras.

### TX03 — PARCIAL
- **Feito:** o `TalkXQueryBoundary` foi criado (#1837) e adotado em 5 telas: Settings (#1877), Templates (#1880, `TalkXTemplates.tsx:123-146`), Suppression (#1881), Segments (#1883) e Analytics (#1885).
- **Falta:** `src/components/talkx/TalkXView.tsx:223` ainda mostra o texto legado "Carregando campanha…". Overview, CampaignScheduled e LiveMonitor não usam o boundary (ver também R2-MOD-036, PARCIAL).
- São 5 usos reais, abaixo dos ≥ 9 do critério de aceite. A matriz de testes continua testando o kit isolado (`kit/__tests__/talkxStates.matrix.test.tsx`), sem teste por tela.

### TRA-008 — PARCIAL
- **Feito:** o #1439 (`cd8b09030`) trouxe o debounce E17 (`types-sync.yml:63-98`) e a negação de paths E18.
- **Falta:** o Gate 3 continua contando linhas removidas (`types-sync.yml:385`, `REMOVED -gt 10`) e continua com o `force_gate3` (l.43, 381). A aprovação de runs filtra só `head_sha` + `status: action_required`, sem `head_branch` (l.551-557). Não há política explícita de merge para o PR gerado.

### SV-003 — DE_PE
- O documento foi mexido pelo #1878, que só acrescentou a medição de contraste no alto-contraste e um PNG novo.
- Em `origin/main`, `02-salesview-vazio.png` e `03-salesview-cheio.png` têm **o mesmo blob** (`d4c0e636…`), ou seja, continuam idênticos.
- `00-antes-barra.png` e `00-antes-sidebar.png` não existem em `docs/design/salesview-journey/`.

### TC-008 — DE_PE (confirmado no banco)
- RPCs vivas: `create_department_invite(p_department_id, p_max_uses, p_expires_hours)` (assinatura antiga) gera o código com `base64` e grava em `details`. `accept_department_invite(p_code)` usa o status `'used'` e também grava `details`.
- CHECK vivo `department_audit_logs_action_check` com os **12 verbos legados** (`accept_invite`, `create_invite`, `join_department`, …).
- Grants vivos: `authenticated` tem INSERT/SELECT/UPDATE/DELETE em `department_invites` e `department_invitations`. O front segue em `department_invites` (`src/hooks/team-chat/useDepartmentManagement.ts:93, 129, 151`).

## Consultas usadas (todas só leitura)
- `pg_indexes` / `pg_trigger` de `public.audit_logs`
- `pg_policies` e `pg_constraint` de `ai_providers`; `information_schema.columns`
- `pg_policies` de `team_conversation_members`; `information_schema.role_table_grants` de `team_conversations`, `department_invites` e `department_invitations`
- `regexp_matches(pg_get_functiondef(oid), …)` em `leave_team_group`, `remove_team_member`, `create_department_invite` e `accept_department_invite`
- `pg_constraint` (CHECK) de `department_audit_logs`
