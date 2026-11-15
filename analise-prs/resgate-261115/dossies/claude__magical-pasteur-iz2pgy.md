# Dossiê — `claude/magical-pasteur-iz2pgy` (PR #2199)

- **tip**: `48ef50d2e090a826629a9ff0899c24effa6ed883` (2026-10-23, 21 commits)
- **merge_base**: `a9ddd2f9a0ec6fc57085ff463db09f2ed7eb9674` (2026-10-23)
- **Pré-classificação mecânica**: MISTO_CONFLITO · 21 arquivos com lacuna · 365 linhas
- **Triagem anterior (2026-11-08)**: OBSOLETA — **confirmada**
- **Veredito**: **OBSOLETA** · confiança **alta** · `apagar_branch_seguro = true`

## Propósito da branch
Lote de correções de CI de 23/10/2026: deixar verde `Unit Tests`, `Contrato DB offline` (DB Guard)
e registrar bloqueios em `PENDENCIAS.md`/`RELATORIO_CI.md`. Não entrega funcionalidade de negócio —
é manutenção de suíte de testes + 1 ajuste de RPC do Talk X (N-095/N-131) e 2 ajustes de hooks
(N-216, HZ5-09) que **a main já tem por outros commits**.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência na `main` |
|---|---|---|
| `PENDENCIAS.md` | OBSOLETA | `origin/main:PENDENCIAS.md:1` = `# PENDÊNCIAS CI — 2026-11-12` (documento substituído por sessão de 12/11) |
| `RELATORIO_CI.md` | OBSOLETA | `origin/main:RELATORIO_CI.md:1-5` = relatório de `fix-ci-workflows-261112-0400` (sessão 12/11) |
| `scripts/db-audit/assume-return-conversation.test.sh` | LACUNA cosmética | `git grep -c OK-MUTACAO origin/main -- scripts/db-audit/` → 0. `.github/workflows/db-guard.yml:603` roda o teste por exit code; não há `grep '[FAIL]'` em nenhum workflow (`git grep -rn "\[FAIL\]" origin/main -- .github/workflows/` → vazio). Resto do diff é whitespace à direita. |
| `scripts/db-audit/cron-secret-l5-contract.test.sh` | LACUNA cosmética | idem (6 relabels). Também traz ruído: `[[  "$output"` (espaço duplo) e troca de modo 644→755. `db-guard.yml:465` roda por exit code. |
| `scripts/db-audit/dashboard-rls-authorization.test.sh` | INCORPORADA e superada | `origin/main:...:134` já aponta `20261016170000_fix_security_definer_search_path.sql` (exatamente o que a branch propôs); `dashboard_kpi` na main avançou para `20261026210000_dashboard_kpi_periodo_aditivo.sql` (`:164`) e a extração `awk` aplica 20261003272707 + 20261007013217 (`:430`, `:443`) |
| `scripts/db-audit/docker-shim` | LACUNA real (baixa) | `origin/main:scripts/db-audit/docker-shim:184` dropa roles sem pular `pg_*`/`postgres`. Mitigado de fato: o `comm -23` compara snapshot antes/depois (roles built-in estão nos dois) e o `DROP ROLE` é `> /dev/null 2>&1 \|\| true`. A main evoluiu a mesma rotina por outro caminho (guardas de snapshot ilegível `:170-173`, `DROP DATABASE` antes das roles `:178`, guarda de listagem `:179-182`). |
| `scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` | OBSOLETA (ruído) | Diff é só reescrita de comentário (`origin/main:...:160` mantém "Gatilhos REAIS, com o corpo vigente") + `[[  ` espaço duplo + perda do bit de execução (main `100755` → branch `100644`) |
| `scripts/db-audit/talkx-campaign-recipients-page.test.sh` | INCORPORADA | `origin/main:...:86` `manual_retry_count integer NOT NULL DEFAULT 0,` e `:93` `CREATE TABLE public.contacts (id uuid PRIMARY KEY, name text, phone text);` |
| `src/components/inbox/__tests__/SummaryResult.test.tsx` | INCORPORADA | `origin/main:...:40` já usa `button.h-8.w-8` |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx` | OBSOLETA (superada) | main resolve a medição no próprio teste: `origin/main:...:50-55` `vi.spyOn(Element.prototype,'getBoundingClientRect')` 600×800 + `Object.defineProperty(Element.prototype,'clientHeight',{get:()=>600})`; o `ResizeObserverMock` segue fixo em 120 de propósito |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.movimento-reduzido.test.tsx` | OBSOLETA (superada) | idem |
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | LACUNA (baixa) | `origin/main:...:139-165` mantém as asserções **sincronas** (`expect(gridClass())...`), sem `await waitFor`. A versão vigente é a da main. NÃO VERIFICADO por execução (o worktree local está em `claude/pr-branch-consolidation-t6nbtc` com arquivos modificados por outros agentes; não rodei vitest para não interferir) |
| `src/components/ui/command-palette.tsx` | INCORPORADA e superada | `origin/main:...:271` `role="listbox" aria-label="Acesso rápido"`; `:296`, `:310`, `:338` `role="option" id={optionId(...)} aria-selected={...}` — cobre os 3 grupos, a branch cobria 1 |
| `src/hooks/auth/useAuth.tsx` | INCORPORADA | `origin/main:...:12` `import { offlineSendQueue } from '@/lib/offlineQueue';` e `:28` `await offlineSendQueue.clear();` (main aguarda; a branch fazia `void`) |
| `src/hooks/chat/useTeamChatNotifications.ts` | INCORPORADA e superada | `origin/main:...:144-152` refs (`notifSettingsRef`, `isQuietHoursRef`, `activeIdRef`); `:161` `.channel(uniqueRealtimeTopic('team-chat-notifications'))` (canal por sessão, mais forte que `:${profile.id}` da branch); `:254` `}, [profile]); // só 'profile' ... (HZ5-09)`. `permissionRef`/`showNotificationRef` da branch ficaram sem alvo: HZ3-001 removeu `usePushNotifications` do caminho e a main usa `showBrowserNotification` (`:227`, `:240`) |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | INCORPORADA | 32 ocorrências de `conversation_status` no teste da main; hook `origin/main:src/hooks/inbox/useInboxBulkActions.ts:192` `.select('id, conversation_status')`, `:198` `previousStatus.set(...)` |
| `src/hooks/inbox/useInboxFilters.ts` | INCORPORADA | `origin/main:...:104-109` `const contactType = typeParam !== null ? normalizeContactType(typeParam) : storedPrefs?.contactType ?? null;` |
| `src/hooks/system/useDiagnosticsData.ts` | INCORPORADA | `origin/main:...:291-293` não lança mais o erro de contagem (comentário explícito) e `:317` `classifyHealth(connectionsCountError ?? dbError, dbLatency, 500, 2000)` — mesmo efeito de N-216, por outro caminho |
| `src/hooks/system/useUserSettings.ts` | INCORPORADA | `origin/main:...:88` `const [isError, setIsError] = useState(false);`, `:110` `setIsError(false)`, `:123-125` `setIsError(true)` + `toast({ title: 'Erro', ... variant: 'destructive' })`, `:326` expõe `isError` |
| `src/hooks/tasks/__tests__/workItemFormat.test.ts` | OBSOLETA — recuperar seria REGRESSÃO | A branch apaga 80 linhas do contrato "regra ÚNICA de datas" (etapa 058/D21) que a main mantém: `origin/main:...:2`, `:49` `expect(formatWorkItemDay(...)).toBe('09 out.')`, `:64`, `:86` (horário de verão real em `America/Sao_Paulo`) |
| `src/hooks/tasks/workItemFormat.ts` | OBSOLETA — CONTRADIZ a main | Branch troca `${pad2(d.getDate())} ${MES_CURTO_PT_BR[d.getMonth()]}` por `dd/mm/aaaa`. `origin/main:src/hooks/tasks/workItemFormat.ts:60` mantém `09 out.` e o teste da main (`:49`) fixa esse formato |
| `src/test/setup.ts` | OBSOLETA (superada) | main mantém `HTMLElement.prototype.getBoundingClientRect` fixo em 600 e adicionou `writable: true` por conta própria (`origin/main:src/test/setup.ts:139-146`); **não** há mock global de `clientHeight`/`clientWidth`. A necessidade é coberta por mock por arquivo de teste (ver `ChatMessagesArea.loop.test.tsx:50-55`) |
| `supabase/migrations/20261010062941_talkx_campaign_recipients_page.sql` | INCORPORADA (de forma correta) | A branch **editou a migration aplicada no lugar** (proibido por `docs/agentes/banco.md`). A main fez por migration nova: `origin/main:supabase/migrations/20261107180000_talkx_campaign_recipients_page_add_segment.sql:15` `p_segment_id uuid DEFAULT NULL`, `:81`/`:90` filtro por segmento. Produção confirma (hoje, `pg_proc`): `talkx_campaign_recipients_page(p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text, p_segment_id uuid)`. Existe ainda `supabase/migrations/_superseded/20261023100000_talkx_campaign_recipients_page_add_segment.sql` — a tentativa de 23/10 foi explicitamente aposentada. **Resíduo**: a busca por `r.contact_id::text` não existe na main (última definição `20261112171000_talkx_recipients_page_aceita_cancelled.sql:193` busca só `c.name`/`c.phone`) |

