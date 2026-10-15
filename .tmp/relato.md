Especialista: Edgar (area-edge-api)

## O que mudou e por quê
`ESTADO.md` (18 linhas da tabela publicada) foi sincronizado com o que o repositório realmente tem. A entrega de
ausência (#219) somou 241 linhas em `supabase/functions/_shared/evolution-webhook-messages.ts` e outras entregas
empilhadas deslocaram linhas de outros arquivos; a tabela do ESTADO.md ficou velha e a guarda
`scripts/ci/docs-estado-registry-convention.unit.mjs` passou a acusar. Recalculei cada linha com as MESMAS regras da
guarda (`invoke('edge')` / `/functions/v1/edge` em `src/`; chamada de outra edge; agendador em
`supabase/migrations/`; entrada em `supabase/config.toml`) e regravei grupo, âncoras, totais e a lista de órfãs.

## Verificação (comando -> linha de resultado)
- `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs` -> `# pass 11 | # fail 0`
  (antes: `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`)
- `zapp-verify . --rapido` -> `OK db_guard 0s | OK tipos 33s | OK lint 0s | OK migrations 1s` |
  `VERIFY: VERDE SEM BANCO (35s)`
- `node --test` na bateria do espelho (`scripts/ci`, `scripts/edge-deploy`, `scripts/db-audit`, `scripts/talkx`) ->
  `# pass 1366 | # fail 9`; as 11 falhas do ESTADO.md sumiram
- `deno test --config scripts/ci/deno.json --frozen` -> `ok | 1908 passed (16 steps) | 0 failed | 3 ignored`
- commit final do cartão: `a89758e2a7`

## Ponto 1 (partir do commit f50ef67ad com cherry-pick)
Não procede: a entrega já está na base deste workspace. Conferi por conteúdo que
`supabase/functions/_shared/away-message-webhook.test.ts` e o trecho de ausência em
`evolution-webhook-messages.ts` já estão aqui — o cherry-pick seria vazio, não recomecei nada.

## Ponto 2 (reproduzir e corrigir a causa)
Feito. Reproduzi (`not ok 2`) e corrijo a causa: as âncoras/grupos velhos do ESTADO.md. Medido 26 âncoras
desatualizadas -> 0, 2 linhas com grupo errado -> 0, `create-user` sem chamador no repositório publicado como
órfã (E), `talkx-link` com chamador de front publicado como A, totais `A 54 · B 0 · C 3 · D 6 · E 18 · total 81` e a
lista de 18 órfãs regravadas.

## Ponto 3 (provar VERDE e fechar citando o sha)
Feito: guarda 11/11 verde, `zapp-verify . --rapido` verde e o commit `a89758e2a7` no topo da branch.

## Achados fora do escopo (não corrigidos)
- Continuam vermelhos, já na base do integrador (`.ci-base-e7d156b8a7...`): `FLAG_CHANGES.md contem todos os usos
  de useCRMIntegrationEnabled` e 2 do Talk X (`delivery window in the campaign timezone`, `scheduler resume`).
- `scripts/ci/lint-ratchet.unit.mjs` (6 itens) faz `git init` num repo temporário e a guarda desta sessão bloqueia
  `git init`; não falha na base do integrador nem no CI.
