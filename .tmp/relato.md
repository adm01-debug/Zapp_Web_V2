Especialista: senior (area-front-hooks)

## Pontos da recusa

- Ponto 1: rebasiar a entrega aprovada `fe098dcf2a95` sem desfazer o trabalho do dia 12/10. Verifiquei a branch aprovada `v2/atendentes-pendencias-ultimos-envios-2610111549ff40` contra a ponta atual `dia/2026-10-13` nos arquivos de código/teste do cartão e o diff veio vazio: o código aprovado já está presente na base atual, então não criei mudança de produção nem reescrevi os ajustes do dia 12/10. O `git cherry-pick -n 42e2fdf886` também ficou sem diff.

## O que mudou e por quê

- `.tmp/relato.md`: relato desta retomada. Não houve alteração de código, porque a comparação dos arquivos do cartão contra a branch aprovada não mostrou diferença a reaplicar.

## Prova

- Comparação de escopo: `git diff --name-status HEAD..v2/atendentes-pendencias-ultimos-envios-2610111549ff40 -- src/components/agents/AgentsView.tsx src/components/agents/__tests__/AgentsView.actions.test.tsx src/components/agents/__tests__/AgentsView.capacidade.test.tsx src/components/agents/__tests__/AgentsView.pendencias.test.tsx src/hooks/agents/useAgentPendingCounts.ts src/hooks/agents/useAgentRecentSends.ts` → sem saída.
- Diff contra a base do cartão antes deste relato: `git diff --name-only $(git merge-base HEAD dia/2026-10-13)...HEAD` → sem saída.
- Teste direcionado: `npx vitest run src/components/agents/__tests__/AgentsView.pendencias.test.tsx` → `Test Files  1 passed (1)` e `Tests  7 passed (7)`.
- Verificação ampla executada: `zapp-verify full .` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations` e `VERIFY: VERDE SEM BANCO (290s)` em `/home/joaquim_ataides/.local/state/zapp-verify/0d6184b4b014/resultado.txt`.

## Arquivos no diff final

```text
.tmp/relato.md
```

## O que NÃO fiz

- Não alterei `AgentsView`, hooks nem testes porque eles já estavam iguais ao código aprovado para este cartão na base atual. Alterar de novo aqui criaria diff sem necessidade e aumentaria o risco de desfazer outro trabalho do dia.
