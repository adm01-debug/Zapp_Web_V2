# Inventário final do resgate — 293 branches, 16/11/2026

Sessão `session_01N1ArYPVtJ9CutqjaJRoe4a`. Objetivo do dono: **não perder nenhum trabalho de
nenhum agente, total ou parcial, antes de fechar branch ou PR.** Este arquivo é o veredito por
branch, com a evidência de cada um. Nada aqui é opinião: cada linha tem comando, `arquivo:linha`
ou consulta ao banco oficial (`tnnnlkbymytvtqngbbqh`) atrás.

## 1. Como a varredura foi feita (e o erro que ela corrigiu)

A varredura anterior disse "275 branches incorporadas". **Era falso.** O clone era raso, o
`git merge-base` falhava em 274 das 293 branches e o erro caía dentro de `$files`, virando um
pathspec que não casava nada — "0 pendente". Refeito com `git fetch --unshallow`, abortando quando
a merge-base falha, `--no-renames`, `-z` e `git rev-parse --quiet --verify`.

E a varredura só olhava arquivo **ausente** da main. Trabalho parcial também vive em **linha
adicionada a arquivo que já existe**. Então a conta foi refeita em três níveis:

| Nível | Pergunta | Resultado |
|---|---|---|
| Arquivo | quais arquivos da branch não existem na main? | 182 pares branch/arquivo, auditados um a um |
| Linha | quantas linhas adicionadas não existem na main? | 213 branches com alguma linha pendente |
| Tempo | a main tocou esse arquivo **depois** da branch? | 127 superadas / 86 com conteúdo mais novo que a main |

As 80 branches restantes (293 − 213) não têm uma linha fora da main.

O critério de tempo é o que separa "perdido" de "substituído": se a main mexeu no arquivo depois do
último commit da branch, a versão da main é a decisão mais recente — a branch foi incorporada ou
deliberadamente trocada. As 86 branches do outro lado foram abertas uma por uma.

## 2. O que foi efetivamente resgatado e está na main

| PR | O que entrou | Origem |
|---|---|---|
| #3167 | `TalkXView.rascunhoNaoRemonta.test.tsx` | `claude/fix-talkx-wizard-remonta-rascunho-261114-0715` |
| #3168 | `ai-copilot-radar-guards.contract.test.ts` | `claude/feat-copiloto-edges-261115-1555` |
| #3169 | pins do Playwright 1.65.0 em 5 pontos | correção da #3165 |
| #3170 | leva #3164, #3165, #3166, #3167, #3169 | lote reconstruído sobre a main |
| #3172 | inventário da varredura | — |
| **#3173** | **`copilot_rls_supervisor` + `commit_copilot_tick`** | #3158 + #3160 (branches de outras sessões) |
| #3174 | Gate 3 do `types-sync` deixa de comparar o catálogo consigo mesmo | defeito achado nesta varredura |
| #3175 | importação/exportação de templates + ações em massa do Talk X | `claude_juca/practical-rubin-8xnw0u` |
| #3176 | 5 suítes de teste órfãs | `cool-dijkstra`, `practical-rubin`, `fix-talkx-segmentos-estimativa` |

