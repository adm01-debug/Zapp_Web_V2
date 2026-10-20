Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 52s;OK lint 0s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 15:32, gerados por máquina: valem mais que números escritos à mão)
```
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — diff vazio


## Resultado
SEM LACUNA — nenhum arquivo alterado (diff vazio; o único commit é vazio, ver Prova). A `AdminEmailAuditPage` da V3 lista SÓ os jobs de revalidação de e-mail (`email_revalidation_jobs`), que é a feature descartada pelo dono (dita no próprio cartão), e a V2 não tem essa tabela; a parte de e-mail que o admin da V2 mostra (contas, sincronização, erro de sincronização) já existe e não é melhor nem pior que a da V3.

## Evidência (comandos rodados agora)
1. Todo o conteúdo da `AdminEmailAuditPage` da V3 vem de `email_revalidation_jobs` — é a única fonte da tabela da página:
   `git -C ~/projetos/Zapp_Web_V3 show origin/main:src/services/email/emailApi.ts | grep -n "from('"` → `30: let query = supabase.from('email_revalidation_jobs').select('*', { count: 'exact' });`
   A mesma `emailApi.getAuditLogs` alimenta as colunas ID/Status/Agendado/Usuário(Apenas leitura)/Ações; o `retryJob` insere em `email_revalidation_jobs` com `status:'pending'`.
2. A V2 não tem a tabela nem as vizinhas do mesmo domínio:
   `python3 -c "... schema-catalog.json ..."` → tabelas de e-mail/gmail da V2 = `email_attachments`, `email_labels`, `email_messages`, `email_threads`, `gmail_accounts`, `gmail_oauth_states`. Não existe `email_revalidation_jobs`, `email_health_summary` nem `email_health_logs`.
3. A visão de e-mail que o admin da V2 já tem cobre o que a V3 lista de sincronização/falha:
   `src/components/admin/GmailWebhookMonitor.tsx` (tela `'gmail-webhook'`, `src/pages/ViewRouter.tsx:91`) lista as contas com `email_address`, `is_active`, `sync_status`, `last_sync_at`, `last_error`, `history_id` via RPC `get_own_gmail_accounts` + contagem de threads (`count: 'exact'`, `head: true`, `GmailWebhookMonitor.tsx:52-60`).
   `src/components/admin/GmailWebhookMonitor.tsx:11-20` (interface `GmailAccount`) e a gravação do erro em `supabase/functions/gmail-sync/index.ts:76` (`sync_status: 'error'`, `last_error`).
4. A V3 também NÃO tem lista de envios/falhas por mensagem para o admin — nenhum componente lista os logs de saúde:
   `git -C ~/projetos/Zapp_Web_V3 git grep -ln "gmail_health_logs\|email_health_logs\|email_revalidation_jobs" origin/main -- src` → `src/integrations/supabase/types.ts`, `src/pages/admin/email/useEmailHealthStatus.ts` (painel de saúde = EH1/EH2) e `src/services/email/emailApi.ts` (a página de auditoria). Nenhum arquivo de componente.
5. A `AdminEmailAuditPage` da V3 nasceu quebrada no próprio domínio de revalidação (não é referência a copiar): registro da V3 `docs/audit/feature-registry-2026-08-04/FEATURE_REGISTRY.md:152-153` (EMAIL-12/EMAIL-13) marca o fluxo como `Partial` com fios quebrados (`/functions/v1/email-health` 404, realtime em schema não publicado).

## Prova
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (etapas `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`).
- `git status --short` limpo e `git show --stat HEAD` sem arquivo (diff vazio): o commit `chore(admin): paridade da auditoria de e-mail da V3 — sem lacuna (nenhuma alteração de código)` é vazio (`git commit --allow-empty`) e existe só porque o `hermes-tarefa-fechar` exige um commit novo; não há mudança de código para commitar.

## O que NÃO fiz e por quê
- Não portei a `AdminEmailAuditPage`: a data source (`email_revalidation_jobs`) é a feature de revalidação descartada pelo dono e não existe no banco da V2; portar exigiria DDL (tabela nova) — fora de cartão de telas e contrário ao descarte.
- Não criei "lista de eventos de e-mail": ela não existe na V3 (item 4) e a V2 já mostra sincronização/falha da conta no monitor de Gmail (item 3); criar dado sem fonte seria invenção.
