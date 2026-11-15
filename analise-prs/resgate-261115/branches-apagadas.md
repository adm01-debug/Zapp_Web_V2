# Branches apagadas em 2026-11-15, com prova

Quinze branches foram apagadas do remoto nesta sessão. Todas passaram pelas três camadas de prova
do `README.md` e por uma reconferência final, linha a linha, feita depois de apagadas.

**Nada se perdeu.** Cada uma tinha PR associada, e o GitHub preserva o commit de uma PR em
`refs/pull/<n>/head` para sempre, mesmo sem a branch. Para trazer qualquer uma de volta:

```bash
git fetch origin refs/pull/<n>/head
git branch <nome-novo> FETCH_HEAD
```

## Reconferência final (feita após a exclusão)

Para cada branch: linhas que ela **adicionou** desde o merge-base, comparadas exatamente contra a
versão atual do mesmo arquivo na `main`.

| Branch | ponta | PR | arquivos | linhas fora da `main` |
|---|---|---|---|---|
| `claude/feat-metas-seletor-periodo-261101-1400` | `ee60ee60d` | #2468 | — | **0** |
| `claude/feat-restaura-briefing-crm-261112` | `682fa23d6` | #3019 | — | **0** |
| `claude/feat-restaura-paineis-ia-261112` | `1501e290c` | #3021 | — | **0** |
| `claude/fix-e2e-canceladas-celular-261112-1508` | `3db99d884` | #3026 | — | **0** |
| `claude/fix-e2e-nav-multiplix-desktop-261112-1508` | `fb56ff9bf` | #3025 | — | **0** |
| `claude/fix-health-check-get-revert-261109-2249` | `838944ba0` | #2915 | — | **0** |
| `claude/chore-relatorio-ci-261112-1340` | `33d723e79` | #2998 | — | **0** |
| `claude/feat-evolution-ui-orfas-261112` | `facaca425` | #3011 | — | **0** |
| `claude/fix-axe-email-webkit-contrast-261101-2325` | `7ddc2cc94` | #2541 | — | **0** |
| `claude/fix-ci-gr027-261102-0100` | `3caf2e3bf` | #2559 | — | **0** |
| `claude/fix-deno-check-config-261101-2157` | `e39684071` | #2521 | — | **0** |
| `claude/fix-e2e-telefonia-teclado-261101-1558` | `e5fd0eb9a` | #2489 | — | **0** |
| `claude/fix-separator-contrast-261108-1930` | `24d20e321` | #2807 | — | **0** |
| `claude/fix-telefonia-firefox-gr012` | `0b7db6cbc` | #2428 | — | **0** |
| `fix/f1a-lote-b-batch5` | `226ccb78e` | #2082 | — | **0** |

As duas que acusaram 1 linha na primeira passada foram abertas e conferidas:

- `claude/fix-separator-contrast-261108-1930`: a linha apontada é **idêntica** à linha 316 da `main`;
  foi falso positivo do script. Zero linhas fora.
- `fix/f1a-lote-b-batch5`: a única linha diferente era `toast({ title: 'Erro' ,` — com um espaço
  antes da vírgula. A `main` tem a mesma linha sem o espaço (`useUserSettings.ts:124`). Zero
  conteúdo fora.

## Decisão sobre as demais

As outras 267 branches provadas incorporadas ou obsoletas **não foram apagadas**. Elas custam nada
para manter e a decisão de apagar é do dono, com a tabela do `README.md` em mão.
