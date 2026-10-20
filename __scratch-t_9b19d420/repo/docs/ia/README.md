# Bloco 01 do Plano IA 200 Etapas — Escopo, evidências e regras de execução

Artefatos das etapas **IA-001 a IA-010** do
[`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md) (v1.0,
plano do Codex/Claude sobre a referência `5209b8a`).

**Referência de execução congelada:** `origin/main` @ `0ab84095d34548124d0feefb6cdec0dedda7c5fe`
(tree `8f10f51497060231cda043e764392cc5b040f890`, 29/09/2026 14:19 -0300) — contrastada com a do plano em
`IA-001`. **Nenhum arquivo de IA/voz/classificação mudou** entre as duas: os achados do plano seguem
válidos. Este bloco **não altera código, banco nem configuração** — entrega evidência.

## Índice por etapa

| Etapa | Arquivo | O que entrega | Estado |
|---|---|---|---|
| IA-001 | [`IA-001-referencia-de-execucao.md`](./IA-001-referencia-de-execucao.md) | Referência fixada, drift desde a auditoria, regra de revalidação por bloco | ✅ |
| IA-002 | [`IA-002-inventario-fluxos.md`](./IA-002-inventario-fluxos.md) + [anexo edge functions](./IA-002-inventario-functions-ia.md) + [anexo frontend](./IA-002-inventario-frontend-ia.md) | 59 pontos de UI e 25 funções de IA mapeados: gatilho, hook, provedor, modelo (cliente × servidor), tabela, efeito, permissão e teste | ✅ (2 recursos sem consumidor no repo — §3) |
| IA-003 | [`IA-003-registro-achados.md`](./IA-003-registro-achados.md) | Registro rastreável: 10 achados do plano (A1–A10) + 10 achados novos (B1–B10), classificados em defeito/risco/externo/proposta, com o teste que prova cada correção | ✅ |
| IA-004 | [`IA-004-matriz-autorizacao.md`](./IA-004-matriz-autorizacao.md) | Matriz de autorização por capacidade × perfil (leitura/sugestão/alteração/envio/configuração), 13 lacunas (3 altas), 40 cenários negativos propostos; multi-tenancy **provado inexistente** | ✅ |
| IA-005 | [`IA-005-metas-de-qualidade.md`](./IA-005-metas-de-qualidade.md) | 12 metas propostas + linhas de base medidas; latência e custo explicitamente "a medir" | ✅ |
| IA-006 | [`IA-006-natureza-e-verificacao-dos-achados.md`](./IA-006-natureza-e-verificacao-dos-achados.md) | Verificação dos 10 achados no código (10/10 confirmados) e classificação da natureza de cada indicador (generativo × determinístico × manual × importado) | ✅ |
| IA-007 | [`IA-007-reuso-infraestrutura.md`](./IA-007-reuso-infraestrutura.md) | Infraestrutura existente (filas, leases, outbox, rate limit, ledger, flags, telemetria, crons) × o que o plano precisa: **reusar / estender / criar**, e o que é legado a não usar | ✅ |
| IA-008 | [`IA-008-organizacao-das-entregas.md`](./IA-008-organizacao-das-entregas.md) | Os 20 blocos mapeados em 20 PRs, com dependências, classe de DDL e onde há autorização humana necessária | ✅ |
| IA-009 | [`IA-009-desligamento-seguro.md`](./IA-009-desligamento-seguro.md) | Desenho de kill switch por capacidade/bot/provedor; lacuna provada: `feature_flags` só é lida no cliente | ✅ (implementação nos blocos 02/05/11) |
| IA-010 | [`IA-010-ambiente-de-ensaio.md`](./IA-010-ambiente-de-ensaio.md) | Especificação de dados sintéticos por departamento, 4 perfis, credencial de homologação por referência | ✅ (provisionamento com **artefato pronto** — `scripts/ia/ensaio-provisionamento.mjs`, cartão SL-059; o DML grava só departamentos/filas/contatos/mensagens — **nenhum perfil/usuário/papel**, identidade exigiria escrita em `auth`; execução no banco canônico **não** feita: escrita em produção, ver IA-010 §6) |
| IA-011..020 | [`IA-011-a-IA-020-contencao-P0.md`](./IA-011-a-IA-020-contencao-P0.md) + [laudo adversarial](./IA-011-a-IA-020-verificacao-adversarial.md) | **Bloco 02 (P0)** — identidade nas funções de IA sem guarda, assinatura de webhook bloqueante, autorização por objeto no áudio; mais o laudo de 5 verificadores adversariais (achados, correções e o que não foi provado) | ✅ entregue (lotes A e B; 2 regressões do lote A corrigidas). O `ELEVENLABS_WEBHOOK_SECRET` foi instalado e as 2 funções publicadas em 30/09/2026 — o defeito A9 está **fechado em produção** (sonda com assinatura falsa → `401`) |
| IA-021..030 | [`IA-021-a-IA-030-contratos-integridade.md`](./IA-021-a-IA-030-contratos-integridade.md) | **Bloco 03 (P0/P1)** — vocabulário canônico único (sentimento/urgência/prioridade) em `supabase/functions/_shared/`, consumido pelo front por re-export (sem cópias duplicadas), contrato de mensagens com limite agregado, validação de toda saída de modelo com envelope, persistência completa da análise com projeção transacional e trava de recência, etiquetas atômicas e identidade da memória por contato | ✅ entregue em 4 PRs (#1279, #1381, #1402, #1413 e a correção de docs #1421); migrations aplicadas e provadas no banco canônico |
| IA-031..040 | [`IA-031-a-IA-040-camada-de-provedores-e-capacidades.md`](./IA-031-a-IA-040-camada-de-provedores-e-capacidades.md) | **Bloco 04 (P1)** — camada única de provedores: roteamento determinístico no servidor, capacidades declaradas por provedor, fallback explícito e autorizado, teste do provedor real, despacho central para as 6 capacidades de texto (fim do gateway fixo) e visão por modalidade com imagem embutida | ✅ entregue em 4 PRs (#1434, #1444, #1465, #1487) |
| IA-041..050 | [`IA-041-a-IA-050-execucao-resiliente-filas-e-consumo.md`](./IA-041-a-IA-050-execucao-resiliente-filas-e-consumo.md) | **Bloco 05 (P1)** — execução resiliente e controle de consumo: prazos por capacidade, retentativas disciplinadas com jitter, limite compartilhado atômico e reserva de orçamento, fila durável de jobs com estados padronizados, efeitos idempotentes, cancelamento fora de contexto, ledger de uso garantido e **circuito por provedor** | ✅ entregue em 5 PRs (#1510, #1529, #1546, #1571, #1602), cobrindo **IA-041..IA-049**; **IA-050 (abrir circuito)** ficou pendente na série e foi entregue depois, no cartão `t_4e3bf2dc` — `supabase/functions/_shared/ai-circuit.ts` + gate no despacho (`ai-generate.ts`), provado por `ai-circuit.test.ts` (vermelho→verde). A degradação honesta (429/402/504, `denied` × `infrastructure_error`) já existia; o que a IA-050 acrescentou foi a **suspensão por falhas repetidas** com limiar/janela/recuperação — são mecanismos distintos |
| IA-171..180 | [`IA-171-a-IA-180-agentes-especializados.md`](./IA-171-a-IA-180-agentes-especializados.md) | **Bloco 18 (P3)** — estado REAL das dez etapas na ponta de 08/10: **IA-177 implementada** (treinamento) e as demais pendentes; o inventário de 07/10 erra para IA-177 | evidência revisada, camada (catálogo de ferramentas, executor, propostas) **não construída** |

## Os três achados que este bloco já deixa provados (base do Bloco 02, P0)

1. **4 funções de IA paga sem identidade, sem cota e sem trilha** (`voice-agent`, `classify-audio-meme`,
   `classify-emoji`, `classify-sticker`) — o único gate é o `verify_jwt` do gateway, que aceita a **anon
   key pública** do bundle (`IA-003` B1).
2. **`elevenlabs-webhook` é público e "autentica" só por log**: a assinatura é coletada e descartada, e o
   corpo cru de qualquer requisição vai para `audit_logs` com service role (`IA-003` A9).
3. **`ai-transcribe-audio` baixa áudio de bucket privado sem checar posse do objeto** (`IA-003` A10).

## Limites deste bloco (declarados, não mascarados)

- Não houve execução de feature, chamada paga, migration, deploy ou escrita no banco canônico — por
  desenho do Bloco 01 e porque dependem de autorização (ver `IA-008` §2 e `IA-010` §3).
- Estado de produção (grants do CRM externo, secrets publicados, quais funções estão no ar) **não** foi
  certificado: só com acesso do Joaquim (IA-018/IA-191).
- Contagens de função/manifesto foram lidas no workspace desta tarefa (`origin/main`); a cópia de
  referência está 2 commits atrás e mostraria 2 funções a mais (`IA-001` §3.1).

## Próximos blocos

Os blocos **01 a 05 estão entregues** (etapas IA-001..IA-050 — a última pendência, IA-050,
foi fechada nos cartões `t_4e3bf2dc` e `t_e8ffed10`: circuito por provedor derivado do ledger
`ai_usage_logs`, com sonda única de recuperação via `edge_rate_limits`. Erros HTTP 4xx permanentes
do pedido permanecem auditados como `request_error`, mas não alimentam o limiar do circuito):

- **Bloco 04 — Camada única de provedores e modelos (IA-031..IA-040, P1)**:
  [`IA-031-a-IA-040-camada-de-provedores-e-capacidades.md`](./IA-031-a-IA-040-camada-de-provedores-e-capacidades.md).
- **Bloco 05 — Execução resiliente, filas e controle de consumo (IA-041..IA-050, P1)**:
  [`IA-041-a-IA-050-execucao-resiliente-filas-e-consumo.md`](./IA-041-a-IA-050-execucao-resiliente-filas-e-consumo.md).

O **Bloco 02 (P0)** está entregue: o secret `ELEVENLABS_WEBHOOK_SECRET` foi instalado e o
`elevenlabs-webhook` e o `classify-audio-meme` publicados em 30/09/2026 — o defeito A9 está fechado em
produção. O deploy das Edge Functions **não** depende de aprovação: o merge na `main` dispara o
`deploy-functions.yml` (o environment `producao-edge-functions` tem só branch policy — medido: nenhum card
de aprovação aparece).

Continuação prevista: **Bloco 06 (IA-051..IA-060)**.

### Bloco 06 — estado de IA-058: DESIGN_ONLY

**IA-058 ([M] Alertar sobre consumo anômalo) não está implementada em operação.** O que existe
é o **projeto** — [`PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md`](../audits/PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md),
publicado em #1839 —, que fixa escopos, sinais, limiares, a identidade do incidente
(deduplicação) e o formato do bloqueio por capacidade, para não projetar no vazio (F60, ledger
de uso, preços versionados e limite por janela já medidos no repositório).

**Estado: DESIGN_ONLY (projeto), distinto de runtime.**

**Nenhum alerta e nenhum bloqueio de capacidade existem em operação por essa entrega:** o
próprio documento declara que o mecanismo é futuro e que nada foi implementado nesta etapa.
Contar o projeto como alerta disponível falsearia o estado do produto — a implementação do
mecanismo é trabalho separado, ainda não realizado.