## Lacunas residuais (todas de valor BAIXO) — hunks para portar sem reler a branch

### 1. `scripts/db-audit/docker-shim` — não dropar roles built-in (ramo `rm)`, após `[[ -z "$role" ]] && continue`, main linha ~183)
```diff
     while IFS= read -r role; do
       [[ -z "$role" ]] && continue
+      [[ "$role" == pg_* ]] && continue  # nunca dropar roles built-in do PostgreSQL (pg_read_all_settings, pg_create_subscription, etc.)
+      [[ "$role" == "postgres" ]] && continue  # superusuário padrão não pode ser dropado
       _svc -d postgres -c "DROP ROLE IF EXISTS \"$role\";" > /dev/null 2>&1 || true
     done < <(comm -23 <(printf '%s\n' "$cur" | sort) <(printf '%s\n' "$old" | sort))
```

### 2. RPC `talkx_campaign_recipients_page` — buscar também por `contact_id`
Exige **migration nova** (a vigente é `20261112171000`). Nas duas cláusulas de busca (`:193` e `:202`):
```diff
-    AND (v_search     IS NULL OR c.name ILIKE '%' || v_search || '%' OR c.phone ILIKE '%' || v_search || '%')
+    AND (v_search     IS NULL OR c.name ILIKE '%' || v_search || '%' OR c.phone ILIKE '%' || v_search || '%' OR r.contact_id::text ILIKE '%' || v_search || '%')
```

