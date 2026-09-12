# Arquivo de auditoria Talk X — triagem de 11/09/2026

Atualizado em 12/09/2026 a partir da `main` `cb6862e93db42b5f7973b66990847143ec08cc72`.

## Finalidade

Este índice impede que diagnósticos de uma versão antiga sejam confundidos com o estado atual do produto. Os relatórios foram preservados como evidência histórica; o código produtivo, o banco canônico e o aceite visual devem ser avaliados por evidências posteriores.

| Artefato | Estado | Uso correto |
|---|---|---|
| [Diagnóstico inicial](talkx-2026-09-11/DIAGNOSTICO_CAMPANHAS.md) | Histórico; achados técnicos resolvidos em parte | Explica a origem dos gaps C01–C15 no baseline `9251ac45` |
| [Revisão do plano](talkx-plan-review-2026-09-11/REVISAO_100_ETAPAS.md) | Histórico/superado | Registra a primeira matriz 001–100 no baseline `5aeb75ca` |
| [Revalidação integral](talkx-revalidation-2026-09-11/REVISAO_100_ETAPAS.md) | Histórico; bloqueadores B01–B07 tratados | Registra as provas adversariais no baseline `5363f4a9` |
| [Snapshot de evidências](talkx-revalidation-2026-09-11/evidence-snapshot.json) | Histórico e imutável | Permite conferir hashes e contexto daquela rodada, sem significar aceite atual |
| [Plano de recuperação](../talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md) | Ativo | Fonte do escopo e do estado atual conservador |
| [Referências visuais](../talkx/references/README.md) | Ativas e imutáveis | Fonte de composição das 17 telas, sempre adaptada ao tema carvão |

## Classificação dos achados do diagnóstico inicial

| Achados | Estado em 12/09/2026 | Evidência principal |
|---|---|---|
| C01, C04, C05 | Resolvidos | Rota restaurável, identidade idempotente, revisão e duplicação cobertas por testes do editor/rota e RPC de draft |
| C06 | Resolvido no contrato de fuso; recorrência continua pendente | Testes de DST/round-trip, migration de timezone e scheduler |
| C07 | Resolvido no caso observado | Botão inválido usa `disabled` real; teste positivo do wizard |
| C08–C10 | Resolvidos em parte | Métricas fabricadas removidas e contrato de analytics; atribuição comercial completa continua pendente |
| C11–C12 | Resolvidos em parte | Supressão revalidada no claim e ACL runtime; UX/importação/exportação integral ainda pendente |
| C13 | Resolvido no snapshot de audiência | RPC atômica de draft/destinatários e contadores gerenciados pelo banco |
| C14–C15 | Resolvidos no núcleo de entrega | Leases, fencing, resultado desconhecido, conexão viva e snapshot de mensagem; dispatcher durável completo permanece pendente |
| C02–C03 | Pendentes em parte | Composição da tela 08, filtros sem UI/dados completos e CRM 360° ainda não alcançam a referência |

## Classificação dos bloqueadores da revalidação

| Bloqueador | Estado | Evidência positiva que o substituiu |
|---|---|---|
| B01 — regressão CRUD/FSM | Resolvido | `scripts/db-audit/talkx-campaign-state-transitions.test.sh` |
| B02 — falha no 20º envio | Resolvido no handler | `scripts/db-audit/talkx-delivery-leases-contract.test.mjs` e validação TypeScript/Deno |
| B03 — supressão/janela durante envio | Resolvido no claim e na janela; operação contínua ainda requer observabilidade | `scripts/db-audit/talkx-delivery-leases.test.sh` e `talkx-schedule-timezone-contract.test.mjs` |
| B04 — resultado externo ambíguo | Resolvido com quarentena e fencing | `talkx-delivery-leases.test.sh` |
| B05 — ACK/correlação concorrente | Resolvido com recibo atômico e ACK idempotente | `talkx-delivery-leases.test.sh` |
| B06 — integridade do rascunho | Resolvido no contrato persistente | `talkx-draft-save.test.sh` e `useCampaignEditor.test.tsx` |
| B07 — ACL/constraints runtime | Resolvido | PR #371, migration `20260912140000` e `talkx-recovery-runtime.sql` |

## Destino dos probes temporários

Os oito arquivos de probe/configuração não foram versionados. Eles afirmavam o comportamento defeituoso, portanto um `PASS` significava regressão confirmada. Manter esses arquivos na suíte oficial criaria um sinal invertido e duplicaria cobertura já promovida.

| Probe histórico | Cobertura positiva canônica |
|---|---|
| `observed-gaps.repro.tsx` e `editor-gaps.repro.tsx` | `src/components/talkx/__tests__/useCampaignEditor.test.tsx`, `TalkXView.route.test.tsx`, `talkxCampaignDraft.test.ts` e `src/hooks/integrations/__tests__/useTalkXSegments.test.ts` |
| `database-gaps.repro.sh` e `crud-probe.mjs` | `scripts/db-audit/talkx-campaign-state-transitions.test.sh`, `talkx-draft-save.test.sh` e `talkx-draft-recipients.test.sh` |
| `runtime-probes.mjs` | `talkx-delivery-leases.test.sh`, `talkx-delivery-leases-contract.test.mjs`, `talkx-schedule-timezone-contract.test.mjs` e `talkx-scheduler-contract.test.mjs` |
| `main-webhook-probes.mjs` | recibos/ACK idempotentes em `talkx-delivery-leases.test.sh` e contratos do handler compartilhado |
| dois `vitest.config.ts` temporários | configuração oficial do projeto |

## Regras de leitura

- “Resolvido” vale apenas para o defeito explicitamente reproduzido, não para toda a etapa do plano.
- “Parcial” não é aceite visual nem autorização para atualizar baselines.
- Os 17 PNGs são especificação visual; números e capacidades ilustrados não são dados reais.
- O tema oficial permanece carvão. Azul é acento, não substituição do design global.
- Evidência do banco exige migration, teste comportamental e atestação no projeto canônico `tnnnlkbymytvtqngbbqh`.
