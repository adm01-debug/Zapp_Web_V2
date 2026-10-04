# Talk X / Campanhas — Guia de Operação (v1.0)

> **Atualizado:** 2026-09-27 · **Versão:** `talkx-v1.0.0`  
> Referência: `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md` (fases F0–F1 concluídas).

---

## 1. Acesso e permissões

| Papel | Enxerga "Campanhas"? | Pode criar campanha? |
|---|---|---|
| `admin` | ✅ | ✅ |
| `supervisor` | ✅ | ✅ |
| `agente` | ❌ | ❌ |

O item "Campanhas" aparece no menu lateral somente para `admin` e `supervisor`
(`STAFF_ROLES` em `src/services/navigation.service.ts`).

---

## 2. Módulos disponíveis (v1.0)

### 2.1 Templates de mensagem

Caminho: **Campanhas → Templates**

- **Criar template:** botão "Novo Template" → preencher nome, categoria,
  conteúdo e variáveis → Salvar.
- **Editar:** ícone de lápis no card ou na linha da lista.
- **Duplicar:** ícone de cópia — gera uma cópia com sufixo "(cópia)".
- **Excluir:** ícone de lixeira → confirmar no modal.
- **Usar:** botão "Usar" → abre o wizard de nova campanha com esse template
  pré-selecionado (não encaminha para o compositor de mensagem da conversa).
- **Visualização:** toggle grade/lista no canto superior direito da tela.
- **Status possíveis:** `draft` (rascunho), `review` (em revisão), `approved` (aprovado).

### 2.2 Segmentos de audiência

Caminho: **Campanhas → Segmentos**

- Criação e edição de segmentos de contatos para disparo de campanhas.
- Filtros por atributos de contato, tags e histórico de conversas.

---

## 3. Banco de dados

Projeto Supabase: **`tnnnlkbymytvtqngbbqh`** (cloud).

Tabelas principais do módulo:

| Tabela | Descrição |
|---|---|
| `talkx_templates` | Templates de mensagem WhatsApp (variáveis em `custom_variables[]`) |
| `talkx_template_versions` | Versões históricas de cada template |
| `talkx_campaigns` | Campanhas (operacional: criação via wizard, atualização, exclusão, gestão de destinatários; métricas consolidadas via `talkx-report`) |
| `talkx_segments` | Segmentos de audiência |

RLS ativa em todas as tabelas. Acesso depende do `profile.role` do usuário autenticado.

---

## 4. Edge Functions relacionadas

| Função | Trigger | Responsabilidade |
|---|---|---|
| `talkx-send` | Manual / agendado | Disparo de mensagens via Evolution GO |
| `talkx-scheduler` | Cron | Agenda e controla o ciclo de vida de campanhas |
| `talkx-report` | Manual / UI | Consolida métricas de entrega por campanha |
| `talkx-link` | Webhook | Rastreia cliques em links das mensagens enviadas |

Deploy via: **Actions → `deploy-functions.yml` → `workflow_dispatch`** (requer
aprovação no environment `producao-edge-functions`).

---

## 5. Evolution GO (WhatsApp)

- **URL:** `https://evolution-go-rxj2.srv1481814.hstgr.cloud`
- **Instância padrão:** `PRINCIPAL`
- **Auth:** `EVOLUTION_API_KEY` (admin) e `EVOLUTION_INSTANCE_TOKEN` (por instância)
  — nunca expostos no front; vivem nos secrets das Edge Functions.
- **Tradução de rotas:** `supabase/functions/_shared/evolution-go-routes.ts`

---

## 6. CI / Testes automáticos

### 6.1 Testes E2E do Talk X

`e2e/talkx.spec.ts` roda no job **E2E logado** (`e2e-logado.yml`), que dispara
após cada merge em `main` e via `workflow_dispatch`.

Cobertura atual (4 testes):
1. Overview do módulo renderiza corretamente.
2. Wizard de nova campanha abre ao clicar no botão.
3. Modal de ajuda abre e fecha.
4. Tabs de Segmentos e Templates são visíveis e navegáveis.

