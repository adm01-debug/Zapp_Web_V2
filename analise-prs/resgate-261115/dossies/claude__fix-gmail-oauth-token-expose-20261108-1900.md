# Dossiê — claude__fix-gmail-oauth-token-expose-20261108-1900 (PR #2811)

**Ref:** `origin/claude/fix-gmail-oauth-token-expose-20261108-1900` · tip `6c4610ef7` · merge-base `7e128bc40` · 10 commits (8 são merges de `main` / regeneração de manifest).

## Propósito
Segurança: a action `refresh` da edge `gmail-oauth` devolvia `access_token` do Google ao cliente. A branch remove o campo da resposta (mantém só `expires_at`) e adiciona 2 linhas de comentário `// SEC:`. Diff útil: 2 arquivos, +7/-5.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/gmail-oauth/index.ts` | **Fix funcional JÁ NA MAIN.** `origin/main` linha 264: `return jsonResponse({ success: true, expires_at: expiresAt }, 200, req);` — idêntico ao da branch. Entrou pelo commit `623f37bc1` (2026-11-12 04:17, "fix(gmail-oauth): remover access_token da resposta HTTP (SEC-Z017)"). Única diferença `git diff origin/main <branch> -- <arquivo>`: as 2 linhas de comentário `// SEC: access_token não é retornado ao cliente — apenas expires_at.` / `// O token fica no banco (criptografado) e é usado server-side.` Sem efeito em comportamento. | `git show origin/main:supabase/functions/gmail-oauth/index.ts \| sed -n 258,266p`; `git log origin/main -- supabase/functions/gmail-oauth/index.ts` → `623f37bc1` |
| `supabase/deployment-manifest.json` | **OBSOLETO / artefato gerado.** Os hashes da branch (`source_sha256 15ff8c33…`, `manifest_sha256 85d664b0…`) são stale até dentro da própria branch: a entrada de arquivo diz 16951 bytes / sha `4763cafb…`, mas o arquivo da branch tem 17105 bytes / sha `0fd7ff73…` (o último commit adicionou os comentários sem regenerar). A main tem a entrada correta para o estado atual: `supabase/deployment-manifest.json:693-695` → 16951 bytes / `4763cafb…`, que é exatamente o sha do `gmail-oauth/index.ts` da main (`sha256sum` confirmado). O manifest é regenerado pelo pipeline a cada mudança; nada a portar. | `git diff origin/main <branch> -- supabase/deployment-manifest.json` mostra apenas divergências de hashes de dezenas de arquivos (branch está atrás da main). |

## Veredito
**INCORPORADA** (confiança alta). O comportamento de segurança (não vazar `access_token` no `refresh`) está na main via `623f37bc1` (SEC-Z017). O que falta são 2 linhas de comentário (valor: nenhum/baixo) e um manifest desatualizado (artefato gerado, valor nenhum).

## Lacunas a recuperar
Nenhuma funcional. Opcional, cosmético (não recomendo PR só para isso):
```ts
// supabase/functions/gmail-oauth/index.ts, antes da linha 264 (case "refresh")
        // SEC: access_token não é retornado ao cliente — apenas expires_at.
        // O token fica no banco (criptografado) e é usado server-side.
```

**Apagar branch:** seguro (true).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Checagens feitas (repo local, `origin/main` atual, só leitura):

1. **Diff útil da branch é minúsculo e conhecido.** `git diff 7e128bc40 origin/claude/fix-gmail-oauth-token-expose-20261108-1900 --stat` → 2 arquivos, +7/-5. Nada além de `supabase/functions/gmail-oauth/index.ts` e `supabase/deployment-manifest.json`. Não há migration, workflow, `src/` ou teste escondido.
2. **O fix de comportamento está na main.** `git show origin/main:supabase/functions/gmail-oauth/index.ts | sed -n 250,266p` → linha 264: `return jsonResponse({ success: true, expires_at: expiresAt }, 200, req);`. Idêntico ao da branch. Entrou por `623f37bc1` ("fix(gmail-oauth): remover access_token da resposta HTTP (SEC-Z017)"), que é o commit mais recente da main nesse arquivo.
3. **Nenhum vazamento residual na main.** `grep -n access_token` no arquivo da main: as 10 ocorrências restantes são todas server-side (tipo `TokenResponse` l.21, adaptador de DI `refreshAccessToken` l.67, `getTokens` l.84, RPC `p_access_token` l.94, `fetchProfile` l.169, `storeTokens` l.231/260, `revoke` l.302/305, limpeza `access_token_encrypted: null` l.316). Nenhuma dentro de um `jsonResponse`. A necessidade de segurança está de fato coberta, não só "parecida".
4. **O delta real entre branch e main no arquivo é só comentário.** `git diff --numstat origin/main <branch> -- supabase/functions/gmail-oauth/index.ts` → `2  0`. Duas linhas `// SEC: …`. Valor: nenhum (documentação inline).
5. **Manifest não tem nada a portar — e a entrada da branch é auto-inconsistente.** Entrada da main `supabase/deployment-manifest.json:693-695` = 16951 bytes / `4763cafb6f20…`; `git show origin/main:supabase/functions/gmail-oauth/index.ts | sha256sum` = `4763cafb6f20…` e `wc -c` = 16951 → a main está correta. A branch declara os **mesmos** 16951/`4763cafb…` (linhas 678-680 do manifest dela), mas o arquivo dela tem 17105 bytes / `0fd7ff73…` (os 2 comentários entraram sem regenerar o manifest). Ou seja: o `source_sha256 15ff8c33…`/`manifest_sha256 85d664b0…` da branch descreve um estado que não existe em lugar nenhum. Artefato gerado pelo pipeline, zero valor.
6. **A branch está muito atrás da main.** `git diff origin/main <branch> --stat` → 638 arquivos, 10474 inserções / 44903 deleções (a branch "deleta" dezenas de migrations de 13-15/11 que a main já tem). Reabrir/mergear isso seria regressão; confirma que o único caminho é descartar.

**Apagar branch: seguro.** O único conteúdo perdido são as 2 linhas de comentário, que não mudam comportamento. Se quiser preservar a documentação inline, cabe num `chore(gmail-oauth)` junto de outro fix no mesmo arquivo — não vale PR própria.
