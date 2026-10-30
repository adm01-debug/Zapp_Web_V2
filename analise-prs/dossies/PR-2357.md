# Dossiê PR #2357

**Título:** chore(db): sincronizar artefatos derivados do banco (types-sync bot)
**Branch:** `automation/types-sync`
**Head SHA:** `d99d9efd56f99c93d0e2d6c08f60a4418d9d2781`
**Base SHA:** `c4c7139e75aa326cc21823e816d1e7f526b67412` (main atual)
**Criado em:** 2026-10-30
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**MERGEAR_SE_CI_VERDE**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** `src/integrations/supabase/types.ts` (regenerado), `scripts/db-audit/grants-baseline.json`, `supabase/schema-catalog.json`, `supabase/schema-manifest.json` (artefatos derivados do banco).

### Diff lido — trecho relevante de `grants-baseline.json`

```diff
-    "anon_execute": [
-        "record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean, p_direction text)",
-        "record_talkx_campaign_lifecycle_event()"
-    ],
+    "anon_execute": [
+    ],
-    "generated_at": "2026-10-04",
+    "generated_at": "2026-10-30",
```

Remoção de `anon_execute` para `record_incoming_call_event` e `record_talkx_campaign_lifecycle_event` — reflete revogação de EXECUTE anon nessas funções.

Remoção de ~15 tabelas de `anon_table_select`: `ai_conversation_tags`, `campaign_contacts`, `contact_custom_fields`, `contact_identity_map`, `contact_purchases`, `conversation_closures`, `conversation_events`, `conversation_memory`, `conversation_sla`, `conversation_snoozes`, `conversation_tasks`, `favorite_contacts`, `link_preview_cache`, `message_reactions`, `message_templates`, `passkey_credentials`, `pinned_conversations`, `scheduled_messages`, `sicoob_contact_mapping`.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — é o bot de sincronização de tipos, regenera `types.ts` a partir do banco oficial; necessário após qualquer mudança de schema |
| 2 | Traz regressão? | **NÃO** — só regenera artefatos derivados; remoção de grants do baseline reflete revogações reais de `anon` (segurança melhorada) |
| 3 | Já está em main? | **NÃO** — diff mostra `generated_at: 2026-10-04 → 2026-10-30` e remoções reais |
| 4 | Regra de negócio correta? | **SIM** — revogar `anon_execute` de funções que expõem dados sensíveis é melhoria de segurança; sincronização de tipos é operação de manutenção obrigatória |

## Bloqueio atual

CI rodando (E2E + Build + Contrato DB in_progress desde 21:33Z). auto_merge:squash configurado.

## Ação necessária

Aguardar CI Gate verde. auto_merge:squash deve disparar automaticamente. Se CI Gate falhar por timing bug, re-executar.
