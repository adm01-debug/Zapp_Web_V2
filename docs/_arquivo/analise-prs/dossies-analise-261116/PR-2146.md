# Dossiê PR #2146

**Título:** feat(team-chat): lê cid da URL ao navegar (popstate/zapp:navigate)
**Branch:** `claude/feat-team-chat-cid-url-261021`
**Head SHA:** verificar via API
**Base SHA:** `c4c7139e75aa326cc21823e816d1e7f526b67412` (main atual)
**Criado em:** 2026-10-21
**Draft:** Não | **auto_merge:** squash

---

## Veredito

**MERGEAR_SE_CI_VERDE**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 2 arquivos (1 modificado + 1 NOVO)

### Diff lido — trechos-chave

**`src/components/team-chat/TeamChatView.tsx`** (modificado):
```typescript
// Nova função para leitura de cid da URL
function readTeamChatCidFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('cid');
}

// useEffect com listeners para popstate e zapp:navigate
useEffect(() => {
  function handleNavigation() {
    const cid = readTeamChatCidFromUrl();
    if (cid) {
      setSelectedConversationId(cid);
    }
  }
  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('zapp:navigate', handleNavigation);
  return () => {
    window.removeEventListener('popstate', handleNavigation);
    window.removeEventListener('zapp:navigate', handleNavigation);
  };
}, []);
```

**`src/components/team-chat/__tests__/TeamChatView.cid.test.tsx`** (NOVO, 107 linhas):
- 4 testes cobrindo leitura de cid da URL via `popstate` e `zapp:navigate`
- Testa: evento sem cid (noop), evento com cid válido, cleanup de listeners

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — implementa navegação por URL para o Team Chat; funcionalidade de deep linking |
| 2 | Traz regressão? | **NÃO** — adiciona listeners com cleanup correto; nenhum comportamento existente alterado; 2 arquivos apenas |
| 3 | Já está em main? | **NÃO** — função `readTeamChatCidFromUrl` e os 4 testes são novos, não estão em main |
| 4 | Regra de negócio correta? | **SIM** — leitura de parâmetro de URL `cid` para selecionar conversa do Team Chat é padrão correto de deep linking; listeners de `popstate`/`zapp:navigate` são o par correto para navegação SPA |

## Bloqueio atual

PR pode estar `BEHIND` (main avançou). auto_merge:squash configurado — deve se atualizar e mergear automaticamente quando CI gate estiver verde.

## Ação necessária

Aguardar CI Gate verde. auto_merge:squash deve disparar automaticamente. Se PR estiver BEHIND, o workflow `auto-update-pr-branch` deve atualizá-la.
