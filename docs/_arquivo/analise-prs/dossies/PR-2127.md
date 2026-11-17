# Dossiê PR #2127

**Título:** fix(e91): log de CHANNEL_ERROR nos canais Realtime do Team Chat (hardening E91)
**Branch:** (mergeada — branch deletada)
**Head SHA:** (mergeado em squash)
**Base SHA:** (anterior à main@c4c7139e)
**Criado em:** 2026-10
**Draft:** Não

---

## Veredito

**JÁ_MERGEADA**

Mergeada em 2026-10-27T21:03:43Z via squash. SHA merge: `eb4d9c8fcda6cf3d079e8cfe8d1f59ce9b54f401`.

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 5 (4 hooks existentes + 1 teste novo)

### Diff lido — trechos-chave

**4 hooks atualizados para logar `CHANNEL_ERROR` / `TIMED_OUT`:**
```typescript
// Padrão aplicado em todos os 4 hooks:
channel.on('system', { event: 'CHANNEL_ERROR' }, (payload) => {
  console.error('[TeamChat] CHANNEL_ERROR no canal <nome>:', payload);
});
channel.on('system', { event: 'TIMED_OUT' }, (payload) => {
  console.warn('[TeamChat] TIMED_OUT no canal <nome>:', payload);
});
```

Hooks afetados:
- `src/hooks/team-chat/useTeamConversations.ts` (+35/-0)
- `src/hooks/team-chat/useTeamMessages.ts` (+40/-0)
- `src/hooks/team-chat/useTeamTyping.ts` (+35/-0)
- `src/hooks/team-chat/useTeamMessageReactions.ts` (+37/-0)

**Teste novo: `src/hooks/team-chat/__tests__/useTeamChatRealtimeChannelErrors.test.tsx`** (+35/-0, 5 testes):
- Testa que CHANNEL_ERROR dispara `console.error` em cada hook
- Testa que TIMED_OUT dispara `console.warn` em cada hook
- Verifica que o payload é passado ao logger

**E90 explicitamente excluída** (requer arquivos da PR #2080).

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **N/A** — já mergeada |
| 2 | Traz regressão? | **NÃO** — adição pura de event listeners de log; não altera lógica de negócio nem estado dos canais |
| 3 | Já está em main? | **SIM** — `eb4d9c8f`; main atual `c4c7139e` é descendente |
| 4 | Regra de negócio correta? | **SIM** — hardening de observabilidade no Realtime; log em `CHANNEL_ERROR`/`TIMED_OUT` é prática recomendada Supabase |

## Resultado

Mergeada com sucesso. E91 concluído; E90 permanece para a PR #2080.