### 3. `scripts/db-audit/{cron-secret-l5-contract,assume-return-conversation}.test.sh` — evidência de mutação não imprime `[FAIL]` solto
Padrão repetido (6× em `cron-secret-l5`, 1× em `assume-return`):
```diff
-  printf '[EVIDENCIA] %s\n' "$d3_mut_evidencia"
+  printf '%s\n' "$d3_mut_evidencia" | sed 's/\[FAIL\]/[OK-MUTACAO]/g; s/^/[EVIDENCIA] /'
```
Só legibilidade de log: nenhum workflow filtra `[FAIL]`; a reprovação é por exit code.
**Não portar** o resto do diff desses arquivos (whitespace, `[[  ` com espaço duplo, troca de bit de execução).

### 4. `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` — `await waitFor` nas asserções de grid
```diff
-  it('com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid (Sheet sobreposto)', () => {
+  it('com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid (Sheet sobreposto)', async () => {
-    expect(gridClass()).toContain('grid-cols-5');
+    await waitFor(() => expect(gridClass()).toContain('grid-cols-5'));
```
(idem no caso de 1474 px: `grid-cols-8` antes do clique, `grid-cols-6` depois). Só vale se o teste
estiver instável na main — não há evidência de que esteja.

### 5. `src/test/setup.ts` — mock global de `clientHeight`/`clientWidth`
Abordagem rejeitada de fato pela main (mock por teste). Não portar sem necessidade: mexer no setup
global afeta 700+ arquivos de teste.

