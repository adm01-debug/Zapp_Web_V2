# Taxonomia e significado dos estados

## Requisitos

| Estado | Interpretação |
| --- | --- |
| DONE_VERIFIED | Aceite específico comprovado no escopo descrito; pode ser exclusivamente documental ou estático. |
| PARTIAL | Há entrega útil, mas parte do contrato, integração ou aceite continua faltando. |
| NOT_IMPLEMENTED | O requisito ou a parte delimitada foi procurado e não foi encontrado na implementação examinada. |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | Implementação identificada; execução e aceite correspondentes ainda não comprovados. |
| VALIDATED_FAIL | Uma verificação concreta falhou; consultar se foi guard, probe, contrato ou medição. |
| SUPERSEDED | Requisito substituído por sucessor ou decisão identificados; não executar literalmente. |
| DUPLICATE | Mesmo compromisso identificado em outra origem; preservar o vínculo. |
| NO_LONGER_APPLICABLE | Cancelamento ou inaplicabilidade sustentados por decisão/evidência. |
| PRODUCT_DECISION_REQUIRED | Intenção ou arquitetura precisa de decisão antes de implementação. |
| BLOCKED_EXTERNAL | Aceite depende de sistema, acesso, fornecedor ou ação externa. |
| BLOCKED_TECHNICAL | Bloqueio técnico impede a próxima verificação ou entrega. |
| HUMAN_ACCEPTANCE | Aceite específico exige avaliação humana ainda não comprovada. |
| OBSERVATION_WINDOW | Exige período de observação; execução pontual não o substitui. |
| ACTIVE_REGRESSION | Entrega posterior reintroduziu ou deixou ativo o defeito descrito. |
| NEEDS_REVALIDATION | Evidência histórica, incompleta ou de linhagem não certifica o estado atual. |
| UNKNOWN | A revisão realizada não permite uma conclusão mais específica. |

## Código e resíduos

`ACTIVE`, `LEGACY_USED`, `LEGACY_UNUSED`, `DEAD_CANDIDATE`, `DEAD_CONFIRMED`, `DUPLICATE_IMPLEMENTATION`, `EXPERIMENTAL`, `GENERATED`, `HISTORICAL_REQUIRED`, `HISTORICAL_UNVERIFIABLE`, `UNKNOWN`. Classificações auxiliares do inventário preservam o motivo exato, como barrel sem importador ou componente planejado não ligado.

| Confiança | Consequência |
| --- | --- |
| DELETE-A | Morte comprovada; ainda exige missão de remoção autorizada. |
| DELETE-B | Indícios fortes; provar consumidores e efeitos antes de excluir. |
| DELETE-C | Legado consumido; migrar consumidor primeiro. |
| DELETE-D | Evidência insuficiente; preservar. |
| DELETE-X | Histórico, contrato, configuração ou entrega planejada a preservar. |

`HISTORICAL_REQUIRED` não vira DELETE-A porque não tem consumidor de runtime. Esta auditoria não autoriza exclusões.

## Git

`ACTIVE_WORK`, `OPEN_PR`, `MERGED_EXACT`, `MERGED_SQUASH`, `SUPERSEDED`, `UNMERGED_UNIQUE_WORK`, `AUTOMATION_BRANCH`, `STALE_WITH_VALUE`, `SAFE_TO_DELETE`, `UNKNOWN`. O inventário Git também conserva classificações descritivas da comparação; nenhuma equivale a instrução automática de merge ou poda.
