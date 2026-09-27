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

---

## 9. Histórico de versões

| Versão | Data | Escopo |
|---|---|---|
| `talkx-v1.0.0` | 2026-09-27 | F0 (saneamento E01–E10) + F1 (design system E11–E20) concluídos. Templates: CRUD, toggle grade/lista (E41). E2E incluído no CI (E99). |
