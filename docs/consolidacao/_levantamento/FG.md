# Locais F e G — fontes somente de leitura

Leitura em 28/10/2026. Os diretórios de origem não foram alterados. O índice `BACKUPS.tsv` contém os 277 arquivos de F; `AUDITORIAS.tsv` contém os 838 de G. Cada linha informa tipo, localização, comparação por nome e SHA-256 com os arquivos da main, funcionalidade, decisão proposta e prioridade. Arquivos acima de 20 MB não tiveram hash calculado nesta triagem; o bundle de 1,12 GB é o caso relevante.

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| `zapp-web-v2-todas-as-refs.bundle` e 211 objetos `.z` | Backup Git | F | Não se aplica | Fonte de recuperação de refs, não código para copiar | Histórico | DESCARTAR da integração; preservar F intacto | Baixa |
| 3 patches em `zapp-web-v2-2026-10-24/patches/` | Patches de código | F | Não comprovado; os três conflitam ou estão parcialmente aplicados à main atual | Sim | CI, contatos, tarefas, tipos e integrações | TERMINAR: comparar hunk a hunk antes de propor PR | Alta |
| Handoffs e relatórios de 24/10 | Documentação | F | Não por hash | Sim como evidência histórica | Testes, branches e worktrees | DESCARTAR da integração; usar para conferir inventário | Média |
| `r2-inb-004-etapa2/RealtimeInboxView.pagination.test.tsx` | Teste React | G | Não encontrado por nome/hash | Potencial | Paginação da inbox | TERMINAR: conferir se o comportamento e o teste continuam pertinentes | Média |
| 5 arquivos de G idênticos à main | Vários | G | Sim por SHA-256 | Não | Conforme índice | JÁ ESTÁ NA MAIN | Baixa |
| Demais 832 arquivos de G | Auditorias, logs, scripts de diagnóstico, imagens, dados | G | Não por hash, ou equivalentes não confirmados | Evidência para revisão, sem código de produto comprovado | Várias | DESCARTAR da integração; preservar G intacto | Baixa |

`DESCARTAR` neste levantamento significa **não levar o arquivo de evidência ao código da aplicação**. Nada de F ou G será apagado ou movido. A decisão sobre uma funcionalidade citada nesses arquivos será tomada a partir do código, dos testes e da necessidade atual, não pela idade do relatório.

Documentos que merecem leitura durante a Fase 4: `backups/zapp-web-v2-2026-10-24/HANDOFF_CLAUDE_ONLINE.md` (testes e trabalho em stashes), `rel-agente2-branches.md` (classificação de refs por conteúdo), `rel-agente3-worktrees.md` (alterações locais), `rel-agente5-hermes.md` (dependências de serviços), `auditorias/telefonia-fase2/ESPECIFICACAO-FASE2.md`, `auditorias/fase-j/arquivos-chat-panel-pr-*.md`, `auditorias/contatos-overlay-02-10/PROGRESSO-F10.md` e `auditorias/fase-i-89/PENDENCIA-89.md`. As auditorias de `sicoob-2026-10-13/` pertencem a outro produto e ficam fora da consolidação Zapp.

Os handoffs de 24/10 registram riscos que precisam de verificação atual: preview local servido por `~/zapp-worktrees/preview`, processos/timers que usam diretórios, 13 stashes, e refs locais potencialmente não incorporadas. Esses textos são históricos; nenhuma conclusão sobre o estado de hoje foi adotada sem medição nova.
