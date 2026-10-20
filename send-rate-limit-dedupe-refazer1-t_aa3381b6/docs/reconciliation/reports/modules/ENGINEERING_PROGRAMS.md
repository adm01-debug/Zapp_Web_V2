# Reconciliação dos programas de engenharia — 200 etapas

**Baseline:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`, main auditada em 03/10/2026. **Cobertura documental:** 200/200 requisitos, cada um com adjudicação individual. **Escopo:** somente leitura do repositório e reaproveitamento das evidências já coletadas; nenhum novo runtime, deploy, dispatch, SQL ou chamada externa.

## Autoridade e método

Os programas são **complementares**, com dois conjuntos distintos de IDs 001–100:

- [Handoff Cline, 30/08/2026](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/handoffs/handoff_cline_100_etapas_2026_08_30.md), extraído de `audit/modules/root/extra-tasks.json`.
- [Paridade V1/V3, 01/09/2026](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md), extraído de `audit/global/tasks.extracted.json`.

Nenhum programa foi substituído pelo outro. As referências «≈ Cline» foram preservadas como relações entre compromissos, sem deduplicar seus aceites. O ledger conserva IDs globais, números, texto integral, linhas, source SHA e declaração histórica; acrescenta estado atual, rationale, review_level, implementação, testes, runtime, aceite, evidências e trabalho restante.

Todos os enunciados foram lidos. As conclusões usam revisão semântica já concluída dos módulos, checks e PRs coletados, e inspeções locais delimitadas de contratos. Foram confirmados **203 caminhos** de fonte; ausências nominais são registradas separadamente, inclusive objetos do catálogo versionado. A ausência de um arquivo proposto não exclui uma alternativa com outro nome, e catálogo versionado não é consulta do banco vivo.

**Presença de arquivo, checkbox ou PR não gera DONE automaticamente.** Há 19 registros com `review_level=DOCUMENTARY_ONLY`, todos `NEEDS_REVALIDATION`. Outros cinco registros também exigem revalidação por falta de medição suficiente. Os níveis restantes são 48 revisões diretas de contrato, 71 reutilizações de revisão semântica e 62 revisões delimitadas de artefatos/catálogo. Essas contagens descrevem a evidência da adjudicação; não são métricas de qualidade do produto.

## Estados reconciliados

| Estado | Cline | Paridade | Total |
|---|---:|---:|---:|
| DONE_VERIFIED | 1 | 0 | 1 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 2 | 2 | 4 |
| PARTIAL | 61 | 70 | 131 |
| NOT_IMPLEMENTED | 1 | 21 | 22 |
| NEEDS_REVALIDATION | 24 | 0 | 24 |
| VALIDATED_FAIL | 4 | 0 | 4 |
| ACTIVE_REGRESSION | 1 | 1 | 2 |
| BLOCKED_EXTERNAL | 3 | 0 | 3 |
| PRODUCT_DECISION_REQUIRED | 1 | 6 | 7 |
| HUMAN_ACCEPTANCE | 2 | 0 | 2 |
| **Total** | **100** | **100** | **200** |

Não cabe transformar essa tabela em “percentual implementado”: várias etapas acumulam código, decisão de produto, medição, operação, revisão de terceiros e aprovação de release. A classe PARTIAL reconhece entregas posteriores sem certificar as demais cláusulas.

## Diferenças que mudam a próxima ação

### 010 diagnostica o drift; 061 exige eliminá-lo

**Cline 010 está DONE_VERIFIED:** o aceite permite concluir `PARITY`, `EXPECTED_DIFFERENCE` ou `DRIFT_BLOCKING`. A evidência read-only disponível identifica **779 migrations locais e 781 versões no ledger**, com duas fixtures da aba Arquivos somente no remoto, `20261003182707` e `20261003192707`. O resultado é `DRIFT_BLOCKING`; nenhuma migration foi aplicada. **Cline 061 permanece VALIDATED_FAIL**, pois exige convergência, não apenas diagnóstico. Tipos/catálogo/manifesto também têm diferenças no [run DB Live Guard coletado](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37155983222). A evidência detalhada está em `audit/prs/PR_ISSUE_AUDIT_2026-10-03.md`.

Cline 028 está bloqueada pela falha de bootstrap do [DB guard offline coletado](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/37155670839). O socket PostgreSQL ausente impediu os contratos de rodar; isso **não é resultado de teste RLS**. A correção de issues 1265/1266/1267 existe nas PRs 1309/1313/1314 e sobrevive no código, mas não certifica a matriz viva completa nem resolve o drift atual.

### 030/014 acessibilidade e 048/072 cache não podem ser fechadas por infraestrutura

Cline 030 e Paridade 014 permanecem parciais. A instrumentação em [main.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/main.tsx#L60-L75) retorna quando não encontra `main`; ForgotPassword/NotFound não ficam cobertas por essa varredura. A existência de axe ou um E2E verde não demonstra o aceite das quatro telas, teclado, dialogs e live regions.

Cline 048 e Paridade 072 carregam a regressão confirmada de Arquivos: a exclusão invalida a galeria e o total da aba, mas omite `media-gallery-counts`; UPDATE/DELETE Realtime também não corrigem essa chave. `staleTime` não agenda uma atualização e os defaults desligam refetch ao montar/focar. Os detalhes e limites estão em `audit/adversarial/findings.json`, **ADV-FILES-02**, e `audit/modules/other/findings.json`, **OTH-002**. O descompasso de seleção/encaminhamento, **ADV-FILES-01**, é evidência adicional para o aceite integrado da galeria.

### 054 exige avaliação individual das rotas públicas

Cline 054 está VALIDATED_FAIL no código examinado. Em [gmail-webhook:106–145](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/gmail-webhook/index.ts#L106-L145), OIDC é somente observacional, explicitamente sem bloqueio. O handler usa service role e resolve a conta pelo `emailAddress` recebido no corpo. [config.toml:14–15](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/config.toml#L14-L15) mantém `verify_jwt=false`. Nenhuma requisição exploratória foi enviada e a versão publicada não foi atestada novamente.

ElevenLabs verifica assinatura/timestamp, mas não deduplica a entrega nem verifica `{error}` do insert antes de responder sucesso — **IA-WEBHOOK-001**. O alcance é diferente nas outras rotas: [Gmail cron:11–24](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/gmail-cron-sync/index.ts#L11-L24) compara um segredo e bloqueia ausência/divergência; [public-api:3–7](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/public-api/index.ts#L3-L7) retorna 410 sem efeito. Evolution possui gate por token dependente do modo configurado; não se deve impor HMAC incompatível com GO para fechar uma caixa antiga.

### Entregas reais posteriores foram reconhecidas

Os estados “AUSENTE” de agosto/setembro estão desatualizados para Husky, coverage V8, Playwright, CodeQL, ratchets, budgets, envio atômico e feature flags. O [ChatService:78–97](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/services/chat.service.ts#L78-L97) usa o envio seguro, e a edge de entrega possui leases/RPCs. Isso não comprova fila IndexedDB, dedupe do mesmo gesto entre abas, DLQ administrável ou todos os testes de retry especificados.

O [guard de bundle](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/scripts/ci/bundle-budget.mjs#L52-L101) mede gzip inicial/preloads/CSS, maior chunk e assets sem maps. Coverage está instalada, mas [seu denominador atual](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/vitest.config.ts#L13-L35) não inclui todos os hooks/edges. Essas entregas são preservadas sem declarar cumpridos os pacotes mais amplos de cada etapa.

### Observabilidade e PWA mantêm decisões próprias

`errorReporter` é uma implementação real via `audit_logs`, com buildId e dedupe. A tela Sentry, porém, usa `mockErrors` e estado local, e o SDK/túnel não está implementado. O build produz maps `hidden`; isso não comprova que estejam inacessíveis por HTTP. O coletor próprio Web Vitals continua manual, com FID e buffer local. Há também Speed Insights da Vercel em módulo lazy: a instrumentação alternativa de RUM existe, enquanto a comparação com dados de campo e o pipeline específico client-observability/analytics_events permanecem pendentes. Cline 047 e Paridade 033 foram ajustadas para PARTIAL após esta verificação; não há alegação de ausência total de telemetria. Evidências: `source-excerpts.json` e os caminhos respectivos em `source-paths.verified.json`.

[Service Worker e push permanecem false](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/config/service_worker.ts#L1-L8), coerentes com a retirada de VitePWA. Cline 091 e Paridade 093 exigem decisão posterior antes de reativação. Detector de nova versão não prova SW/push funcionando. Da mesma forma, remoção de CSV em um módulo não cancela automaticamente o requisito genérico de auto-export de Paridade 085.

## Limites e próximos aceites

O diário Cline mantém 001–004 como VERIFIED históricos e 008–100 como NOT_STARTED; não é uma descrição da implementação atual. Seu aceite temporário de credencial tinha prazo 06/09, e a decisão Vercel estava pendente. Essa lacuna documental permanece `NEEDS_REVALIDATION`; ela não prova que uma credencial ainda seja válida nem autoriza rotação automática.

Backup/restore, DR, game days, DORA, custos, homologação visual e aprovação de release continuam dependentes de evidências operacionais ou humanas. Os checks atuais e os defeitos confirmados impedem declarar candidato integralmente verde em Cline 096, e não houve canário/promoção de Cline 099. Nenhum desses registros pede repetir trabalho externo durante esta auditoria.

## Arquivos do bloco

- **`tasks.enriched.json`**: entrega principal; 200 requisitos integrais com adjudicação individual.
- `tasks.extracted.json`: extração original preservada; dois conjuntos 001–100.
- `summary.json`: contagens e método.
- `source-paths.verified.json` e `source-excerpts.json`: caminhos, hashes, links imutáveis e trechos relevantes.
- `catalog-surface.snapshot.json`: superfície nominal usada nas verificações delimitadas.
- `context-paths-unresolved.json`: nenhum caminho de contexto pendente após a conferência.
- `build_ledger.py`: receitas manuais e geração reproduzível; não modifica código do produto.

Os dois programas estão reconciliados integralmente como documentação de auditoria. Seus compromissos de implementação, operação e aceite permanecem nos estados individuais do ledger.