**DDL do Copiloto conferido em produção** depois do merge da #3173: `commit_copilot_tick(uuid,
integer, jsonb, jsonb)` existe em `pg_proc`; as 6 policies de `copilot_help_requests`,
`copilot_conversation_scores` e `copilot_learning_moments` carregam `is_admin_or_supervisor`; as
versions `20261115030000` e `20261115040000` estão em `supabase_migrations.schema_migrations`.
Deploy da main conferido na Vercel (check `Vercel` = SUCCESS).

## 3. Migrations: o que já estava aplicado sob outro nome

Das 29 migrations pendentes em branch, 24 criam objetos cujo nome **já existe** nas migrations da
main. As 5 restantes foram abertas:

| Migration | Branch | Veredito | Evidência |
|---|---|---|---|
| `20261108180000_copilot_tick_trigger` | `feat-copilot-radar-20261108-1800` | **incorporada** | a main criou a **mesma** função `public.enqueue_copilot_tick_on_contact_message()` em `20261115010000_copilot_live_motor.sql:48`; só o nome do trigger mudou (`trg_copilot_tick_on_contact_message`) |
| `20261026100300_dept_invites_ownership_fix` | `loving-lovelace-esc3l2` | **incorporada** | produção já tem `dept_invites_delete_admin`, `dept_invites_insert_admin` e `dept_invites_select_admin`, todas em `is_admin(auth.uid())`, e o INSERT ainda exige `created_by` do próprio perfil — via `20261114121000` |
| `20261026110300_login_attempts_ttl_lgpd` | `loving-lovelace-esc3l2` | **incorporada em substância** | o cron `login-attempts-retention-90d` existe em produção (`41 4 * * *`, apaga por `last_attempt_at/updated_at/created_at`). Falta só o índice `idx_login_attempts_updated_at`, detalhe de desempenho numa tabela pequena |
| `20261108180100_copilot_presence` | `feat-copilot-radar-20261108-1800` | **PENDENTE, sem consumidor** | tabela + RPC + 2 policies + 2 índices não existem na main nem em produção, e **nenhum código** (nem na própria branch) chama `upsert_copilot_presence` — só documento |
| `20261108180200_copilot_retention` | `feat-copilot-radar-20261108-1800` | **PENDENTE, autônomo** | agrega `copilot_insights` em `copilot_retention_aggregates` e agenda purga por `pg_cron`; não precisa de front. Não entrou porque criar objeto de banco sem consumidor é superfície morta — decisão do dono |

## 4. Código de produção pendente: por que cada um não entrou

Todo arquivo de `src/` ou `supabase/functions/` com conteúdo mais novo que a main foi aberto. Nenhum
é trabalho perdido:

| Trabalho | Branch | Veredito |
|---|---|---|
| `RadarPhase6Panel.tsx` (+321), barrel e atalho | `fix-radar-fase6-cv056-shortcuts-261108-2335`, `feat-radar-fase6-261108-1933`, `fix-radar-shortcut-key-261108-2059` | **superado**: a main tem `src/components/inbox/copilot/RadarPanel.tsx` com o mesmo cabeçalho `CV-051–060 — Painel RADAR flutuante`, e mais: 3 modos, drawer no celular, "não perturbe", a11y e indicador de pensamento |
| `useCopilotSession.ts` (+119) e `copilot/index.ts` | `feat-copilot-radar-20261108-1800` | **superado**: a main migrou para `src/hooks/copilot/*` (`useRadarPanel`, `useLiveSuggestions`, `useCopilotSession`), que é o que o `RadarPanel` consome |
| `useInstancePauses.ts` (+80) | `feat-completar-c121-261101-1330` | **superado**: a main tem `src/components/monitoring/hooks/useInstancePauses.ts` e `src/hooks/connections/useInstancePauseControls.ts` |
| `useMotionSeguro.ts` (+27) e uso nas 4 telas de Telefonia | `hermes/telefonia-fase8-...` | **superado**: a main resolve movimento reduzido por `src/lib/motion.ts`, já usado em `ActiveCallPanel` e `CallKpiCard` |
| `WalletCard`, `TransactionList`, `useWallet`, `AuroraBorealis`, `FloatingParticles`, `useConnections` | `claude_pink/nice-hypatia-iikl82` | **superado**: são esqueletos de 12 a 23 linhas; a main tem `src/components/wallet/ClientWalletView.tsx` de verdade e `AuroraBorealis`/`FloatingParticles` em uso no `AdminView` |
| `useMediaMigrationData.ts` (+80) | `claude_05/zen-feynman-29b7ix` | **refatoração, não função**: extrai para hook o que o `MediaMigrationTool` da main já faz embutido |
| `useMultimodalAnalysis.ts` (+70) | `feat-copiloto-edges-261101-1330` | **pela metade**: a edge `ai-multimodal-analysis` existe na main, mas o hook só é exportado pelo barrel — nenhum componente o chama, nem na branch |
| `usePromptInjectionGuard.ts` (+39) | `fix-logger-vitest-mock-261017-1000` | **abandonado**: zero consumidores, inclusive na própria branch |
| `SentinelAlertPanel.tsx` (+42) | `claude/ecstatic-bardeen-twiveb` | **não isolável**: só é renderizado pelo `WarRoomDashboard` da branch, que está `+95/−176` contra o da main — trazer significaria desfazer 176 linhas mais novas |
| `ServiceStatusSheet.tsx` (92–97) | `practical-rubin-8xnw0u`, `feat-talkx-x048-estados-servico-261101-2100` | **nunca foi ligado**: na branch de origem só é exportado pelo barrel; e a main já mostra serviço degradado por `TalkXWhatsAppDisconnectedState` (`TalkXView.tsx:637-640`) |

## 5. Testes: 37 arquivos fora da main

5 passam contra a main de hoje e entraram na #3176. Os outros 32 cobrem features que não entraram
(`ServiceStatusSheet`, estado "CRM 360 indisponível", `useMotionSeguro`, `TeamChatView` com `cid`,
primitivos de UI de outra fase) e falham por falta do que testam — ficam aqui registrados, com
branch e caminho, para voltarem junto com a feature se ela voltar.

As 17 fixtures `e2e/fixtures/talkx-demo/tela-*.json` de `feat-talkx-x003-demo-fixtures-261101-2143`
não têm spec que as consuma, nem na branch: são dados de demonstração, não teste.

## 6. O que NÃO pode ser apagado ainda

- `claude/loving-lovelace-esc3l2` — carrega a auditoria `auditoria-supabase/` inteira (≈60
  documentos de inventário e 20 SQLs de proposta, de P001 a P010). O código já está na main; os
  documentos, não. É material de decisão, não código morto.
- `claude/feat-copilot-radar-20261108-1800` — `copilot_presence` e `copilot_retention` seguem
  pendentes de decisão do dono.
- `claude/wizardly-ride-dimxnt` — propõe remover `vercel-env-cleanup.yml`, que a main restaurou de
  propósito em 14/11 ("removido por engano e restaurado no mesmo dia"). Decisão de infra.

Fechar o resto é seguro pelos critérios acima. Nenhuma branch foi apagada nesta sessão.
