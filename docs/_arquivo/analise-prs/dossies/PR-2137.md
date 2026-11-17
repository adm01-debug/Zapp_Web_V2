# Dossiê PR #2137

**Título:** fix(db): recria políticas RLS de team_message_receipts de forma canônica
**Branch:** `claude/fix-db-team-receipts-rls-261021`
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**BLOQUEADO_CI_E_BEHIND**

Migration usa DROP IF EXISTS + CREATE — não é aditiva pura. CI pode estar rodando; PR está atrás de main. Requer revisão humana sobre se o DROP em RLS é aceitável no contexto desta PR.

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivo alterado:** 1 NOVO arquivo `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql` (109 linhas)

### Diff lido — trecho-chave

```sql
-- Derruba políticas existentes (de modo idempotente) para recriar canônico
DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;
CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts
  FOR INSERT TO authenticated WITH CHECK (
    (profile_id = public.current_profile_id()) AND EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      WHERE tcm.conversation_id = team_message_receipts.conversation_id
        AND tcm.profile_id = public.current_profile_id()
        AND tcm.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Conversation members can read receipts" ON public.team_message_receipts;
CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts
  FOR SELECT TO authenticated USING (
    public.is_admin_or_supervisor(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      WHERE tcm.conversation_id = team_message_receipts.conversation_id
        AND tcm.profile_id = public.current_profile_id()
        AND tcm.left_at IS NULL
    )
  );
```

O comentário no arquivo diz: "Em producao e no-op funcional; num replay limpo faz o ambiente novo convergir para o canonico."

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — migration de reconciliação de políticas RLS existentes; objetivo é corrigir políticas que divergiram do canônico |
| 2 | Traz regressão? | **RISCO BAIXO** — DROP IF EXISTS + CREATE em RLS não muda acesso se a política recriada tem a mesma semântica; mas envolve DROP, que é DDL não-aditivo (regra da seção 0) |
| 3 | Já está em main? | **NÃO** — arquivo de migration `20261021000000_recreate_team_message_receipt_policies_canonical.sql` é novo; não está em main |
| 4 | Regra de negócio correta? | **SIM** — `profile_id = current_profile_id()` para INSERT e `is_admin_or_supervisor OR membro da conversa` para SELECT é política correta para recibos de mensagem do Team Chat |

## Bloqueio

Migration usa `DROP POLICY IF EXISTS` — tecnicamente DDL não-aditivo conforme CLAUDE.md seção 0, regra 3. O comentário no arquivo justifica como idempotente ("no-op funcional em produção"), mas a regra explícita diz "Migration só se for aditiva e não destrutiva (sem DROP)".

Condição para merge: aprovação humana explícita que valide a exceção DROP em política RLS como aceitável neste contexto (re-criação canônica idempotente).

## Ação necessária

Aguardar revisão humana sobre se DROP IF EXISTS em RLS cabe na política de migrations. Sem auto_merge configurado — merge manual após aprovação.
