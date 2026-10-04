# Reconciliação das 50 melhorias e das seis fatias de lint

**Baseline:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. **Cobertura:** 56/56 registros, com IDs, linhas, source SHA e requisitos extraídos preservados. Cada item recebeu justificativa individual e cinco dimensões explícitas: **documentação, implementação, testes, runtime e aceite**.

Fontes:

- `docs/audits/PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`: E01–E50, extraídos de `audit/global/tasks.extracted.json`.
- `docs/audits/DIVIDA_LINT_FATIAS_2026-09-29.md`: F1–F6, extraídos de `audit/modules/root/extra-tasks.json`.

A adjudicação usa os inventários, PRs, checks e análises já coletados, complementados por leitura local delimitada. Não houve nova execução do produto, lint completo, suíte, SQL, browser ou chamada externa. **104 caminhos de fonte foram confirmados.** Nenhum registro fica sustentado apenas por fallback de linhagem.

## Estados individuais

| Estado | Quantidade | IDs |
|---|---:|---|
| DONE_VERIFIED | 16 | E01, E02, E06, E09, E10, E19, E22, E31, E33, E34, E39, E40, E42, E43, E47, F6 |
| PARTIAL | 17 | E05, E11, E13, E24, E26, E27, E32, E36, E38, E41, E46, E50, F1, F2, F3, F4, F5 |
| NEEDS_REVALIDATION | 12 | E03, E07, E08, E14, E15, E18, E21, E23, E25, E29, E44, E45 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 5 | E16, E17, E20, E35, E37 |
| VALIDATED_FAIL | 4 | E04, E28, E30, E48 |
| NO_LONGER_APPLICABLE | 1 | E12 |
| SUPERSEDED | 1 | E49 |
| **Total** | **56** | **50 etapas e seis fatias** |

DONE_VERIFIED respeita o objeto de cada requisito. E06 fecha a **decisão escrita** sobre o N8N; a desativação real da E45 continua não comprovada. E19 fecha um **documento de baseline datado**, sem transformar suas métricas em carga atual. E10 fecha a **integração do gate**, enquanto E48 continua reprovada por drift. Esses escopos estão expressos nos registros.

## Lint: 522 registros no baseline atual

O plano de melhorias registra 612; o documento de fatias registra medição de 955 e baseline de 971. O arquivo versionado atual contém **522 issues**. Isso demonstra que a meta da E39, baseline ≤800, já foi cumprida. **Não é uma nova execução de lint cru.** A distribuição completa e os fingerprints constam de `lint-families.snapshot.json`, extraídos de [eslint-baseline.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/scripts/ci/eslint-baseline.json).

| Fatia | Declaração original | Baseline atual das regras nomeadas | Adjudicação |
|---|---|---|---|
| F1 | 5 unused-expressions + 3 use-memo + 2 incompatible-library | **0 + 3 + 2 = 5** | Parcial: permanecem cinco casos. |
| F2 | 98 only-export-components | **96** | Parcial: extração por arquivo e validação de HMR seguem pendentes. |
| F3 | “179 no total”; cinco regras listadas | **91 + 88 + 26 + 8 + 6 = 219** | Parcial; o denominador original estava incorreto. |
| F4 | 335 explicit-any + 13 unsafe-function-type | **66 + 0 = 66** | Parcial; redução importante, ainda sem fechar todos os contratos de domínio. |
| F5 | 133 restricted-imports | **132** | Parcial; preservar a regra e substituir imports pelo caminho permitido. |
| F6 | 28 constant-condition + 58 ban-ts-comment | **0 + 0 = 0** | Concluída no escopo dessas duas regras. |

Na F3, **179 era somente 91 + 88**. Todos os números originalmente listados somam **233**, não 179. No baseline atual, as cinco regras somam 219. Existem ainda outras regras de hooks fora dessa enumeração; elas não foram somadas silenciosamente à fatia.

