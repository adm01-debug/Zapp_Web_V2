Especialista: iris
## O que mudou e por quê
- ESTADO.md (linha da `classify-sticker`): âncora `src/hooks/sticker-picker/useStickerPicker.ts:147` → `:148` — a entrega das figurinhas adicionou 1 linha no topo do hook (`showMostUsed`) e o `invoke('classify-sticker', ...)` desceu para a linha 148; a guarda do próprio documento manda atualizar a âncora na mesma entrega. Nenhum código foi tocado.
- FAIXA: sem cherry-pick — trabalhei no workspace da entrega anterior, que já estava no commit recusado (1b6fa3f89); o diff deste refazer contra a base tem só a correção abaixo mais este relato.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `pass 10 / fail 1`, `âncora desatualizada: src/hooks/sticker-picker/useStickerPicker.ts:147 não cita 'classify-sticker'`.
- verde depois: mesmo comando → `pass 11 / fail 0`.
- espelho: `ci_espelho.sh .` → exit 0 (verde).
- critério do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (`OK db_guard, tipos, lint, migrations`; banco sem nome de conjunto, sem mudança de banco neste refazer).
- `zapp-verify full .` → vermelho SÓ em `src/components/talkx/__tests__/RuleValueInput.test.tsx` ("Lead score e Risco de churn"), que falha também isolada e não tem nenhum arquivo tocado por este cartão (`git diff dia/2026-10-13...HEAD -- src/components/talkx/` vazio): pré-existente e fora do escopo, registrado em comentário no cartão, sem correção.

## Pontos do revisor
- Ponto 1 (ESPELHO DO CI no empilhamento — âncora do ESTADO.md): resolvido — ESTADO.md:70 agora cita a linha real do `invoke('classify-sticker')` (useStickerPicker.ts:148); demais âncoras da linha (MessageBubble.tsx:325, evolution-webhook-messages.ts:711) já estavam certas e seguem verdes; nenhuma outra citação `:147` restante no repositório.

## O que NÃO fiz e por quê
- Não reverti a linha adicionada em `useStickerPicker.ts`: ela é o filtro "Mais usadas" pedido no cartão original; o conserto correto é a âncora, não desfazer a feature.
- Não corrigi o teste TalkX que falha no full: fora do escopo deste cartão (achado registrado em comentário).
- Não rodei `hermes-tarefa-fechar`: bloqueado por CONGELADO (sem MODO_V2, rc=75), como nos refazeres irmãos; entrego com commit na branch e fecho pelo quadro.
