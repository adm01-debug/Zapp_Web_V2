Especialista: iris
Skill de área usada: area-front-componentes (remoção de UI já entregue; este refazer só sincroniza o mapa ESTADO.md).

## O que mudou e por quê
- ESTADO.md: a edge `ai-auto-tag` perdeu seu único chamador quando a entrega removeu `src/components/settings/AIAutoTagsConfig.tsx`; a âncora virou "sem chamador no repositório" (grupo E), totais A 54→53 e E 17→18, seção de órfãs 17→18 com `- ai-auto-tag` em ordem alfabética. Motivo: a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` recalcula a tabela a partir do código e falha quando a âncora some — foi exatamente o vermelho do ESPELHO no empilhamento.
- A entrega anterior (94d2e594c5) já estava nesta branch; nenhum commit foi trazido por cherry-pick neste refazer, então não há FAIXA DO PAI. Meu diff contra a entrega anterior (461ec2bcd) é só ESTADO.md + este relato.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` e `✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D` (`grupo de ai-auto-tag divergiu dos chamadores reais: {"A":[],"B":[],"C":[],"D":[]} 'A' !== 'E'`).
- verde depois: mesmo comando → `ℹ tests 11 / ℹ pass 11 / ℹ fail 0`.
- `zapp-verify full .` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `AVISO banco_local` (sem nome de conjunto, esperado), `Test Files 1 failed | 1313 passed (1314)` / `Tests 1 failed | 11900 passed | 25 expected fail | 14 todo (11940)`. O único vermelho é `src/components/talkx/__tests__/RuleValueInput.test.tsx` ("Unable to find role=button name Novo segmento"), módulo talkx sem relação com etiquetas: rodei o mesmo arquivo com minha mudança em stash e falhou igual (1 failed | 4 passed), logo é preexistente e fora do escopo — registrado em comentário no cartão, sem correção. O build não foi alcançado porque o verify para no primeiro vermelho.

## Pontos do revisor
- Ponto 1 (quebra o ESPELHO no empilhamento: âncora deixa de existir e grupo A→E): resolvido — ESTADO.md sincronizado, guarda 11/11 verde.
- Ponto 2 (reproduzir com `zapp-verify full .`, corrigir e fechar): executado — falha do espelho reproduzida e corrigida; full executado com o resultado acima; o residual é preexistente e fora do escopo.

## O que NÃO fiz e por quê
- Não corrigi o RuleValueInput (talkx, outro módulo/cartão) nem a migration/edge `ai-auto-tag` (fora de escopo declarado no cartão pai).
- Não rebaseei nem recriei branch: a guarda proíbe criar/apagar/renomear branches e indicou esta branch como a da tarefa; commitei sobre ela.
- Não toquei em manifesto, CI, guardas nem testes existentes.