As PRs [1758](https://github.com/adm01-debug/Zapp_Web_V2/pull/1758), [1760](https://github.com/adm01-debug/Zapp_Web_V2/pull/1760) e [1766](https://github.com/adm01-debug/Zapp_Web_V2/pull/1766) estão merged e sustentam o fechamento da F6. O baseline de typecheck não contém issues e o de implicit-any é zero. Os dois textos `@ts-nocheck` encontrados em `src` são comentários explicativos, não diretivas ativas. Isso não significa ausência de todas as formas de supressão ou de `any` explícito.

## Diferenças relevantes para o próximo trabalho

### Branches e governança

Os dois remotos nomeados em E01 estão ausentes: não devem ser reabertos como trabalho de exclusão. A expressão histórica “zero claude/*” não descreve o presente: o inventário já coletado contém **58 branches, 57 além da main, das quais 37 têm prefixo claude/**. A meta ≤25 de E04 não foi atingida; vários ramos possuem commits exclusivos e exigem sua própria reconciliação. O GET do repositório confirma `delete_branch_on_merge=true`, encerrando E09 sem presumir limpeza retroativa. Fontes: `audit/git/branches.reconciled.json`, `audit/git/metrics.json` e `audit/modules/transversal/repo.raw.json`.

E07/E08 continuam não verificadas por falta de leitura administrativa suficiente: o settings guard reporta 403. Isso não prova que todos os settings estejam incorretos. E13 também está parcial: há **16 workflows** e **15** têm `concurrency` de topo; `talkx-status-regen.yml` é a exceção. O cron CRM está comentado com justificativa, atendendo E02.

### N8N: decisão e operação têm estados distintos

O documento registra a decisão de aposentadoria, mas também registra **HTTP 405** na tentativa e admite “desativado ou marcado para desativação manual”. Assim, E06 está concluída como decisão, enquanto E45 permanece `NEEDS_REVALIDATION`. Não houve nova chamada ao N8N. Fonte: [decisão N8N, linhas 17–49](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/audits/n8n-graph-sync-decision-2026-09-29.md#L17-L49).

### Banco e replay

O último relatório de replay registra **749 sucessos de 768 e 19 falhas**. A etapa E24 ainda menciona 21; o relatório é mais recente e explícito. Nenhuma dessas contagens equivale a replay integral verde. O DB guard offline coletado também falhou, mas por bootstrap PostgreSQL: é um problema distinto, anterior à execução de contratos. Fonte: [relatório de replay, linhas 19–38](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md#L19-L38).

O usage guard reporta **63 trigger functions**, atendendo E22; sua saída tem **uma violação de baseline e zero novas**, não zero violações totais. E26 não deve interpretar esse “novas:0” como contagem de relações projetadas. E27 tem paridade **local** 73 diretórios/73 no manifesto; a listagem live do documento descreve outro snapshot. E48 permanece reprovada: o DB Live Guard coletado encontrou **779 arquivos versus 781 versões no ledger**, além de diferenças derivadas. Fontes: `audit/code/supabase-usage-guard.txt` e `audit/prs/PR_ISSUE_AUDIT_2026-10-03.md`.

### Autenticação e taxa de webhooks

A config atual contém **14** exceções `verify_jwt=false`, não dez. E28 está reprovada porque Gmail continua observando OIDC sem bloquear, antes de resolver a conta com service role a partir do corpo. Isso não deve ser generalizado à API pública desativada com 410 ou aos crons com segredo. Fonte: [gmail-webhook, linhas 106–141](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/supabase/functions/gmail-webhook/index.ts#L106-L141).

E30 está reprovada no contrato de taxa: `csp-report` usa 30/60s, `talkx-link` 60/60s e `evolution-webhook` 200/60s. **ElevenLabs verifica assinatura/timestamp, mas seu handler não chama um rate limiter.** Assinatura e controle de taxa cumprem funções diferentes. O documento E32 também precisa ajustar o limite Evolution de 60 para 200 e manter explícita a diferença entre modos `shadow` e `token`. Nenhum valor de configuração vivo foi consultado.

### Testes, RUM e desempenho

O relatório E41 declarou três helpers sem testes porque procurou em `tests/` e `src/`, omitindo `supabase/functions`. Os três têm testes em `_shared/__tests__`: `cron-secret-authz-l5.test.ts`, `evolution-go-routes.test.ts`, `ai-audio-authz.test.ts` e `ai-audio-authz-runtime.test.ts`, entre outros consumidores. O relatório também diz que CI não publica/exige coverage, contrariando [vitest.config.ts:13–36](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/vitest.config.ts#L13-L36) e o job test. **A próxima ação é corrigir o mapa e avaliar a qualidade/cobertura real dos casos existentes**, sem duplicá-los por falsa ausência.

E36 já tem **Speed Insights em módulo lazy**. Os dados de campo e a comparação com os alvos ainda não foram comprovados. Essa verificação também corrigiu os registros anteriores Cline 047 e Paridade 033 para PARTIAL: o coletor próprio permanece manual/FID, mas não há ausência total de instrumentação RUM. E34 admite justificativa técnica como alternativa a 300 KB; os experimentos e a justificativa foram entregues, portanto a etapa não deve ser reaberta apenas por não atingir aquele número.

## Integridade e limites

O extrator original interrompeu E16 no comentário dentro de um bloco shell. O registro conserva o texto/linhas extraídos e acrescenta `source_read_adjustment`, com o enunciado completo nas linhas 251–256. Nenhum ID foi renumerado.

E49 está `SUPERSEDED` no escopo do link de autoridade: CLAUDE hoje aponta o plano Actions100 de 01/10 como vigente. Isso não prova entrega automática dos temas de banco/performance das 50 melhorias. Os relatos de índices, autovacuum, PITR, rotação de secrets e serviços externos mantêm seus limites de data e observação.

**Entrega principal:** `tasks.enriched.json`. Os arquivos `summary.json`, `integrity.json`, `source-paths.verified.json`, `source-excerpts.json`, `lint-families.snapshot.json`, `quality-markers.snapshot.json` e `dependency-and-pooling-inventory.json` permitem revisar a origem das classificações. `build_ledger.py` preserva as receitas manuais e reproduz os registros, sem alterar o produto.