O usuário de teste (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`) tem perfil
**supervisor** e enxerga "Campanhas".

### 6.2 Rodar localmente

```bash
export E2E_TEST_EMAIL="<seu-usuario-de-teste>"
export E2E_TEST_PASSWORD="<sua-senha-de-teste>"
bunx playwright test --project=setup --project=chromium-e2e-core
```

> Isso roda os 3 specs do `chromium-e2e-core` (conversation, messaging e talkx).
> Não passe path de arquivo junto de `--project`: o filtro se aplica a todos os
> projetos, incluindo `setup`, zerando seus testes e impedindo a geração de
> `e2e/.auth/user.json`.

---

## 7. Monitoramento

- **Logs de disparo:** Supabase Dashboard → Edge Functions → `talkx-send` → Logs.
- **Status de instância WhatsApp:** Evolution GO dashboard ou endpoint
  `GET /instance/all` diretamente em `https://evolution-go-rxj2.srv1481814.hstgr.cloud`
  com header `apikey: <EVOLUTION_API_KEY>` (rota interna do GO; via app usa `/instance/fetchInstances` que o tradutor mapeia para este path).
- **Alertas de CI:** `db-live-guard.yml` abre/atualiza issue com label
  `db-live-guard` se detectar drift no schema.

### 7.1 Saúde do cron do motor (tick X012)

O tick do motor roda no job `talkx-scheduler-1min` (a cada minuto), cujo command é
`SELECT public.trigger_talkx_engine_tick()`. Em cada execução o tick: (1) roda o
reaper (`sweep_talkx_stuck_recipients`), movendo para `outcome_unknown` o
destinatário que teve o POST disparado e ficou com o lease vencido; (2) conclui
campanhas `sending` que já drenaram; (3) re-invoca **no máximo 1 campanha
`sending` por conexão** (a de `updated_at` mais antigo, teto de 10 no tick) via
`kick_talkx_campaign`, que faz um POST `{campaignId, action:'continue'}` para
`talkx-send` com `x-cron-secret` e `timeout_milliseconds := 30000`; e (4) faz 1
POST para `talkx-scheduler` (agendadas e retomadas dentro da janela). Um tick
perdido só atrasa 1 min — nenhuma decisão depende de uma execução isolada.

Histórico de execuções do job (`status` e `return_message`):

```sql
SELECT jobid, runid, status, return_message, start_time, end_time,
       (end_time - start_time) AS duration
  FROM cron.job_run_details
 WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'talkx-scheduler-1min')
 ORDER BY start_time DESC
 LIMIT 30;
```

Resposta HTTP das chamadas disparadas pelo tick (timeout/erro do `pg_net`):

```sql
SELECT id, status_code, timed_out, error_msg, created
  FROM net._http_response
 ORDER BY created DESC
 LIMIT 30;
```

Estado atual do job (command, schedule e se está ativo):

```sql
SELECT jobid, jobname, schedule, active, command
  FROM cron.job
 WHERE jobname = 'talkx-scheduler-1min';
```

Como ler:

- `cron.job_run_details.status = 'failed'` com `return_message` contendo
  `job startup timeout` → o pg_cron não conseguiu **iniciar** o job (disputa por
  worker). Por isso a X012 reaproveita o job existente via `cron.alter_job` em vez
  de criar outro; se o volume de falhas continuar, o próximo passo é reduzir a
  cadência ou o custo do tick, não duplicar jobs.
- `net._http_response.timed_out = true` (ou `status_code >= 500`/nulo com
  `error_msg` preenchido) nas últimas linhas → uma edge não respondeu dentro dos
  30 s. Verifique o deploy de `talkx-send`/`talkx-scheduler` e, se o padrão se
  repetir, o tempo de cada `continue` (orçamento de batch da X011).
- `SELECT command FROM cron.job` **não** conter `trigger_talkx_engine_tick` → a
  migration X012 não foi aplicada (ou foi feito rollback): o motor voltou a chamar
  a edge sem o reaper/conclusão e as campanhas presas não se recuperam sozinhas.

---

## 8. Procedimentos operacionais

### 8.1 Adicionar nova categoria de template

A coluna `category` é do tipo `text` (sem enum no banco). Para adicionar uma nova categoria:

1. Adicionar o novo valor ao array `TEMPLATE_CATEGORIES` em
   `src/components/talkx/talkxShared.tsx`.
2. Abrir PR → merge `main` — sem migration de banco necessária.

### 8.2 Desabilitar o módulo temporariamente

**Nunca remover `supervisor` de `STAFF_ROLES`** — essa constante é compartilhada
por ~30 itens de menu; removê-la esconderia toda a UI de supervisores.

Para esconder só "Campanhas" na interface:
- **Só para supervisores:** alterar `roles: STAFF_ROLES` para `roles: ['admin']`
  na entrada `{ id: 'talkx' }` em `navigation.service.ts`.
- **Para todos (admin + supervisor):** remover a entrada `{ id: 'talkx' }`
  dos items do grupo `'Automação & IA'` em `NavigationService.getGroups()`
  (`navigation.service.ts`, linha ~72).

> ⚠️ **Esconder o menu NÃO para o backend.** O cron `talkx-scheduler-1min`
> continua rodando a cada minuto e invocando `talkx-send` para campanhas
> ativas ou agendadas — independente de a UI estar visível ou não.
>
> **Para pausar o envio de mensagens de verdade:**
>
> 1. Cancelar campanhas em andamento (se houver):
>    ```sql
>    UPDATE talkx_campaigns
>    SET status = 'cancelled'
>    WHERE status IN ('sending', 'scheduled', 'paused');
>    ```
>    Executar via `db_query` no MCP `SUPABASE - ZAPP WEB V2 - MCP`.
>
> 2. Desativar o cron job:
>    ```sql
>    SELECT cron.unschedule('talkx-scheduler-1min');
>    ```
>    Ou: Supabase Dashboard → Database → Cron Jobs → desabilitar `talkx-scheduler-1min`.
>
> 3. Para **reativar**:
>    - Se o cron foi **desativado via Dashboard** (`active = false`): reative com
>      ```sql
>      UPDATE cron.job SET active = true WHERE jobname = 'talkx-scheduler-1min';
>      ```
>      via `db_query` no MCP `SUPABASE - ZAPP WEB V2 - MCP`.
>    - Se o cron foi **desagendado** com `cron.unschedule()`: reaplique o
>      `SELECT cron.schedule(...)` da migration `20260909000000_talkx_scheduler_cron.sql`
>      via `db_query` no MCP `SUPABASE - ZAPP WEB V2 - MCP`.
>
>    Confirmar estado atual: `SELECT jobname, active FROM cron.job WHERE jobname = 'talkx-scheduler-1min';`

### 8.3 Rollback de migration de Talk X

Seguir o fluxo padrão de rollback do projeto (seção 1 do `CLAUDE.md`):
DDL reverso via `db_query` + registro no ledger, nunca `DROP` direto sem PR.

### 8.4 Destinatários em `outcome_unknown` exigem decisão humana

Quando o `talkx-send` faz o POST ao provedor (Evolution GO) e não consegue
confirmar o resultado — HTTP 5xx, timeout, corpo inválido ou falha na gravação
do recibo após o envio — o destinatário entra em quarentena com status
`outcome_unknown`. **Não há reenvio automático** desse estado: refazer o POST
sem um contrato de idempotência do provedor arrisca mensagem duplicada.

Procedimento:

1. Localizar os casos:
   ```sql
   SELECT id, campaign_id, contact_id, attempt_count, error_message
     FROM talkx_recipients WHERE status = 'outcome_unknown';
   ```
2. Decidir **manualmente** por destinatário:
   - **Reenviar** (só com certeza de que a mensagem NÃO chegou): action `retry {recipientId}`
     da `talkx-send`, que reabre para `pending` via `retry_talkx_recipient` se
     `attempt_count < 3` e o contato não está suprimido.
   - **Descartar** (mensagem provavelmente chegou): manter para auditoria.
3. O teto de 3 tentativas por destinatário é respeitado tanto pelo retry manual
   (`retry_talkx_recipient`) quanto pelo backoff automático
   (`reschedule_talkx_recipient`).

> **Sem reconciliação automática sem id do provedor (X031).** Não existe — e não
> haverá — varredura automática que conclua sozinha um `outcome_unknown`: sem um id
> do provedor que correlacione o POST ao recibo, todo `outcome_unknown` é ambíguo
> por definição e exige decisão humana. A administração resolve caso a caso pelas
> RPCs `resolve_talkx_outcome_unknown` (`mark_sent` | `mark_failed` | `retry` — o
> `retry` exige confirmação explícita de risco de mensagem em dobro) e
> `retry_talkx_recipients` (reenvio manual em lote de `failed`/`skipped`, teto de 3
> por destinatário); ambas gravam evento com ator na linha do tempo e reabrem a
> campanha `completed` para `sending` quando necessário.

---

## 9. Histórico de versões

| Versão | Data | Escopo |
|---|---|---|
| `talkx-v1.0.0` | 2026-09-27 | F0 (saneamento E01–E10) + F1 (design system E11–E20) concluídos. Templates: CRUD, toggle grade/lista (E41). E2E incluído no CI (E99). |
| `talkx-v1.1.0` | 2026-10-03 | X023: preflight de paridade de deploy (`talkx-preflight.mjs`) + regras de operação (§10). |

---

## 10. Preflight de paridade de deploy (X023) — obrigatório antes do primeiro disparo

**Regra 1 — sem preflight verde do dia, não se lança campanha real.** Antes de
qualquer disparo real para cliente, rodar e guardar a evidência do dia:

```bash
# sem token (paridade local: fonte vs manifesto commitado + verify_jwt)
node scripts/edge-deploy/talkx-preflight.mjs

# com o token da Management API + o secrets list coletado (paridade remota + segredos)
SUPABASE_ACCESS_TOKEN=… node scripts/edge-deploy/talkx-preflight.mjs \
  --secrets-file <(supabase secrets list --project-ref tnnnlkbymytvtqngbbqh --output-format json)
```

O aceite é **`diverged: 0`** nas 5 funções (`talkx-send`, `talkx-scheduler`,
`talkx-link`, `talkx-report`, `evolution-webhook`) e **`missing: 0`** nos segredos
(`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_TOKEN`,
`RESEND_API_KEY`, `TALKX_LINK_IP_SALT`, `TALKX_LINK_BASE_URL`). A evidência sai em
`docs/talkx/recovery/evidence/X023/preflight-<data>.json`.

O preflight **não** prova equivalência fonte↔bundle (o `source_sha256` local e o
`ezbr_sha256` remoto são objetos diferentes). O que ele mede: (a) o manifesto
commitado está em dia com o fonte + `verify_jwt`; (b) as 5 funções estão no ar,
`ACTIVE`, com `verify_jwt` correto e bundle digest válido; (c) os segredos
exigidos existem no projeto. Para divergência → disparar `deploy-functions.yml`
(§4) e repetir; para segredo ausente → `supabase secrets set` (o valor nunca é
listado nem logado — só o nome).

> A rastreabilidade do deploy é o **run id do `deploy-functions.yml`** (o GitHub
> Deployment com `ref` = SHA publicado — a antiga tag `edge-deploy/*` saiu de cena
> na E60); cite esse run id na evidência quando houver redeploy.

**Regra 2 — enquanto CAP-066 não estiver no ar, campanha real não usa `{{link}}`.**
A autenticação do POST de conversão (`talkx-link`, HMAC via `TALKX_CONVERT_SECRET`)
precisa estar publicada e com o segredo configurado no site antes de qualquer
mensagem real carregar `{{link}}`; até lá, usar `{{link:rotulo}}` só em teste.
