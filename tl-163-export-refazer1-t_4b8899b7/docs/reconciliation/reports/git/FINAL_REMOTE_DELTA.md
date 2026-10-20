# Adendo remoto final — baseline 2e7cf81 → cutoff 4e73c776

**Produzido em 2026-10-03T23:19:26.256628+00:00. Auditoria somente leitura; nenhum arquivo do checkout baseline foi alterado.**

## Resultado e limites do corte

O novo cutoff contém **um commit adicional, a PR #1870 mergeada em 3 de outubro de 2026 às 22:50:32 UTC**, com **9 arquivos alterados, +435/−176 linhas**. Há alteração funcional em Talk X X028: o webhook liga recibos à RPC canônica sem depender de `fromMe`, aguarda a atribuição de resposta e passa o telefone resolvido. **Não é um delta apenas documental.** O deploy de `evolution-webhook` no próprio cutoff foi observado como bem-sucedido, inclusive a validação de manifesto remoto pós-deploy. Isso não demonstra o aceite com leitura/resposta no celular. [Comparação imutável](https://github.com/adm01-debug/Zapp_Web_V2/compare/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6...4e73c7767858f00c577c29efd8cc86f5bea117a9); [PR #1870](https://github.com/adm01-debug/Zapp_Web_V2/pull/1870); [deploy existente](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159794805).

| Referência | SHA preservado/observado |
|---|---|
| Baseline dos relatórios e ledgers | `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6` |
| Cutoff exclusivo deste adendo | `4e73c7767858f00c577c29efd8cc86f5bea117a9` |
| Branch documental / draft PR #1869 | `a2d9f62d5a67cfd6956a66fff30b9e97af36a88f` — inalterada |
| Checkout local antes e depois | `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6` — limpo |

O commit final é filho direto do baseline: `ahead=1`, `behind=0`. A PR continha dois commits de trabalho (`823e591` e `3292547`), incorporados em um commit na main; não são três commits adicionais. Os nove arquivos foram lidos pela API no SHA imutável e seus **9 hashes Git blob foram conferidos**. As fontes exatas estão no mapa `cutoff-source/` do [arquivo de evidências](../../evidence/final-delta-evidence.json.gz), com [integridade por fonte](../../evidence/final-delta-source-integrity.json).

## Contagens adicionais, sem substituir o inventário original

O snapshot original continua com **1.828 PRs e 41 issues, IDs 1–1869**. Este adendo registra separadamente **+1 PR, #1870, já mergeada; +0 novas issues observadas** nas coleções recentes. Não recalcula estados históricos nem apresenta uma nova contagem cumulativa como se todo o inventário tivesse sido refeito. As primeiras páginas de 30 PRs/issues por criação descendente já cruzam o limite 1869; apenas #1870 está além dele.

## Todos os arquivos do delta

| Caminho | Estado | Linhas | Efeito |
|---|---|---:|---|
| `docs/talkx/v4/STATUS.md` | modified | +2 / −2 | Placar 35→36; ainda falta um marcador em relação ao cutoff. |
| `supabase/deployment-manifest.json` | modified | +8 / −8 | Hashes dos três shared files e da evolution-webhook atualizados; mantém 73 funções, configuração e allowlists. |
| `supabase/functions/_shared/__tests__/talkx-reply-window.test.ts` | modified | +38 / −63 | Remove cache/consulta client-side do contrato e cobre chamada RPC Talk X; testes Multiplix preservados. |
| `supabase/functions/_shared/__tests__/talkx-webhook-receipts.test.ts` | added | +146 / −0 | Cinco contratos Deno do handler; não substituem SQL ou tráfego real. |
| `supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts` | added | +168 / −0 | Três contratos Deno: await, opt-out e retorno sem destinatário. |
| `supabase/functions/_shared/evolution-webhook-messages.ts` | modified | +6 / −2 | Aguarda attributeTalkXReply e passa phone; atribuição Multiplix continua void. |
| `supabase/functions/_shared/evolution-webhook-msg-handlers.ts` | modified | +29 / −28 | Recibos Talk X delivered/read passam pela RPC canônica sem fromMe; gates Multiplix permanecem. |
| `supabase/functions/_shared/talkx-reply.ts` | modified | +31 / −71 | Consulta/update client-side e cache são removidos em favor de attribute_talkx_reply. |
| `tests/contracts/_adv_edge_legacy_producers.test.ts` | modified | +7 / −2 | Ratchet de arquivos 210→212 por dois testes; mapa de produtores legados e três ocorrências não mudam. |

O manifesto conserva **73 funções**, configuração e allowlists; muda o digest de fonte somente de `evolution-webhook` e dos três arquivos compartilhados indicados. **Não há migration nem mudança de SQL, front-end ou workflow YAML.** A migration X027 `20261003212707_talkx_receipts_replies.sql`, necessária à ligação, já estava no baseline.

## Adjudicação de X028 e capacidades relacionadas

