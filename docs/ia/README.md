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
| IA-010 | [`IA-010-ambiente-de-ensaio.md`](./IA-010-ambiente-de-ensaio.md) | Especificação de dados sintéticos por departamento, 4 perfis, credencial de homologação por referência | ✅ (provisionamento **não** executado: escrita em produção) |
| IA-011..020 | [`IA-011-a-IA-020-contencao-P0.md`](./IA-011-a-IA-020-contencao-P0.md) + [laudo adversarial](./IA-011-a-IA-020-verificacao-adversarial.md) | **Bloco 02 (P0)** — identidade nas funções de IA sem guarda, assinatura de webhook bloqueante, autorização por objeto no áudio; mais o laudo de 5 verificadores adversariais (achados, correções e o que não foi provado) | 🟡 lotes A e B entregues (2 regressões do lote A corrigidas); política (IA-015/016/017/019/020) nos blocos 03/04/05; deploy de 2 funções + `ELEVENLABS_WEBHOOK_SECRET` pendentes de você |

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

## Próximo bloco

**Bloco 03 — Qualidade do sinal de IA (IA-021..IA-030, P0/P1)**: normalizações únicas de sentimento/prioridade,
histórico de análise sem perda de campo, memória por contato e invalidação de estado de tela.

**Bloco 02 (P0) — em andamento:** o lote de contenção (IA-011/012/013/014) está em
[`IA-011-a-IA-020-contencao-P0.md`](./IA-011-a-IA-020-contencao-P0.md), com as etapas de política
apontadas para os blocos 03/04/05. O que ainda **depende de você** para chegar a produção: aprovar o
deploy das Edge Functions e criar o secret `ELEVENLABS_WEBHOOK_SECRET` (a verificação de assinatura é
falha fechada: sem o secret, o webhook da ElevenLabs recusa os eventos).
