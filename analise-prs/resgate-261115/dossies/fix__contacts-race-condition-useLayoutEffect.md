# Dossiê — fix__contacts-race-condition-useLayoutEffect (PR #2571, fechada)

**Ref:** `origin/fix/contacts-race-condition-useLayoutEffect` · tip `178a79cbb` · merge-base `1252bb5a4` · 3 commits (2026-11-02).

## Propósito
Trocar `useEffect` por `useLayoutEffect` (sem deps) na atualização de `enderecoVigenteRef` em
`src/components/contacts/ContactForm.tsx`, para o ref refletir o endereço vigente antes da resposta
assíncrona da geocodificação (race condition #263/R2-AUTH-039). Os outros 2 commits só atualizam
`PENDENCIAS.md` (log de status de CI/congelamento, sem código).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/contacts/ContactForm.tsx` | **JÁ NA MAIN, byte a byte** | `git diff origin/fix/... origin/main -- <arquivo>` vazio; `origin/main:src/components/contacts/ContactForm.tsx:1` importa `useLayoutEffect`, `:158` `useLayoutEffect(() => {`. Entrou pelo commit `69da65ddf` (2026-11-02) "fix(contacts): useEffect → useLayoutEffect no ref de endereço vigente (#2608)" — PR #2608 é a versão mergeada deste mesmo fix. |
| `PENDENCIAS.md` (+145/-1 na branch) | **Conteúdo preservado em `docs/_arquivo/PENDENCIAS.md`; raiz reescrita de propósito** | `c570d5d46` (2026-11-02, #2630) "chore: arquiva prosa morta em docs/_arquivo (fase B)" moveu o PENDENCIAS antigo; a raiz hoje é outro documento ("PENDÊNCIAS CI — 2026-11-12", 445 linhas, 0 ocorrências de 2551/Congelamento/GF-032). As seções que a branch adicionava existem no arquivado: `docs/_arquivo/PENDENCIAS.md:7` (§0 runners bloqueados), `:220` (§4 DB Migrate ✅), `:239` (§5 Congelamento PR #2545), `:332` (§8 Retry HTTP fila-merge). Versão arquivada é posterior/mais completa (358 linhas, "Atualizado em 2026-11-02 por sessão d231ac24, pós GF-001..GF-056"). |

## Veredito
**INCORPORADA** — confiança alta. O único código (ContactForm) é idêntico à main; o restante é log de
status já arquivado em forma evoluída. Divergências textuais entre o §4 da branch e o do arquivo são
cosméticas (histórico de status), valor nenhum.

## Lacunas a recuperar
Nenhuma.

## Branch
Segura para apagar (`apagar_branch_seguro = true`).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Branch segura para apagar.**

Tentei refutar procurando qualquer hunk útil de `git diff 1252bb5a4 origin/fix/contacts-race-condition-useLayoutEffect` fora da `main`. Nada sobrou.

1. **O fix em si está na main, byte a byte.** `git diff origin/fix/contacts-race-condition-useLayoutEffect origin/main -- src/components/contacts/ContactForm.tsx` → saída vazia. Na main: `src/components/contacts/ContactForm.tsx:1` importa `useLayoutEffect` e `:158` tem o `useLayoutEffect(() => {` que atualiza `enderecoVigenteRef`. Commit equivalente: `69da65ddf` — "fix(contacts): useEffect → useLayoutEffect no ref de endereço vigente (#2608)".
2. **`git diff --stat` do merge-base ao tip confirma só 2 arquivos** (`PENDENCIAS.md` 145 linhas, `ContactForm.tsx` 6 linhas). Nenhuma migration, edge, workflow ou outro `src/`.
3. **As 102 linhas "ausentes" de `PENDENCIAS.md` são log de status superado.** Comparação literal linha a linha do tip da branch contra `origin/main:docs/_arquivo/PENDENCIAS.md`: de 171 linhas não-vazias, só 28 não estão no arquivo — e são a versão *anterior* do mesmo relatório. §1 da branch cita o run `41162077590`; o arquivo da main cita `41425677046` (pós PR #2606) com as resoluções de #2579/#2598/#2606 que a branch não tem. §4 da branch lista as 3 versões reconciliadas por #2551 e a falha colateral `nao-idempotente-inerte` — os mesmos fatos estão em `docs/_arquivo/PENDENCIAS.md:220-235`, mais o `missing_count=0`. Todos os 9 cabeçalhos `## ` da branch têm correspondente no arquivo.
4. **Checagem extra do commit intermediário.** `0e6777210` ("docs: documentar db-migrate gate producao-ddl em PENDENCIAS.md §4") adicionou um passo a passo para o Joaquim aprovar o environment `producao-ddl`. Esse texto **já não existe no tip da branch** — o commit `178a79cbb` ("atualiza PENDENCIAS.md para versão da main") o sobrescreveu. Logo não é lacuna desta branch. E o conteúdo está coberto na main de todo jeito: `docs/MIGRATIONS.md:511` ("Aprovação humana no environment `producao-ddl` — Joaquim aprova na aba Actions"), `CONTRIBUTING.md:86`, `docs/DEPLOYMENT.md:104`.

Nenhum hunk de valor ≥ médio fora da main. Nenhuma lacuna adicional.