**X028: PARTIAL no baseline → IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE neste adendo**, quanto ao Fazer literal do plano. A implementação nova fica acompanhada das ressalvas estáticas abaixo; não recebe `DONE_VERIFIED` nem certificação integral de comportamento. A chamada antiga já tratava `read` pelo invólucro quando `fromMe=true`: a mudança relevante é a RPC canônica e o suporte ao recibo GO com flag falso, além da nova atribuição por RPC. [Plano e aceite](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/docs/talkx/v4/etapas/F03-integridade-observabilidade-e-ensaio-real.md#L84-L93); [handler](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L94-L138); [chamador da resposta](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/evolution-webhook-messages.ts#L332-L352).

| Dimensão | Evidência e conclusão |
|---|---|
| Documentação | PR descreve X028 e o placar incrementa; o descompasso TX01 permanece. |
| Implementação | Recibos delivered/read sem gate fromMe; reply com telefone + await. A função absorve erros da RPC: await garante aguardar a tentativa, não sucesso da gravação. |
| Testes | Cinco novos contratos de recibo e três de resposta; teste da janela migra para contrato da RPC. A PR relata 796 testes Deno aprovados; essa saída não foi relida. CI principal e passo de banco X027 observados como success. |
| Runtime | Deploy existente do cutoff e validação remota pós-deploy passam. Nenhum tráfego real/consulta viva manual/novo ensaio foi executado na auditoria. |
| Aceite | O plano exige enviar/abrir no celular no ensaio X035. Não comprovado; CAP-016, CAP-017 e CAP-018 não são fechadas automaticamente. |

Os novos mocks comprovam a intenção de chamada e espera, mas não o resultado do SQL em cenários ambíguos nem o estado final do Inbox. A atribuição Multiplix continua `void`, e seus recibos continuam com o gate `fromMe===true`. O delta não resolve os achados anteriores de fila por item, draft sem confirmação, conclusão por destinatários, payload ou retry.

## Revisões adversariais do delta

Foram lidos os **4 comentários inline**, as 4 revisões e os 12 comentários da PR. Os quatro alertas inline correspondem aos três primeiros temas abaixo; a análise foi conferida no código, sem aceitar o diagnóstico do bot como prova suficiente. Os dois alertas de atribuição compartilham a mesma seleção SQL. Não foi consultado o estado de resolução de threads, e o número de comentários não é contado como quatro defeitos independentes.

### DELTA-TX-ATTRIBUTION — A ligação da RPC amplia a atribuição para candidatos ambíguos por sufixo de telefone

**STATIC_RISK_CONFIRMED · HIGH.** SQL já existia em X027; X028 passa a chamá-lo com p_phone no fluxo real da edge. O caminho antigo selecionava somente contact_id.

A assinatura não recebe conexão; a seleção reúne contato exato OU os últimos oito dígitos, ordena apenas sent_at/id e não prioriza o contato exato nem restringe a campanha à conexão de entrada. Um candidato mais recente com sufixo coincidente pode receber a resposta de outro contato ou conexão.

É risco de atribuição incorreta demonstrável por leitura da seleção, sem incidente de produção observado. X027 especifica mais recente por contato OU telefone: a ausência de prioridade não é, por si só, descumprimento literal do plano. A RPC mantém service_role-only; não se afirma bypass de RLS de agente.

**Aceite restante:** O harness cobre outro contact_id com mesmo número, mas não disputa entre contato exato e sufixo coincidente nem duas conexões. Exige decisão/correção de escopo e ensaios direcionados antes de aceitar atribuição sem ressalvas.

Evidências: [fonte 1](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/talkx-reply.ts#L77-L100); [fonte 2](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/evolution-webhook-messages.ts#L332-L350); [fonte 3](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/migrations/20261003212707_talkx_receipts_replies.sql#L335-L429).

### DELTA-TX-INBOX — O recibo corrigido para a campanha ainda pode deixar a mensagem enviada no Inbox sem atualização

**PREEXISTING_GAP_NOT_FIXED · MEDIUM.** O filtro de messages e o fallback já existiam e não são corrigidos no delta; o novo caminho permite a campanha avançar mesmo com fromMe=false.

A consulta de messages usa sender=contact quando fromMe=false. A RPC canônica pode confirmar o destinatário outbound, mas o handler não volta para atualizar a mensagem agent. A cadeia final ainda chega ao fallback que tenta upsert de uma mensagem contact quando resolve o contato.

Confirma-se o caminho de código; a inserção efetiva do placeholder depende de contato resolvível e constraints do banco. Não se afirma duplicação observada. Os novos mocks retornam null para messages/contatos e não provam o estado do Inbox.

**Aceite restante:** Exercitar recibo GO com fromMe=false, destinatário Talk X e mensagem agent reais; confirmar status monotônico e ausência de placeholder contact.

Evidências: [fonte 1](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L94-L138); [fonte 2](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L186-L218); [fonte 3](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/__tests__/talkx-webhook-receipts.test.ts#L24-L46).

### DELTA-TX-LOG — O novo aviso de não-casamento também é emitido para recibos duplicados válidos

**NEW_STATIC_DEFECT · LOW.** O ramo de warn para todo retorno false é novo; a semântica booleana da RPC já existia.

A RPC retorna false tanto quando não encontra destinatário como quando delivered_at/read_at já está preenchido. O handler traduz todos esses resultados como did not match a recipient. A idempotência dos contadores permanece, mas o diagnóstico é inexato.

O teste de repetição fixa o mock em true nas duas chamadas; por isso não cobre o false real da segunda chamada. Não se afirma aumento duplicado de contadores.

**Aceite restante:** Distinguir already_recorded de no_match na resposta ou no diagnóstico, preservando idempotência.

Evidências: [fonte 1](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L125-L136); [fonte 2](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/migrations/20261003212707_talkx_receipts_replies.sql#L248-L282); [fonte 3](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/supabase/functions/_shared/__tests__/talkx-webhook-receipts.test.ts#L100-L109).

### DELTA-TX-STATUS — STATUS continua um marcador atrás: 36 registrados e 37 detectáveis

**BASELINE_FINDING_PERSISTS · MEDIUM.** O arquivo passa de 35 para 36; o conjunto de títulos cresce de 36 para 37 ao acrescentar X028.

O avanço do placar não encerra TX01/X002. A contagem foi recomposta a partir do histórico baseline mais o único commit do delta, sem checkout novo ou execução do produto.

Marcador de commit não é comprovação de aceite. Não foi executado --check no cutoff; o descompasso aritmético e a regra do gerador foram conferidos.

**Aceite restante:** Regenerar o placar no fluxo próprio e conservar a distinção entre marcador Git e tarefa aceita.

Evidências: [fonte 1](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/docs/talkx/v4/STATUS.md#L1-L20); [fonte 2](https://github.com/adm01-debug/Zapp_Web_V2/blob/4e73c7767858f00c577c29efd8cc86f5bea117a9/scripts/talkx/v4-status.mjs#L120-L151).

## CI e deploy no cutoff

**14 check runs:** 9 success, 3 failure, 1 cancelled e 1 skipped. O combined status `success` corresponde aos dois contextos Vercel e não representa aprovação de todos os checks. O head da PR também teve DB offline success; a execução posterior da main falhou, portanto não se transporta o verde do head para todo o cutoff. Fontes completas: `cutoff-checks.raw.json`, `cutoff-status.raw.json`, `pr-1870-head-checks.raw.json` e `cutoff-*-jobs.raw.json`.

| Workflow existente | Run | Resultado |
|---|---|---|
| [Deploy Edge Functions (evolution-webhook)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159794805) | `37159794805` | success |
| [Talk X V4 placar regen (push)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790924) | `37159790924` | success |
| [Auto Update PR Branches](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790883) | `37159790883` | success |
| [DB Live Guard](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790900) | `37159790900` | failure |
| [DB Guard (offline)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790891) | `37159790891` | failure |
| [CI/CD Pipeline](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790909) | `37159790909` | success |
| [E2E logado](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790899) | `37159790899` | cancelled |

O job de deploy registrou sucesso em provar checkout imutável, validar manifesto local, executar Deploy, validar manifesto remoto pós-deploy e registrar rastreabilidade. Terminou às 22:52:38 UTC; o run terminou às 22:52:39 UTC. Não se disparou novo deploy. [Job do deploy](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159794805/job/111310707341).

O DB Live falha em **Consolidar veredito do contrato vivo**. O DB offline falha no passo **Provar RLS de escrita em talkx_settings — admin persiste, agente não (V06)**, enquanto o passo X027 de recibos/respostas passa. **O nome do passo não prova violação RLS:** sem logs, a causa exata não foi reclassificada; tampouco se reaplica automaticamente a causa de bootstrap do run baseline. O Sonar informa Reliability D e Security C onde exige A, sem nova enumeração de findings do serviço. [DB Live](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790900); [DB offline](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37159790891); [check Sonar](https://sonarcloud.io/dashboard?id=adm01-debug_Zapp_Web_V2&branch=main).

As tentativas de ler logs/annotations via `github_fetch` foram rejeitadas como endpoints não suportados. O adendo encerra com os checks e passos já recuperados, conforme instrução de escopo; não se alega que logs não existam ou que não haja outro conector. Neste adendo, nenhuma suíte, execução de produto, consulta SQL viva, workflow ou mensagem externa foi disparada pelo auditor.

## Como integrar ao relatório baseline

Preservar os ledgers e as contagens em `2e7cf81`; anexar este corte datado em `4e73c776`. Retirar somente a leitura de que a ligação X028 ainda não foi implementada depois do cutoff. Manter o aceite real pendente e registrar os três riscos residuais, além do placar ainda desatualizado. Nenhum outro achado de Dashboard, Telefonia, Arquivos, Gmail/IA, TeamChat ou Multiplix é encerrado por estes nove arquivos. Não é uma nova auditoria integral de main.

Dados estruturados: [final-delta.json](../../evidence/final-delta.json). Achados, trechos imutáveis, fontes completas e metadados de PR/commits/checks/jobs estão no [arquivo de evidências do delta](../../evidence/final-delta-evidence.json.gz), indexado pelos nomes originais dos arquivos.