## O que NÃO recuperar (regressão se portado)
- `src/hooks/tasks/workItemFormat.ts` + `__tests__/workItemFormat.test.ts`: a branch troca o rótulo
  de data de `09 out.` para `09/10/2026` e apaga 80 linhas do contrato de datas do módulo Tarefas
  (etapa 058/D21), incluindo os casos de horário de verão de São Paulo. A main mantém o contrato.
- `supabase/migrations/20261010062941_...sql`: edição in-place de migration já aplicada.
- `PENDENCIAS.md` / `RELATORIO_CI.md`: relatórios de CI de 23/10 substituídos pelos de 12/11.

## Verificação adversarial

Revisor independente (2026-11-15, `origin/main` em `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5`). Postura: tentar
derrubar o `OBSOLETA`. **Não achei nenhum hunk de valor ≥ médio fora da main.** Parecer: **concordo** —
`OBSOLETA`, `apagar_branch_seguro = true`.

### Reconferido um por um (todas as alegações de incorporação se sustentam)
- `origin/main:src/hooks/auth/useAuth.tsx:12` `import { offlineSendQueue } from '@/lib/offlineQueue';` e `:28`
  `await offlineSendQueue.clear();` — a main **aguarda**; a branch fazia `void`. Main é melhor.
- `origin/main:src/hooks/chat/useTeamChatNotifications.ts:161` `.channel(uniqueRealtimeTopic('team-chat-notifications'))`
  (tópico por instância, mais forte que `team-chat-notifications:${profile.id}` da branch), `:147-153` refs
  (`notifSettingsRef`, `isQuietHoursRef`, `activeIdRef`), `:254` `}, [profile]); // só 'profile' … (HZ5-09)`.
  `permissionRef`/`showNotificationRef` da branch ficaram sem alvo: `:5` importa `showBrowserNotification` e
  `:240` a chama direto — `usePushNotifications` saiu do caminho (HZ3-001).
- `origin/main:src/hooks/system/useDiagnosticsData.ts:291,317` — `connectionsCountError` não é lançado e entra em
  `classifyHealth(connectionsCountError ?? dbError, …)`. Mesmo efeito de N-216.
- `origin/main:src/hooks/system/useUserSettings.ts:88,124,258,307,326` — `isError` + toast `variant:'destructive'`
  (texto "Não foi possível carregar as configurações.") e `isError` exposto no retorno.
- `origin/main:src/hooks/inbox/useInboxFilters.ts:108` `? normalizeContactType(typeParam)` (e `:168` no listener de URL).
- `origin/main:src/components/ui/command-palette.tsx:271,296,310,338` — `role="listbox"` + `role="option"`/`id`/
  `aria-selected` nos **3** grupos; a branch cobria 1.
- `origin/main:src/hooks/inbox/useInboxBulkActions.ts:192,198` — `.select('id, conversation_status')` + `previousStatus.set`.
- `origin/main:scripts/db-audit/dashboard-rls-authorization.test.sh:134` já aponta
  `20261016170000_fix_security_definer_search_path.sql` (exatamente o pedido da branch); `dashboard_kpi` avançou para
  `20261026210000_dashboard_kpi_periodo_aditivo.sql` (`:164`) e a extração `awk` aplica 20261003272707 **e**
  20261007013217 (`:430`, `:443`), com `grep -q` de "extração veio vazia / não fechou o corpo" — salvaguarda
  equivalente ao `^` ancorado que a branch propôs.
