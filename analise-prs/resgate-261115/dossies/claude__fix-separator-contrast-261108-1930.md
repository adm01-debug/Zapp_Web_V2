# Dossiê — claude__fix-separator-contrast-261108-1930 (PR #2807)

**Ref:** `origin/claude/fix-separator-contrast-261108-1930` · tip `24d20e321` · merge-base `e6e467b96`
**Commits:** `3349b43b7 fix(email): corrige contraste do separador no cabeçalho da inbox de email` + merge de main.
**Stat:** `src/components/email/EmailChatInbox.tsx | 3 ++-` (1 arquivo, +2/-1).

## Propósito
Cosmético: no cabeçalho do `EmailChatInbox` (conta ativa + contador de não lidos), trocar a cor do separador `•` de `text-border` (quase invisível) para `text-muted-foreground`, e adicionar um comentário explicativo sobre o descarte de `?emailContact`/`?emailTo` quando há `?emailThread`.

## Arquivo × achado × evidência

| Arquivo | Hunk da branch | Achado | Evidência na main |
|---|---|---|---|
| `src/components/email/EmailChatInbox.tsx` | `+ // (a intenção nunca fica setada nesse caso: o leitor suprime quando há thread)` | JÁ NA MAIN | `git grep` em `origin/main` → linha 195, texto idêntico |
| `src/components/email/EmailChatInbox.tsx` | `- <span className="text-border">•</span>` / `+ <span className="text-muted-foreground">•</span>` | JÁ NA MAIN | `origin/main` linha 316 contém `<span className="text-muted-foreground">•</span>`; `text-border` não existe mais no arquivo (`git grep 'text-border' origin/main -- <arquivo>` sem resultado) |

Como entrou na main: `git log -S'<span className="text-border">•</span>' origin/main -- src/components/email/EmailChatInbox.tsx` →
`71dd7238d fix(email): corrige contraste do separador no cabeçalho do EmailChatInbox (#2832)` (mesmo fix, portado por outra PR; #1793 foi quem introduziu o `text-border`).

O hunk CONFLICT na pré-classificação vem apenas de deslocamento de linhas (merge-base linha 315 → main linha 316); `line_check` confirma `missing_in_main=0`, `removed_still_in_main=0`.

## Veredito
**INCORPORADA** — confiança alta. Nenhuma lacuna. Branch pode ser apagada.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial
**Concordo com INCORPORADA.** Tentei refutar e não encontrei nenhum hunk da branch ausente na main.

- `git diff e6e467b96 origin/claude/fix-separator-contrast-261108-1930` → 1 arquivo, +2/-1, dois hunks (comentário na l.152 e separador na l.315). Nada além disso na branch (único commit próprio `3349b43b7`; `24d20e321` é só merge de main).
- Hunk 1 (comentário): `git grep 'a intenção nunca fica setada' origin/main -- src/components/email/EmailChatInbox.tsx` → l.195, texto idêntico, dentro do mesmo bloco `if (... params.has('emailContact') || params.has('emailTo') ...) { stripEmailContactParams(); }` (main l.193-198). O bloco na main foi refatorado (checa `params.get('emailThread')` em vez de `!intent`), mas o comentário está lá e a semântica (descartar params de contato quando há thread) se mantém — o hunk da branch não traz lógica nova.
- Hunk 2 (separador): `git grep 'text-muted-foreground">•</span>' origin/main -- <arquivo>` → l.316, linha completa idêntica à versão `+` da branch. `git grep 'text-border' origin/main -- <arquivo>` → vazio (rc=1). Logo a troca já está aplicada e nada do removido sobrevive.
- Como entrou: `git log -S'<span className="text-border">•</span>' origin/main -- <arquivo>` → `71dd7238d fix(email): corrige contraste do separador no cabeçalho do EmailChatInbox (#2832)` (corpo: "Troca pontual: text-border → text-muted-foreground", Closes #2541). `f49f7bd63` (#1793) é o commit que introduziu o `text-border`. Mesmo fix, portado pela PR #2832.
- `git merge-base --is-ancestor 24d20e321 origin/main` → rc=1: o tip da branch NÃO está na main (PR #2807 não foi mergeada), o que é esperado — o conteúdo chegou por #2832, não por merge desta branch. Isso não configura lacuna: o estado final do arquivo na main equivale ao que a branch produziria.

Lacunas adicionais: nenhuma. Apagar a branch é seguro (sem migrations, workflows ou edges; 0 linhas úteis fora da main).
