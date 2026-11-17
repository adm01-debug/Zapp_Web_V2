# Dossiê PR #2141

**Título:** feat(E83): entrar por codigo - aceite desacoplado (somente arquivos novos)
**Branch:** `claude/feat-e83-safe-261021-0728`
**Head SHA:** `493a93d0a1fd54ca514df37948b713bccef7df6f` (atualizado em 2026-10-30)
**Base SHA:** `c4c7139e75aa326cc21823e816d1e7f526b67412` (main atual)
**Criado em:** 2026-10-21
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 4 NOVOS arquivos (somente adições; nenhum arquivo existente modificado)

1. `src/components/team-chat/EnterDepartmentByCode.tsx` (85 linhas) — componente UI
2. `src/components/team-chat/__tests__/EnterDepartmentByCode.test.tsx` (76 linhas) — testes do componente
3. `src/hooks/team-chat/__tests__/useRedeemDepartmentInvite.test.tsx` (89 linhas) — testes do hook
4. `src/hooks/team-chat/useRedeemDepartmentInvite.ts` (66 linhas) — hook de resgate

### Diff lido — trechos-chave

**`useRedeemDepartmentInvite.ts`:**
```typescript
// Chama RPC canônica accept_department_invite(p_code text)
const { data, error } = await supabase.rpc('accept_department_invite', {
  p_code: code.trim().toUpperCase(),
});
// Recusa da RPC ({ok:false}) NÃO passa como sucesso
if (!result?.ok) {
  const raw = result?.error ?? 'accept_department_invite_failed';
  throw new Error(REDEEM_INVITE_ERROR_MESSAGES[raw] ?? 'Não foi possível entrar com este código');
}
```

**`EnterDepartmentByCode.tsx`:**
```typescript
// Input de código com transformação para maiúsculas
onChange={e => setInviteCode(e.target.value.toUpperCase())}
// Código mínimo de 6 chars (CHECK do banco)
if (code.length < 6) return;
// Após resgate bem-sucedido, atualiza perfil sem reload
await redeemMutation.mutateAsync({ code });
await refreshProfile();
```

**Testes verificam:**
- `record_incoming_call_event` → RPC chamada com `p_code` maiúsculo
- `{ok:false}` não passa como sucesso silencioso
- Erros tipados: `invalid_or_expired_code`, `invite_exhausted`, `already_member`, `not_authenticated`
- Erro desconhecido cai na mensagem genérica

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — implementa E83 "Entrar via Código" usando a RPC `accept_department_invite` já existente no banco |
| 2 | Traz regressão? | **NÃO** — somente arquivos novos; nenhum arquivo existente modificado; desacoplado do `TeamChatPanel` por design |
| 3 | Já está em main? | **NÃO** — todos os 4 arquivos são novos (modo 100644, `new file mode`) |
| 4 | Regra de negócio correta? | **SIM** — usa a única porta disponível para não-admin (`accept_department_invite` SECURITY DEFINER); `department_invitations` é admin-only por RLS; código em maiúsculas como especificado pelo banco |

## Dependência conhecida

O card `EnterDepartmentByCode` está disponível mas inerte nesta PR. A montagem no bloqueio "Conteúdo Protegido" do `TeamChatPanel` pertence à PR1987 (PR que detém o painel). Sem a PR1987 o card existe mas não é renderizado — nenhum comportamento existente muda.

## Bloqueio atual

CI rodando (E2E + Unit Tests in_progress desde 21:37Z). Sem auto_merge — requer merge manual após CI verde.

## Ação necessária

Aguardar CI Gate verde. Fazer merge manual (squash) quando verde.