- `origin/main:supabase/migrations/20261112171000_talkx_recipients_page_aceita_cancelled.sql:128,192,201` — RPC com
  `p_segment_id uuid DEFAULT NULL` e filtro por segmento. `20261107180000_…_add_segment.sql:15,81,90` é a migration
  nova que a main usou; `supabase/migrations/_superseded/20261023100000_talkx_campaign_recipients_page_add_segment.sql`
  confirma que a tentativa de 23/10 foi aposentada de propósito.
- `origin/main:src/components/inbox/__tests__/SummaryResult.test.tsx` e `.../talkx-campaign-recipients-page.test.sh`
  (`contacts`, `manual_retry_count`): idênticos ao que a branch pedia.

### Tentativas de refutação que falharam (detalhadas, para não refazer)
1. **`scripts/db-audit/docker-shim` (guardas `pg_*`/`postgres`)** — gap real, mas **inócuo** e agora verificado na
   origem: o snapshot `roles_before` é lido do servidor **já de pé** (`origin/main:scripts/db-audit/docker-shim:58`,
   persistido em `:69-70`), então as roles built-in estão no "old"; `comm -23 cur old` (`:185`) nunca as devolve. E o
   `DROP ROLE` é `> /dev/null 2>&1 || true` (`:184`). Valor baixo — confirmado.
2. **`src/test/setup.ts` (mock global de `clientHeight`/`clientWidth`)** — a main deliberadamente **não** tem
   (`origin/main:src/test/setup.ts:139` só o `getBoundingClientRect` fixo em 600). Portar seria **pior**: o
   `clientWidth: 800` global colidiria com `FilesTab.fase6`, que mede largura via spy de `getBoundingClientRect`
   (`mockWidth(959)`/`mockWidth(1474)`). A necessidade real do virtualizador está coberta por mock por arquivo:
   `origin/main:src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx:51-55`
   (`vi.spyOn(Element.prototype,'getBoundingClientRect')` 600×800 + `Object.defineProperty(Element.prototype,'clientHeight',{get:()=>600})`).
3. **`FilesTab.fase6` (`await waitFor`)** — a main mantém as asserções sincronas (`:140-170`). Sem evidência de
   instabilidade; `NÃO VERIFICADO` por execução (worktree local em `claude/feat-radar-live-mount-261115-1302` com
   arquivos de outra tarefa modificados; não rodei vitest para não interferir).
4. **Relabel `[FAIL]` → `[OK-MUTACAO]`** — cosmético confirmado por busca: `git grep -n "\[FAIL\]" origin/main --
   .github/workflows/` → **vazio**; `git grep -c OK-MUTACAO origin/main -- scripts/` → **vazio**. Reprovação é por
   exit code. O resto do diff desses dois `.test.sh` é ruído real (whitespace, `[[  ` com espaço duplo, perda do bit
   `100755`→`100644` em 2 arquivos).
5. **CI como prova** — não foi possível usar: `github_list_check_runs` para
   `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5` com `check_name='🧪 Unit Tests'` devolve `total_count: 0` (workflows
   não essenciais desativados na sessão). Julgamento feito só por leitura de código, como manda a regra.

### Regressão confirmada (não recuperar)
`src/hooks/tasks/workItemFormat.ts` — o diff da branch é literalmente
`- return \`${pad2(d.getDate())} ${MES_CURTO_PT_BR[d.getMonth()]}\`` → `+ return \`…/…/${d.getFullYear()}\``, contra
`origin/main:src/hooks/tasks/workItemFormat.ts:62` e o contrato em
`origin/main:src/hooks/tasks/__tests__/workItemFormat.test.ts:49` (`toBe('09 out.')`), `:50`, `:58`, `:64` e os casos
de horário de verão `America/Sao_Paulo` (`:86-87`, `:123`) que a branch apaga (80 linhas).

**Conclusão:** veredito mantido `OBSOLETA`; branch pode ser apagada. As 5 lacunas residuais são todas de valor baixo
e já estão com o hunk copiado acima — nenhuma justifica branch de resgate.
