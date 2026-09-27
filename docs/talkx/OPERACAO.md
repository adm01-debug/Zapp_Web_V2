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
- **Usar:** botão "Usar" → encaminha o template para o compositor de mensagem
  da conversa ativa.
- **Visualização:** toggle grade/lista no canto superior direito da tela.
- **Status possíveis:** `draft` (rascunho), `active` (ativo), `paused`
  (pausado), `archived` (arquivado).

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
| `talkx_templates` | Templates de mensagem WhatsApp |
| `talkx_template_versions` | Versões históricas de cada template |
| `talkx_template_variables` | Variáveis dinâmicas por template |
| `talkx_campaigns` | Campanhas (em desenvolvimento — F2+) |
| `talkx_segments` | Segmentos de audiência |

RLS ativa em todas as tabelas. Acesso depende do `profile.role` do usuário autenticado.

---

## 4. Edge Functions relacionadas

| Função | Trigger | Responsabilidade |
|---|---|---|
| `talkx-send-campaign` | Manual / agendado | Disparo de mensagens via Evolution GO |
| `talkx-template-sync` | Webhook Evolution | Sincroniza status de template com WhatsApp Business |

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
bunx playwright test --project=setup --project=chromium-e2e-core e2e/talkx.spec.ts
```

> Atenção: passar o path de arquivo junto de `--project` funciona aqui porque
> estamos passando explicitamente `--project=setup` antes. O bug de `dependsOn`
> (filtro de arquivo zerando testes do `setup`) só ocorre quando `setup` não é
> listado explicitamente.

---

## 7. Monitoramento

- **Logs de disparo:** Supabase Dashboard → Edge Functions → `talkx-send-campaign` → Logs.
- **Status de instância WhatsApp:** Evolution GO dashboard ou endpoint
  `GET /instance/fetchInstances` com `X-Api-Key: <EVOLUTION_API_KEY>`.
- **Alertas de CI:** `db-live-guard.yml` abre/atualiza issue com label
  `db-live-guard` se detectar drift no schema.

---

## 8. Procedimentos operacionais

### 8.1 Adicionar nova categoria de template

1. Atualizar o enum `talkx_template_category` no banco:
   ```sql
   ALTER TYPE talkx_template_category ADD VALUE 'nova_categoria';
   ```
2. Criar arquivo de migration em `supabase/migrations/`.
3. Seguir fluxo: PR → merge `main` → apply via MCP (`db_query`) + registro no
   ledger (seção 1/regra 1 do `CLAUDE.md`).
4. Atualizar o array de categorias em `src/components/talkx/TalkXTemplates.tsx`
   se houver filtro hardcoded.

### 8.2 Desabilitar o módulo temporariamente

Remover `supervisor` de `STAFF_ROLES` em `navigation.service.ts` esconde o
item de menu para supervisores mas mantém para admins. Para ocultar de todos,
remover a entrada `talkx` do array `navigationItems`.

### 8.3 Rollback de migration de Talk X

Seguir o fluxo padrão de rollback do projeto (seção 1 do `CLAUDE.md`):
DDL reverso via `db_query` + registro no ledger, nunca `DROP` direto sem PR.

---

## 9. Histórico de versões

| Versão | Data | Escopo |
|---|---|---|
| `talkx-v1.0.0` | 2026-09-27 | F0 (saneamento E01–E10) + F1 (design system E11–E20) concluídos. Templates: CRUD, toggle grade/lista (E41). E2E incluído no CI (E99). |
