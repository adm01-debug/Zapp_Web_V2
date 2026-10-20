# Planos complementares — TALK ME, volume de mídia e Skins Opera GX

**Resultado: 300 de 300 requisitos reconciliados individualmente.** TALK ME100, refinamento50, volume50 e Skins100 estão em `tasks.json`, com IDs globais e texto integral preservados. O trabalho autorizado de auditoria está completo; isso não significa que todos os produtos receberam aceite de produção.

**Baseline:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. O delta posterior da main referente à PR #1870/X028 pertence a um adendo separado e não altera estes registros.

## Cobertura e estados

| Estado | TALK ME100 | Refinamento50 | Volume50 | Skins100 | Total |
|---|---:|---:|---:|---:|---:|
| ACTIVE_REGRESSION | 0 | 0 | 3 | 0 | 3 |
| BLOCKED_EXTERNAL | 0 | 0 | 0 | 19 | 19 |
| DONE_VERIFIED | 17 | 5 | 19 | 52 | 93 |
| HUMAN_ACCEPTANCE | 5 | 0 | 0 | 0 | 5 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 51 | 34 | 23 | 8 | 116 |
| NEEDS_REVALIDATION | 4 | 3 | 1 | 6 | 14 |
| NO_LONGER_APPLICABLE | 0 | 0 | 0 | 2 | 2 |
| OBSERVATION_WINDOW | 1 | 0 | 0 | 0 | 1 |
| PARTIAL | 21 | 8 | 3 | 11 | 43 |
| SUPERSEDED | 1 | 0 | 0 | 0 | 1 |
| VALIDATED_FAIL | 0 | 0 | 1 | 2 | 3 |

Os estados separam entrega de código, teste, runtime, decisão, observação e homologação. `DONE_VERIFIED` só vale para o aceite específico efetivamente conferido — frequentemente contrato puro, documento ou evento Git. Não há certificação global de navegador, dispositivo ou banco vivo.

## Achados que alteram o próximo trabalho

| ID | Prioridade | Resultado e limite |
|---|---|---|
| VOL-02 | P1 | O player de gravação atual de Telefonia está desconectado do volume global. A ref/hook ficou no shell; RecordingPlayer renderiza o áudio sem ela. Condicionado a uma gravação disponível e URL válida; nenhum áudio real foi buscado. |
| SK01 | P2 | Autosave ignora falha de armazenamento e marca a configuração como salva. Reprodução do hook real com estado/storage em memória. |
| SK02 | P2 | JSON null no storage causa TypeError em loadThemeConfig. Reprodução do módulo real; não há incidente de produção observado. |
| VOL-01 | P2 | Play nativo cria AudioContext sem GainNode e detach não fecha o contexto. Probe:1 contexto,0 nós,0 close; fallback com dois players libera corretamente no último. |
| TM-01 | P2 | Prévia permanece em duas linhas da última mensagem; expansão/histórico antes de claim não está materializado. Mídia textual é decisão distinta já preservada. |
| TM-02 | P2 | Cliente não distingue resposta incerta do claim nem desabilita especificamente offline; SQL idempotente já existe. Inspeção estática, sem timeout real induzido. |
| TM-03 / TM-04 / TM-05 / SK03 | P2–P3 | Fechamentos agregados não provam revisão autenticada online, piloto, p95, observação ou todos os artefatos visuais/E2E. Não anulam as entregas e testes históricos. |
| VOL-03 / SK04 | Decisão preservada | Ajuste global AA foi revertido por #1458 para restaurar azul corporate. Trata-se da mesma causa/decisão compartilhada, não duas regressões independentes a executar. |
| VOL-04 / VOL-05 | Limites de prova | Matriz de hardware e audição não foi executada. E2E de controles/persistência não equivale a áudio/vídeo ouvido no dispositivo. |
| VOL-06 | Resíduo documental/Git | Ref da branch final aparece no inventário global, com um commit documental exclusivo e teste já idêntico à main. Não autoriza exclusão automática. |

Os 15 registros de `findings.json` incluem defeitos, limites de prova e decisões aceitas; não representam 15 bugs independentes. `affected_tasks` foi normalizado para IDs globais e o tipo de prova para STATIC/LOCAL_REPRO. `proof_detail` preserva o método original.

## Decisões já fechadas

- Volume E41: a linha adicional no CLAUDE foi dispensada. Não há trabalho restante nesse recorte.
- Volume E45: criar áudio fictício em produção foi explicitamente recusado. O test.fixme permanece e essa subparte é NO_LONGER_APPLICABLE no escopo decidido.
- D6: a evolução para SoundVolumeControl foi aceita. Não reverter para o componente antigo.
- Alto contraste: #1416 sobrevive; #1847 trata a preferência do sistema; #1533 atualiza o espelho de muted-foreground claro. O ajuste global AA #1435 foi revertido deliberadamente por #1458; não reaplicá-lo às cegas.
- TALK ME: fila como departamento, contato/conversa como unidade, seleção sem atribuição, mídia por texto alternativo, movimento manual e flag com seed habilitada são decisões documentadas. A auditoria não pede que sejam respondidas novamente.

## Evidências locais e histórico

Foram executadas 307 verificações locais de módulos reais com substitutos explícitos de DOM/storage/WebAudio/estado de hook:299 de Skins e8 de volume.304 critérios passaram;3 reproduziram defeitos. O harness de volume concluiu8/8 como esperado, inclusive o caso que evidencia a falha do requisito. Não foram testes em navegador real, suíte Vitest inteira, consulta SQL viva ou audição em aparelho.

No TALK ME, o trabalho desta frente leu código, assertions dos testes, SQL, relatórios e PRs. Não instalou dependências nem reexecutou o fluxo. A exclusão mútua possui script PostgreSQL descartável e resultado histórico; não se afirmou que ele rodou novamente. Publicação por buildId e revisão visual local foram separadas da homologação autenticada online.

## Relatórios completos por frente

- `TALK_ME_REPORT.md`: análise e índice das150 etapas, cinco achados, cadeia #1301/#1310/#1316/#1348/#1352/#1367/#1377.
- `VOLUME_REPORT.md`:50 etapas com fonte em cada linha, exceções aprovadas e regressão cruzada de Telefonia.
- `SKINS_REPORT.md`:100 etapas, checkpoints,299 verificações e dois defeitos reproduzidos.

## Artefatos reproduzíveis

| Arquivo | Finalidade |
|---|---|
| skins_probe.mjs | Importa presets reais e usa estado síncrono mínimo para o hook; sem rede. |
| skins_probe_results.json | 299 resultados, hashes dos fontes e limitações. |
| volume_offline_probe.mjs | Executa store e binding reais com APIs simuladas; sem rede. |
| volume_offline_results.json | Oito probes, incluindo liberação do contexto nativo/fallback. |
| talk_me_pr_evidence.json / volume_pr_evidence.json / skins_pr_evidence.json | PRs, commits e arquivos efetivamente alterados; relatos históricos separados. |
| integrity-validation.json | 300 IDs únicos, linhas de origem e ranges existentes, HEAD e árvore preservados. |

Os relatórios mantêm o deliverable completo em conjunto com o ledger. Nenhum código da aplicação, arquivo da main, branch, banco, provider, deploy, skin ativa ou fixture de produção foi alterado por esta frente.
