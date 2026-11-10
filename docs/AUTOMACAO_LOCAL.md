# Automação local — Zapp_Web_V2

O dispatcher `scripts/automation.mjs` liga as suites, o motor de manutenção e o adaptador de grafo. O perfil versionado `scripts/automation.config.json` é a fonte dos aliases e do registro exato de scripts. Apenas ferramentas determinísticas locais: não há chamadas de IA nem cobrança de API de IA. O CI usa minutos do GitHub Actions sujeitos ao plano da conta; execução local usa os recursos da máquina.

## Comandos

| Alias | Comando executado | Efeito |
|---|---|---|
| `automation:doctor` | `node scripts/automation.mjs doctor` | Verifica arquivos, aliases, registros e instalação local de hooks. |
| `automation:test` | `node scripts/automation.mjs test` | Roda exclusivamente as suites registradas abaixo. |
| `automation:check` | `node scripts/automation.mjs check --ref HEAD` | Inspeciona a referência HEAD em worktree isolada. |
| `automation:heal` | `node scripts/automation.mjs heal --ref origin/main` | Propõe e valida correções limitadas a partir de origin/main; não faz push. |
| `automation:nightly` | `node scripts/automation.mjs nightly --ref origin/main` | Atualiza o grafo e tenta manutenção isolada; relata as duas falhas independentemente. |
| `automation:graph` | `node scripts/automation.mjs graph` | Encaminha subcomandos do grafo; acrescente status, query, path ou explain. |
| `automation:status` | `node scripts/automation.mjs graph status` | Mostra a situação local do grafo. |
| `automation:install-hooks` | `node scripts/automation.mjs install-hooks` | Instala pontes locais reversíveis, encadeando hooks originais. |
| `automation:uninstall-hooks` | `node scripts/automation.mjs uninstall-hooks` | Restaura o hooksPath anterior, recusando sobrescrever alteração de terceiros. |

O comando estático para CI é `node scripts/automation.mjs doctor --static`. Ele verifica contratos; não comprova merge, execução remota, timer ou ponte instalada. `doctor` sem `--static` também exige a instalação local. Ausência de dependência é erro explícito; o dispatcher não instala pacotes automaticamente.

## Gatilhos e ativação

| Gatilho | Cadeia real de execução | Ativação |
|---|---|---|
| PR para main / push em main / dispatch | `.github/workflows/automation-local.yml` → `doctor --static` → `test` → suites exatas do perfil | Workflow versionado; atividade remota depende de publicação/merge e run observado. |
| pre-commit com tooling staged | Ponte privada → hook original → `automation.mjs hook pre-commit` → suites registradas | `automation:install-hooks` instala por clone; não é instalado pelo prepare. |
| pre-push | Ponte privada → hook original → doctor local → suites registradas | A mesma instalação local; erro bloqueia a operação. |
| Fontes staged / post-commit / post-merge / post-checkout | Ponte privada → hook original → adaptador de grafo marca estado sujo | Não reconstrói grafo durante commit nem altera staging. |
| Noturno local, previsto 04:30 | Timer do runtime → callback externo `repo-automation-nightly` → `scripts/automation-nightly.sh` → `automation.mjs nightly --ref origin/main` → graph ensure + motor heal | Configuração do timer fica fora do repositório, sob responsabilidade do runtime local. O callback versionado contém o comando real; presença do arquivo não comprova timer ativo. |

A ponte privada fica em `.tools/repo-automation/`; não substitui os arquivos Husky. Preserva erros, argumentos e stdin dos hooks originais, incluindo commit-msg. `prepare`, hooks e guards existentes foram preservados. Para reverter, use `automation:uninstall-hooks`. `nightly.file` aponta para `scripts/automation-nightly.sh`, cuja cadeia é verificada pelo doctor; nenhum arquivo fictício é usado como evidência de agendamento. O runtime deve conferir `systemctl --user status` e a cadeia do callback instalado antes de declarar o timer ativo.

## Suites efetivamente executadas

- `scripts/automation.unit.mjs`
- `scripts/maintenance/maintenance.unit.mjs`
- `scripts/graphify-local.unit.mjs`

O inventário de testes legado reconhece apenas paths literais em run/imports. O CI também executa explicitamente as suites core e graph para satisfazer esse contrato; a manutenção já tem agregador em `scripts/ci/maintenance.unit.mjs`. Essa repetição é limitada a esses dois contratos novos.

As suites usam fixtures descartáveis e não executam os scripts operacionais do inventário. O motor mantém isolamento de rede, validações obrigatórias, escopo e quotas; um gate herdado vermelho bloqueia o patch. Nenhuma referência, tipo gerado, configuração de produção ou regra de negócio é alterada para forçar verde. O grafo usa o perfil específico `graphify.local.json`; seu estado local fica em `.tools/graphify/local-state/`.

## Registro exato dos demais scripts

Os registros `legacy` abaixo preservam ferramentas anteriores e seus chamadores; não são incluídos automaticamente no novo pipeline. Para arquivos TypeScript de apoio sem runner comprovado, o comando listado só valida o inventário; os chamadores originais continuam sendo a referência de execução. Referência literal indica onde o arquivo é citado, sem garantir que esse caminho rode nem autorização para executar operações contra serviços. Sem referência, o arquivo é mantido manual porque função, parâmetros e ambiente precisam de revisão antes de ativar qualquer gatilho. Scripts novos não cobertos por registro fazem `doctor --static` falhar; não existe registro genérico `scripts/**` para ocultá-los.

| Arquivo exato | Invocação manual de inventário | Chamadores literais / justificativa |
|---|---|---|
| `scripts/ai-context/cenarios.mjs` | `node scripts/ai-context/cenarios.mjs` | .github/workflows/contexto.yml |
| `scripts/ai-context/gerar.mjs` | `node scripts/ai-context/gerar.mjs` | package.json:scripts, .github/workflows/contexto.yml |
| `scripts/ai-context/gerar.unit.mjs` | `node --test scripts/ai-context/gerar.unit.mjs` | package.json:scripts, .github/workflows/contexto.yml |
| `scripts/catalog/validate-plan.mjs` | `node scripts/catalog/validate-plan.mjs` | scripts/catalog/validate-plan.test.mjs |
| `scripts/catalog/validate-plan.test.mjs` | `node --test scripts/catalog/validate-plan.test.mjs` | .github/workflows/db-guard.yml |
| `scripts/ci/a11y-button-name-ratchet.mjs` | `node scripts/ci/a11y-button-name-ratchet.mjs` | .github/workflows/ci.yml |
| `scripts/ci/a11y-button-name-ratchet.unit.mjs` | `node --test scripts/ci/a11y-button-name-ratchet.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/actions-kpi.mjs` | `node scripts/ci/actions-kpi.mjs` | .github/workflows/branch-hygiene-audit.yml, .github/workflows/ci.yml |
| `scripts/ci/actions-kpi.unit.mjs` | `node --test scripts/ci/actions-kpi.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ai-context-generator.unit.mjs` | `node --test scripts/ci/ai-context-generator.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/arquitetura-sem-desperdicio.unit.mjs` | `node --test scripts/ci/arquitetura-sem-desperdicio.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/audit-prod.mjs` | `node scripts/ci/audit-prod.mjs` | .github/workflows/ci.yml |
| `scripts/ci/audit-prod.unit.mjs` | `node --test scripts/ci/audit-prod.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/branch-hygiene-runtime.unit.mjs` | `node --test scripts/ci/branch-hygiene-runtime.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/branch-hygiene-workflow.unit.mjs` | `node --test scripts/ci/branch-hygiene-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/branch-podaveis.mjs` | `node scripts/ci/branch-podaveis.mjs` | .github/workflows/branch-hygiene-audit.yml, .github/workflows/ci.yml |
| `scripts/ci/branch-podaveis.unit.mjs` | `node --test scripts/ci/branch-podaveis.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/bump-toolchain.mjs` | `node scripts/ci/bump-toolchain.mjs` | .github/workflows/branch-hygiene-audit.yml, .github/workflows/ci.yml |
| `scripts/ci/bundle-budget.mjs` | `node scripts/ci/bundle-budget.mjs` | .github/workflows/ci.yml |
| `scripts/ci/bundle-budget.unit.mjs` | `node --test scripts/ci/bundle-budget.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/catalog-ct73-docs.unit.mjs` | `node --test scripts/ci/catalog-ct73-docs.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/catalog-perf-meta-docs.unit.mjs` | `node --test scripts/ci/catalog-perf-meta-docs.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-audit-pdf-determinism.mjs` | `node scripts/ci/check-audit-pdf-determinism.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-audit-pdf-determinism.unit.mjs` | `node --test scripts/ci/check-audit-pdf-determinism.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-bundle-secrets.mjs` | `node scripts/ci/check-bundle-secrets.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-bundle-secrets.unit.mjs` | `node --test scripts/ci/check-bundle-secrets.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-claude-md-integrity.mjs` | `node scripts/ci/check-claude-md-integrity.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-disposable-pg-backoff.unit.mjs` | `node --test scripts/ci/check-disposable-pg-backoff.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-e2e-artifact-secrets.mjs` | `node scripts/ci/check-e2e-artifact-secrets.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-e2e-artifact-secrets.unit.mjs` | `node --test scripts/ci/check-e2e-artifact-secrets.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-edge-error-exposure.mjs` | `node scripts/ci/check-edge-error-exposure.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-edge-error-exposure.unit.mjs` | `node --test scripts/ci/check-edge-error-exposure.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-pr-workflow-secrets.mjs` | `node scripts/ci/check-pr-workflow-secrets.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-pr-workflow-secrets.unit.mjs` | `node --test scripts/ci/check-pr-workflow-secrets.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-quarantine.mjs` | `node scripts/ci/check-quarantine.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-quarantine.unit.mjs` | `node --test scripts/ci/check-quarantine.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-remocoes-destrutivas.unit.mjs` | `node --test scripts/ci/check-remocoes-destrutivas.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-supabase-url-import-meta.mjs` | `node scripts/ci/check-supabase-url-import-meta.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-supabase-url-import-meta.unit.mjs` | `node --test scripts/ci/check-supabase-url-import-meta.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-talkx-docs.unit.mjs` | `node --test scripts/ci/check-talkx-docs.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-talkx-pr-body.mjs` | `node scripts/ci/check-talkx-pr-body.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-talkx-pr-body.unit.mjs` | `node --test scripts/ci/check-talkx-pr-body.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-test-inventory.mjs` | `node scripts/ci/check-test-inventory.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-test-inventory.unit.mjs` | `node --test scripts/ci/check-test-inventory.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-workflow-pins-resolvem.mjs` | `node scripts/ci/check-workflow-pins-resolvem.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-workflow-pins-resolvem.unit.mjs` | `node --test scripts/ci/check-workflow-pins-resolvem.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-workflow-pins.mjs` | `node scripts/ci/check-workflow-pins.mjs` | .github/workflows/ci.yml |
| `scripts/ci/check-workflow-pins.unit.mjs` | `node --test scripts/ci/check-workflow-pins.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ci-artifacts.unit.mjs` | `node --test scripts/ci/ci-artifacts.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ci-docs-baseline.unit.mjs` | `node --test scripts/ci/ci-docs-baseline.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ci-e2e-projects.unit.mjs` | `node --test scripts/ci/ci-e2e-projects.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ci-gate.unit.mjs` | `node --test scripts/ci/ci-gate.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/codeql-paths.unit.mjs` | `node --test scripts/ci/codeql-paths.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/command-palette-contacts.unit.mjs` | `node --test scripts/ci/command-palette-contacts.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/commit-msg-lint.mjs` | `node scripts/ci/commit-msg-lint.mjs` | .github/workflows/ci.yml, .husky/commit-msg |
| `scripts/ci/commit-msg-lint.unit.mjs` | `node --test scripts/ci/commit-msg-lint.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/complete-system-features-doc.unit.mjs` | `node --test scripts/ci/complete-system-features-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/confirm-hash.unit.mjs` | `node --test scripts/ci/confirm-hash.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/contexto-indice.unit.mjs` | `node --test scripts/ci/contexto-indice.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/contexto-publicacao.unit.mjs` | `node --test scripts/ci/contexto-publicacao.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/crm-integration-contract.unit.mjs` | `node --test scripts/ci/crm-integration-contract.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/dashboard-readme-drift.unit.mjs` | `node --test scripts/ci/dashboard-readme-drift.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/db-guard-confiabilidade.unit.mjs` | `node --test scripts/ci/db-guard-confiabilidade.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/db-inventory-doc.unit.mjs` | `node --test scripts/ci/db-inventory-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/db-migrate-contratos.unit.mjs` | `node --test scripts/ci/db-migrate-contratos.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/db-migrate-workflow.unit.mjs` | `node --test scripts/ci/db-migrate-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/deno-reproducibility.unit.mjs` | `node --test scripts/ci/deno-reproducibility.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/deploy-functions-workflow.unit.mjs` | `node --test scripts/ci/deploy-functions-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/design-system-status-honesty.unit.mjs` | `node --test scripts/ci/design-system-status-honesty.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/docs-deploy-coerencia.unit.mjs` | `node --test scripts/ci/docs-deploy-coerencia.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/docs-design-drift.unit.mjs` | `node --test scripts/ci/docs-design-drift.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/docs-estado-registry-convention.unit.mjs` | `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/dry-run-plan.unit.mjs` | `node --test scripts/ci/dry-run-plan.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-auth-diagnostics.unit.mjs` | `node --test scripts/ci/e2e-auth-diagnostics.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-auth-isolation.unit.mjs` | `node --test scripts/ci/e2e-auth-isolation.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-auth-setup.unit.mjs` | `node --test scripts/ci/e2e-auth-setup.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-email-axe-ready.unit.mjs` | `node --test scripts/ci/e2e-email-axe-ready.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-email-navigation-diagnostics.unit.mjs` | `node --test scripts/ci/e2e-email-navigation-diagnostics.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-http-regressions.unit.mjs` | `node --test scripts/ci/e2e-http-regressions.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-alert.unit.mjs` | `node --test scripts/ci/e2e-isolated-alert.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-collection.unit.mjs` | `node --test scripts/ci/e2e-isolated-collection.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-email-l08.unit.mjs` | `node --test scripts/ci/e2e-isolated-email-l08.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-fixture-access.unit.mjs` | `node --test scripts/ci/e2e-isolated-fixture-access.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-fixtures.unit.mjs` | `node --test scripts/ci/e2e-isolated-fixtures.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-force-online.unit.mjs` | `node --test scripts/ci/e2e-isolated-force-online.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-gateway.unit.mjs` | `node --test scripts/ci/e2e-isolated-gateway.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-images.unit.mjs` | `node --test scripts/ci/e2e-isolated-images.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-legacy-workflow.unit.mjs` | `node --test scripts/ci/e2e-isolated-legacy-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-loader.unit.mjs` | `node --test scripts/ci/e2e-isolated-loader.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-login-seed.unit.mjs` | `node --test scripts/ci/e2e-isolated-login-seed.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-migrations.unit.mjs` | `node --test scripts/ci/e2e-isolated-migrations.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-network-contexts.unit.mjs` | `node --test scripts/ci/e2e-isolated-network-contexts.unit.mjs` | .github/workflows/ci.yml, .github/workflows/e2e-logado-isolado.yml |
| `scripts/ci/e2e-isolated-network-proof.unit.mjs` | `node --test scripts/ci/e2e-isolated-network-proof.unit.mjs` | .github/workflows/ci.yml, .github/workflows/e2e-logado-isolado.yml |
| `scripts/ci/e2e-isolated-provider-readiness.unit.mjs` | `node --test scripts/ci/e2e-isolated-provider-readiness.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-providers.unit.mjs` | `node --test scripts/ci/e2e-isolated-providers.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-qr.unit.mjs` | `node --test scripts/ci/e2e-isolated-qr.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-results.unit.mjs` | `node --test scripts/ci/e2e-isolated-results.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-routine-ownership.unit.mjs` | `node --test scripts/ci/e2e-isolated-routine-ownership.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-runtime-probe.unit.mjs` | `node --test scripts/ci/e2e-isolated-runtime-probe.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-runtime.unit.mjs` | `node --test scripts/ci/e2e-isolated-runtime.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-seed-diagnostic.unit.mjs` | `node --test scripts/ci/e2e-isolated-seed-diagnostic.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-seed.unit.mjs` | `node --test scripts/ci/e2e-isolated-seed.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-suite.unit.mjs` | `node --test scripts/ci/e2e-isolated-suite.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-tls-preparation.unit.mjs` | `node --test scripts/ci/e2e-isolated-tls-preparation.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-tls.unit.mjs` | `node --test scripts/ci/e2e-isolated-tls.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-tour.unit.mjs` | `node --test scripts/ci/e2e-isolated-tour.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated-workflow.unit.mjs` | `node --test scripts/ci/e2e-isolated-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-isolated.unit.mjs` | `node --test scripts/ci/e2e-isolated.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-media-volume-fixture.unit.mjs` | `node --test scripts/ci/e2e-media-volume-fixture.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-recovery.unit.mjs` | `node --test scripts/ci/e2e-recovery.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-tarefas-project.unit.mjs` | `node --test scripts/ci/e2e-tarefas-project.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-teardown.mjs` | `node scripts/ci/e2e-teardown.mjs` | .github/workflows/ci.yml |
| `scripts/ci/e2e-teardown.unit.mjs` | `node --test scripts/ci/e2e-teardown.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/edge-coverage-authz.unit.mjs` | `node --test scripts/ci/edge-coverage-authz.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/edge-http-harness.unit.mjs` | `node --test scripts/ci/edge-http-harness.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/email-en088-medicao-docs.unit.mjs` | `node --test scripts/ci/email-en088-medicao-docs.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/evolution-api-proxy.unit.mjs` | `node --test scripts/ci/evolution-api-proxy.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/evolution-edge-fixes.unit.mjs` | `node --test scripts/ci/evolution-edge-fixes.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/fila-merge.mjs` | `node scripts/ci/fila-merge.mjs` | .github/workflows/auto-update-pr-branch.yml, .github/workflows/ci.yml |
| `scripts/ci/fila-merge.unit.mjs` | `node --test scripts/ci/fila-merge.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/front-release-targets.unit.mjs` | `node --test scripts/ci/front-release-targets.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/gerar-matriz-edge-tabela.mjs` | `node scripts/ci/gerar-matriz-edge-tabela.mjs` | .github/workflows/ci.yml |
| `scripts/ci/gerar-matriz-edge-tabela.unit.mjs` | `node --test scripts/ci/gerar-matriz-edge-tabela.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/github-settings-guard.mjs` | `node scripts/ci/github-settings-guard.mjs` | .github/workflows/ci.yml, .github/workflows/settings-guard.yml |
| `scripts/ci/github-settings-guard.unit.mjs` | `node --test scripts/ci/github-settings-guard.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/gitleaks-config.unit.mjs` | `node --test scripts/ci/gitleaks-config.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ia-metas-qualidade-docs.unit.mjs` | `node --test scripts/ci/ia-metas-qualidade-docs.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/implicit-any-ratchet.mjs` | `node scripts/ci/implicit-any-ratchet.mjs` | package.json:scripts, .github/workflows/ci.yml |
| `scripts/ci/implicit-any-ratchet.unit.mjs` | `node --test scripts/ci/implicit-any-ratchet.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/install-pgbouncer.sh` | `sh scripts/ci/install-pgbouncer.sh` | .github/workflows/ci.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/ci/install-postgresql-client.sh` | `sh scripts/ci/install-postgresql-client.sh` | .github/workflows/ci.yml, .github/workflows/db-live-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/targeted-ledger-evidence.yml, .github/workflows/types-sync.yml |
| `scripts/ci/install-postgresql-client.unit.mjs` | `node --test scripts/ci/install-postgresql-client.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/inventario-banco.unit.mjs` | `node --test scripts/ci/inventario-banco.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/inventario-mudou.unit.mjs` | `node --test scripts/ci/inventario-mudou.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/inventario-repo.unit.mjs` | `node --test scripts/ci/inventario-repo.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/inventario-rotas.unit.mjs` | `node --test scripts/ci/inventario-rotas.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/issue-rotativa.mjs` | `node scripts/ci/issue-rotativa.mjs` | .github/workflows/ci.yml |
| `scripts/ci/issue-rotativa.unit.mjs` | `node --test scripts/ci/issue-rotativa.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/issue-templates.unit.mjs` | `node --test scripts/ci/issue-templates.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/lamejs-attack-indexing.unit.mjs` | `node --test scripts/ci/lamejs-attack-indexing.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/lint-ratchet.mjs` | `node scripts/ci/lint-ratchet.mjs` | package.json:scripts, .github/workflows/ci.yml, .husky/pre-commit, .husky/pre-push |
| `scripts/ci/lint-ratchet.unit.mjs` | `node --test scripts/ci/lint-ratchet.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/maintenance.unit.mjs` | `node --test scripts/ci/maintenance.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/mapa-bundle-raw-doc.unit.mjs` | `node --test scripts/ci/mapa-bundle-raw-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/marcador-specs.mjs` | `node scripts/ci/marcador-specs.mjs` | .github/workflows/ci.yml, .github/workflows/e2e-logado.yml |
| `scripts/ci/marcador-specs.unit.mjs` | `node --test scripts/ci/marcador-specs.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/matriz-oth013-validar.py` | `python3 scripts/ci/matriz-oth013-validar.py` | .github/workflows/ci.yml |
| `scripts/ci/media-dedupe.unit.mjs` | `node --test scripts/ci/media-dedupe.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/medir-tipografia.unit.mjs` | `node --test scripts/ci/medir-tipografia.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/message-delivery-phase1-rollout.unit.mjs` | `node --test scripts/ci/message-delivery-phase1-rollout.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/multiplix-send-mutation-ci.unit.mjs` | `node --test scripts/ci/multiplix-send-mutation-ci.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/ordenar.unit.mjs` | `node --test scripts/ci/ordenar.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/parity-hardening.unit.mjs` | `node --test scripts/ci/parity-hardening.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/plano-banco-unico-baseline.unit.mjs` | `node --test scripts/ci/plano-banco-unico-baseline.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/planos-dia-11.unit.mjs` | `node --test scripts/ci/planos-dia-11.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/playwright-config-e81.unit.mjs` | `node --test scripts/ci/playwright-config-e81.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/playwright-version-lock.unit.mjs` | `node --test scripts/ci/playwright-version-lock.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/prova-orcamento-argv-secrets.unit.mjs` | `node --test scripts/ci/prova-orcamento-argv-secrets.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/prova-orcamento-rate-limit.unit.mjs` | `node --test scripts/ci/prova-orcamento-rate-limit.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/psql-safe.unit.mjs` | `node --test scripts/ci/psql-safe.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/qa-vercel-auditores.unit.mjs` | `node --test scripts/ci/qa-vercel-auditores.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/reconciliation-probe-provenance.unit.mjs` | `node --test scripts/ci/reconciliation-probe-provenance.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/reconciliation-source-adjudication.unit.mjs` | `node --test scripts/ci/reconciliation-source-adjudication.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/redigir-relatorio.mjs` | `node scripts/ci/redigir-relatorio.mjs` | .github/workflows/ci.yml |
| `scripts/ci/redigir-relatorio.unit.mjs` | `node --test scripts/ci/redigir-relatorio.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/regras-negocio.unit.mjs` | `node --test scripts/ci/regras-negocio.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/render-workflow-docs.mjs` | `node scripts/ci/render-workflow-docs.mjs` | .github/workflows/ci.yml |
| `scripts/ci/replay-migrations-guard.unit.mjs` | `node --test scripts/ci/replay-migrations-guard.unit.mjs` | .github/workflows/ci.yml, .github/workflows/db-guard.yml |
| `scripts/ci/reuso-arvore.mjs` | `node scripts/ci/reuso-arvore.mjs` | .github/workflows/ci.yml |
| `scripts/ci/reuso-arvore.unit.mjs` | `node --test scripts/ci/reuso-arvore.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/revisao-fontes-doc.unit.mjs` | `node --test scripts/ci/revisao-fontes-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/run-mapa-classificacao.unit.mjs` | `node --test scripts/ci/run-mapa-classificacao.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/salesview-before-references.unit.mjs` | `node --test scripts/ci/salesview-before-references.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/salesview-full-state-evidence.unit.mjs` | `node --test scripts/ci/salesview-full-state-evidence.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/salesview-placar-doc.unit.mjs` | `node --test scripts/ci/salesview-placar-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/secrets-environments.unit.mjs` | `node --test scripts/ci/secrets-environments.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/security-workflow.unit.mjs` | `node --test scripts/ci/security-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/seed-contatos-redesign-local.unit.mjs` | `node --test scripts/ci/seed-contatos-redesign-local.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/sla-code-scanning.mjs` | `node scripts/ci/sla-code-scanning.mjs` | .github/workflows/branch-hygiene-audit.yml, .github/workflows/ci.yml |
| `scripts/ci/sla-code-scanning.unit.mjs` | `node --test scripts/ci/sla-code-scanning.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/slo-docs-honesty.unit.mjs` | `node --test scripts/ci/slo-docs-honesty.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/supabase-snapshot.unit.mjs` | `node --test scripts/ci/supabase-snapshot.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` | `node --test scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talk-me-closure-dimensions.unit.mjs` | `node --test scripts/ci/talk-me-closure-dimensions.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talk-me-e2e-traceability.unit.mjs` | `node --test scripts/ci/talk-me-e2e-traceability.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talk-me-refinement-evidence.unit.mjs` | `node --test scripts/ci/talk-me-refinement-evidence.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talkx-alerts-template.unit.mjs` | `node --test scripts/ci/talkx-alerts-template.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talkx-docs-drift.unit.mjs` | `node --test scripts/ci/talkx-docs-drift.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talkx-status-regen-workflow.unit.mjs` | `node --test scripts/ci/talkx-status-regen-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talkx-status-warn.unit.mjs` | `node --test scripts/ci/talkx-status-warn.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/talkx-template-history-caller.unit.mjs` | `node --test scripts/ci/talkx-template-history-caller.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/team-chat-local-gates.sh` | `sh scripts/ci/team-chat-local-gates.sh` | .github/workflows/ci.yml |
| `scripts/ci/team-chat-local-gates.unit.mjs` | `node --test scripts/ci/team-chat-local-gates.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/tipografia-excecoes-doc.unit.mjs` | `node --test scripts/ci/tipografia-excecoes-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/toolchain-schedule.unit.mjs` | `node --test scripts/ci/toolchain-schedule.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/typecheck-ratchet.mjs` | `node scripts/ci/typecheck-ratchet.mjs` | .github/workflows/ci.yml, .github/workflows/types-sync.yml, .husky/pre-push |
| `scripts/ci/typecheck-ratchet.unit.mjs` | `node --test scripts/ci/typecheck-ratchet.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/types-sync-dedupe.unit.mjs` | `node --test scripts/ci/types-sync-dedupe.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/types-sync-jobs-credentials.unit.mjs` | `node --test scripts/ci/types-sync-jobs-credentials.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/types-sync-workflow.unit.mjs` | `node --test scripts/ci/types-sync-workflow.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/vercel-config.unit.mjs` | `node --test scripts/ci/vercel-config.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/vercel-env-baseline.mjs` | `node scripts/ci/vercel-env-baseline.mjs` | .github/workflows/ci.yml |
| `scripts/ci/vercel-env-baseline.unit.mjs` | `node --test scripts/ci/vercel-env-baseline.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/vercel-env-cleanup.mjs` | `node scripts/ci/vercel-env-cleanup.mjs` | .github/workflows/ci.yml, .github/workflows/vercel-env-cleanup.yml |
| `scripts/ci/vercel-env-cleanup.unit.mjs` | `node --test scripts/ci/vercel-env-cleanup.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/verify-crm-integration-doc.unit.mjs` | `node --test scripts/ci/verify-crm-integration-doc.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/verify-ledger-statements.unit.mjs` | `node --test scripts/ci/verify-ledger-statements.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/verify-release-targets-timeout.unit.mjs` | `node --test scripts/ci/verify-release-targets-timeout.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/volume-e2e-evidence-honesty.unit.mjs` | `node --test scripts/ci/volume-e2e-evidence-honesty.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/width-regression.unit.mjs` | `node --test scripts/ci/width-regression.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/workflow-contracts.unit.mjs` | `node --test scripts/ci/workflow-contracts.unit.mjs` | .github/workflows/ci.yml, .github/workflows/types-sync.yml |
| `scripts/ci/workflow-invariants.mjs` | `node scripts/ci/workflow-invariants.mjs` | .github/workflows/ci.yml |
| `scripts/ci/workflow-invariants.unit.mjs` | `node --test scripts/ci/workflow-invariants.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/workflow-shell-strictness.unit.mjs` | `node --test scripts/ci/workflow-shell-strictness.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ci/workflow-test-support.mjs` | `node scripts/ci/workflow-test-support.mjs` | .github/workflows/ci.yml |
| `scripts/db-audit/admin-cron-jobs-rpc.test.sh` | `sh scripts/db-audit/admin-cron-jobs-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ai-block03-vocabulary-contract.test.sh` | `sh scripts/db-audit/ai-block03-vocabulary-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ai-projection-version-guard.test.mjs` | `node --test scripts/db-audit/ai-projection-version-guard.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ai-read-policies-queue-scope.test.sh` | `sh scripts/db-audit/ai-read-policies-queue-scope.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ai-usage-cost-window-open.test.sh` | `sh scripts/db-audit/ai-usage-cost-window-open.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/anon-privileges-contact-messages.test.sh` | `sh scripts/db-audit/anon-privileges-contact-messages.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/assert-deno-junit.py` | `python3 scripts/db-audit/assert-deno-junit.py` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/assume-return-conversation.test.sh` | `sh scripts/db-audit/assume-return-conversation.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/auto-reconnect-logs.test.sh` | `sh scripts/db-audit/auto-reconnect-logs.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/buckets-stickers-team-chat-files.test.sh` | `sh scripts/db-audit/buckets-stickers-team-chat-files.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/calls-telefonia-contract.test.sh` | `sh scripts/db-audit/calls-telefonia-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/catalog-manifest.test.sh` | `sh scripts/db-audit/catalog-manifest.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh` | `sh scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-catalog-fresh.mjs` | `node scripts/db-audit/check-catalog-fresh.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-catalog-fresh.test.mjs` | `node --test scripts/db-audit/check-catalog-fresh.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-grants-fresh.mjs` | `node scripts/db-audit/check-grants-fresh.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-grants-fresh.test.mjs` | `node --test scripts/db-audit/check-grants-fresh.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-live-invariants.test.sh` | `sh scripts/db-audit/check-live-invariants.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-manifest-fresh.mjs` | `node scripts/db-audit/check-manifest-fresh.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-manifest-fresh.test.mjs` | `node --test scripts/db-audit/check-manifest-fresh.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-mcp-exec-acl.test.sh` | `sh scripts/db-audit/check-mcp-exec-acl.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-migration-drift.mjs` | `node scripts/db-audit/check-migration-drift.mjs` | package.json:scripts, .github/workflows/db-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml, .husky/pre-push |
| `scripts/db-audit/check-migration-drift.test.mjs` | `node --test scripts/db-audit/check-migration-drift.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-realtime-subscriptions.mjs` | `node scripts/db-audit/check-realtime-subscriptions.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-realtime-subscriptions.test.mjs` | `node --test scripts/db-audit/check-realtime-subscriptions.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-reconcile-ledger-drift.test.sh` | `sh scripts/db-audit/check-reconcile-ledger-drift.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-remocoes-destrutivas.mjs` | `node scripts/db-audit/check-remocoes-destrutivas.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-runtime-config.mjs` | `node scripts/db-audit/check-runtime-config.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-runtime-config.test.mjs` | `node --test scripts/db-audit/check-runtime-config.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-screen-permission-db-guards.mjs` | `node scripts/db-audit/check-screen-permission-db-guards.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-screen-permission-db-guards.test.mjs` | `node --test scripts/db-audit/check-screen-permission-db-guards.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-secdef-public-execute.test.sh` | `sh scripts/db-audit/check-secdef-public-execute.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-triple-parity.mjs` | `node scripts/db-audit/check-triple-parity.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-triple-parity.test.mjs` | `node --test scripts/db-audit/check-triple-parity.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/check-webhook-failures-acl.test.sh` | `sh scripts/db-audit/check-webhook-failures-acl.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/confirm-hash.mjs` | `node scripts/db-audit/confirm-hash.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/consolidar-veredito.mjs` | `node scripts/db-audit/consolidar-veredito.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/consolidar-veredito.test.mjs` | `node --test scripts/db-audit/consolidar-veredito.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/contact-types-contract.test.mjs` | `node --test scripts/db-audit/contact-types-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/contacts-legacy-visibility.test.sh` | `sh scripts/db-audit/contacts-legacy-visibility.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/contacts-soft-delete-and-status.test.sh` | `sh scripts/db-audit/contacts-soft-delete-and-status.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/contacts-stats-series-rpc.test.sh` | `sh scripts/db-audit/contacts-stats-series-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/conversation-analyses-authorization.test.sh` | `sh scripts/db-audit/conversation-analyses-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/conversation-closures-reopen-same-day.test.sh` | `sh scripts/db-audit/conversation-closures-reopen-same-day.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/conversation-events-insert-autor-visivel.test.sh` | `sh scripts/db-audit/conversation-events-insert-autor-visivel.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/conversation-tasks-completed-indexes.test.sh` | `sh scripts/db-audit/conversation-tasks-completed-indexes.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/conversation-tasks-events-insert-authorization.test.sh` | `sh scripts/db-audit/conversation-tasks-events-insert-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/crisis-room-snapshot.test.sh` | `sh scripts/db-audit/crisis-room-snapshot.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/crm-sync-outbox-behavior.test.sh` | `sh scripts/db-audit/crm-sync-outbox-behavior.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/crm-sync-outbox-contract.test.mjs` | `node --test scripts/db-audit/crm-sync-outbox-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/cron-remocao-vacuum-messages.test.sh` | `sh scripts/db-audit/cron-remocao-vacuum-messages.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/cron-secret-l5-contract.test.sh` | `sh scripts/db-audit/cron-secret-l5-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/dashboard-daily-series.test.sh` | `sh scripts/db-audit/dashboard-daily-series.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/dashboard-rls-authorization.test.sh` | `sh scripts/db-audit/dashboard-rls-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/database-identity.mjs` | `node scripts/db-audit/database-identity.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/targeted-ledger-evidence.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/database-identity.test.mjs` | `node --test scripts/db-audit/database-identity.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh` | `sh scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/department-whatsapp-mode-rpc.test.sh` | `sh scripts/db-audit/department-whatsapp-mode-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/departments-admin-management.test.sh` | `sh scripts/db-audit/departments-admin-management.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/diff.mjs` | `node scripts/db-audit/diff.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/diff.test.mjs` | `node --test scripts/db-audit/diff.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/dispatch-scheduled-messages.test.sh` | `sh scripts/db-audit/dispatch-scheduled-messages.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/docker-shim.test.sh` | `sh scripts/db-audit/docker-shim.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/drop-redundant-messages-external-id-index.test.sh` | `sh scripts/db-audit/drop-redundant-messages-external-id-index.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/dry-run-plan.mjs` | `node scripts/db-audit/dry-run-plan.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/e44-whatsapp-connections-anon-grants.test.sh` | `sh scripts/db-audit/e44-whatsapp-connections-anon-grants.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/edit-message-authorization.test.sh` | `sh scripts/db-audit/edit-message-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/email-rls-sem-ramo-admin.test.sh` | `sh scripts/db-audit/email-rls-sem-ramo-admin.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/email-signatures-rls.test.sh` | `sh scripts/db-audit/email-signatures-rls.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/enqueue-connection-scope.test.sh` | `sh scripts/db-audit/enqueue-connection-scope.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/export-targeted-ledger-evidence.mjs` | `node scripts/db-audit/export-targeted-ledger-evidence.mjs` | .github/workflows/db-guard.yml, .github/workflows/targeted-ledger-evidence.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/export-targeted-ledger-evidence.test.mjs` | `node --test scripts/db-audit/export-targeted-ledger-evidence.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/extrair-consulta-ledger.mjs` | `node scripts/db-audit/extrair-consulta-ledger.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/extrair-contratos-runtime.mjs` | `node scripts/db-audit/extrair-contratos-runtime.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/f64-voz-assets-e-grants.test.sh` | `sh scripts/db-audit/f64-voz-assets-e-grants.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/feature-flags-rollout.test.sh` | `sh scripts/db-audit/feature-flags-rollout.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/gamification-marco-nao-bloqueia-envio.test.sh` | `sh scripts/db-audit/gamification-marco-nao-bloqueia-envio.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/gen-types.sh` | `sh scripts/db-audit/gen-types.sh` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/gen-types.test.sh` | `sh scripts/db-audit/gen-types.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/generic-migration-runtime.test.sh` | `sh scripts/db-audit/generic-migration-runtime.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/global-guards-regression.test.mjs` | `node --test scripts/db-audit/global-guards-regression.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/gmail-accounts-sync-backoff.test.sh` | `sh scripts/db-audit/gmail-accounts-sync-backoff.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/gmail-cas-postgrest.test.sh` | `sh scripts/db-audit/gmail-cas-postgrest.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/gmail-write-blocks-restrictive.test.sh` | `sh scripts/db-audit/gmail-write-blocks-restrictive.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/grants-baseline-module-rpcs.test.mjs` | `node --test scripts/db-audit/grants-baseline-module-rpcs.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/higiene-grants-public-policies.test.sh` | `sh scripts/db-audit/higiene-grants-public-policies.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ia-usage-outbox-duravel.test.sh` | `sh scripts/db-audit/ia-usage-outbox-duravel.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ia131-audio-stt-cadeia.test.sh` | `sh scripts/db-audit/ia131-audio-stt-cadeia.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ia131-audio-stt-openrouter.test.sh` | `sh scripts/db-audit/ia131-audio-stt-openrouter.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/inbox-contact-authorization.test.sh` | `sh scripts/db-audit/inbox-contact-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/interactive-buttons-list-behavior.test.sh` | `sh scripts/db-audit/interactive-buttons-list-behavior.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/l11-departments-acl-escrita.test.sh` | `sh scripts/db-audit/l11-departments-acl-escrita.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ledger-history-limitations.test.mjs` | `node --test scripts/db-audit/ledger-history-limitations.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/ledger-postapply-query.integration.mjs` | `node --test scripts/db-audit/ledger-postapply-query.integration.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/local-pg-proxy.mjs` | `node scripts/db-audit/local-pg-proxy.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/local-pg-proxy.test.mjs` | `node --test scripts/db-audit/local-pg-proxy.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/login_gate_rpc.test.sh` | `sh scripts/db-audit/login_gate_rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/lote-pendente.mjs` | `node scripts/db-audit/lote-pendente.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/lote-pendente.test.mjs` | `node --test scripts/db-audit/lote-pendente.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/manifest-lib.mjs` | `node scripts/db-audit/manifest-lib.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/mapa-f1-address-contract.test.sh` | `sh scripts/db-audit/mapa-f1-address-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/message-attempts-log.test.sh` | `sh scripts/db-audit/message-attempts-log.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/message-delivery-phase1-behavior.test.sh` | `sh scripts/db-audit/message-delivery-phase1-behavior.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/message-reactions-author-model.test.sh` | `sh scripts/db-audit/message-reactions-author-model.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/message-reactions-autoria.test.sh` | `sh scripts/db-audit/message-reactions-autoria.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/message-reactions-visibilidade-fila.test.sh` | `sh scripts/db-audit/message-reactions-visibilidade-fila.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/messages-group-sender.test.sh` | `sh scripts/db-audit/messages-group-sender.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-audience-parity.mjs` | `node scripts/db-audit/multiplix-audience-parity.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-completion-item-queue.test.sh` | `sh scripts/db-audit/multiplix-completion-item-queue.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-delivery-leases.test.sh` | `sh scripts/db-audit/multiplix-delivery-leases.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-drain-enum-cast.test.sh` | `sh scripts/db-audit/multiplix-drain-enum-cast.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-resolve-escopo.test.sh` | `sh scripts/db-audit/multiplix-resolve-escopo.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-revoke-execute-public.test.sh` | `sh scripts/db-audit/multiplix-revoke-execute-public.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-rls.test.sh` | `sh scripts/db-audit/multiplix-rls.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-scope.test.sh` | `sh scripts/db-audit/multiplix-scope.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/multiplix-send-mutation.py` | `python3 scripts/db-audit/multiplix-send-mutation.py` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/n011-storage-avatar-policies-dedup.test.sh` | `sh scripts/db-audit/n011-storage-avatar-policies-dedup.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/n011-storage-policies-dedup.test.mjs` | `node --test scripts/db-audit/n011-storage-policies-dedup.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/n142-message-reactions-select-user-id.test.sh` | `sh scripts/db-audit/n142-message-reactions-select-user-id.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/network-policy-rpc.test.sh` | `sh scripts/db-audit/network-policy-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/notification-delivery-atomicity.test.sh` | `sh scripts/db-audit/notification-delivery-atomicity.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/notify-due-tasks-authorization.test.sh` | `sh scripts/db-audit/notify-due-tasks-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/pg-cron-concorrencia.py` | `python3 scripts/db-audit/pg-cron-concorrencia.py` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/pg-cron-concorrencia.test.mjs` | `node --test scripts/db-audit/pg-cron-concorrencia.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/pg-cron-escalonamento.test.sh` | `sh scripts/db-audit/pg-cron-escalonamento.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/pg-cron-jobs-baseline.js` | `node scripts/db-audit/pg-cron-jobs-baseline.js` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/pg-cron-jobs-baseline.test.mjs` | `node --test scripts/db-audit/pg-cron-jobs-baseline.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/postgrest-internal-url.py` | `python3 scripts/db-audit/postgrest-internal-url.py` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/profiles-can-download-authorization.test.sh` | `sh scripts/db-audit/profiles-can-download-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/profiles-role-escalation-guard.test.sh` | `sh scripts/db-audit/profiles-role-escalation-guard.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/psql-environment.integration.mjs` | `node --test scripts/db-audit/psql-environment.integration.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/psql-environment.mjs` | `node scripts/db-audit/psql-environment.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/psql-environment.test.mjs` | `node --test scripts/db-audit/psql-environment.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/psql-safe.mjs` | `node scripts/db-audit/psql-safe.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-live-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/psql-safe.test.mjs` | `node --test scripts/db-audit/psql-safe.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/public-api-disable.test.sh` | `sh scripts/db-audit/public-api-disable.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/queues-distribution-overflow.test.sh` | `sh scripts/db-audit/queues-distribution-overflow.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/recriar-banco-local.test.sh` | `sh scripts/db-audit/recriar-banco-local.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` | `sh scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/register-migration.mjs` | `node scripts/db-audit/register-migration.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/register-migration.test.mjs` | `node --test scripts/db-audit/register-migration.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/reminders-migracao-identidade.test.sh` | `sh scripts/db-audit/reminders-migracao-identidade.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/replay-classify.py` | `python3 scripts/db-audit/replay-classify.py` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/replay-classify.test.sh` | `sh scripts/db-audit/replay-classify.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/replay-local-harness.test.sh` | `sh scripts/db-audit/replay-local-harness.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/replay-local.sh` | `sh scripts/db-audit/replay-local.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/request-department-access.test.sh` | `sh scripts/db-audit/request-department-access.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/reset-gatilho-coluna-removida.test.sh` | `sh scripts/db-audit/reset-gatilho-coluna-removida.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/retry-disposable-postgres-test.sh` | `sh scripts/db-audit/retry-disposable-postgres-test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/revoke-auth-sessions.test.sh` | `sh scripts/db-audit/revoke-auth-sessions.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/run-runtime-contract.mjs` | `node scripts/db-audit/run-runtime-contract.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/runtime-config.test.sh` | `sh scripts/db-audit/runtime-config.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/scheduled-whisper-visibility-rls.test.sh` | `sh scripts/db-audit/scheduled-whisper-visibility-rls.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/scope-public-policies-authenticated.test.sh` | `sh scripts/db-audit/scope-public-policies-authenticated.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/scope-snoozes-pins-favorites-authenticated.test.sh` | `sh scripts/db-audit/scope-snoozes-pins-favorites-authenticated.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/search-email-threads.test.sh` | `sh scripts/db-audit/search-email-threads.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/search_path_pg_temp_is_admin_get_own_gmail.test.sh` | `sh scripts/db-audit/search_path_pg_temp_is_admin_get_own_gmail.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/searchbox-budget-alert-monthly-idempotency.test.sh` | `sh scripts/db-audit/searchbox-budget-alert-monthly-idempotency.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/sec-y25-01-insert-alvo.test.sh` | `sh scripts/db-audit/sec-y25-01-insert-alvo.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/secd-caller-check.test.sh` | `sh scripts/db-audit/secd-caller-check.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/send-messages-permission-authorization.test.sh` | `sh scripts/db-audit/send-messages-permission-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/sla-first-response-delivery-contract.test.mjs` | `node --test scripts/db-audit/sla-first-response-delivery-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/sla-granular-contract.test.mjs` | `node --test scripts/db-audit/sla-granular-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/sql-lexer.mjs` | `node scripts/db-audit/sql-lexer.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/storage-buckets-baseline.js` | `node scripts/db-audit/storage-buckets-baseline.js` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/storage-buckets-baseline.test.mjs` | `node --test scripts/db-audit/storage-buckets-baseline.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/storage-limits-stickers-audio-memes.test.sh` | `sh scripts/db-audit/storage-limits-stickers-audio-memes.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/storage-limits-whatsapp-audio-multiplix.test.sh` | `sh scripts/db-audit/storage-limits-whatsapp-audio-multiplix.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/supabase-snapshot-stats.test.sh` | `sh scripts/db-audit/supabase-snapshot-stats.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/supabase-usage-guard.mjs` | `node scripts/db-audit/supabase-usage-guard.mjs` | package.json:scripts, .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talk-me-client-privileges.test.sh` | `sh scripts/db-audit/talk-me-client-privileges.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talk-me-queue-contract.test.sh` | `sh scripts/db-audit/talk-me-queue-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-ab-weights.test.sh` | `sh scripts/db-audit/talkx-ab-weights.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-alerts-outcome-unknown-lote.test.sh` | `sh scripts/db-audit/talkx-alerts-outcome-unknown-lote.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-analytics-contract.test.mjs` | `node --test scripts/db-audit/talkx-analytics-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-audience-rpc.test.sh` | `sh scripts/db-audit/talkx-audience-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-audience-snapshot.test.sh` | `sh scripts/db-audit/talkx-audience-snapshot.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-benchmarks-period-names.test.sh` | `sh scripts/db-audit/talkx-benchmarks-period-names.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-blacklist-audit-trigger.test.sh` | `sh scripts/db-audit/talkx-blacklist-audit-trigger.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-blacklist-policy-forward-only.test.sh` | `sh scripts/db-audit/talkx-blacklist-policy-forward-only.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-blacklist-realtime.test.sh` | `sh scripts/db-audit/talkx-blacklist-realtime.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-launch-checks.test.sh` | `sh scripts/db-audit/talkx-campaign-launch-checks.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-logs-cursor.test.sh` | `sh scripts/db-audit/talkx-campaign-logs-cursor.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-recipients-page.test.sh` | `sh scripts/db-audit/talkx-campaign-recipients-page.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-recurrence.test.sh` | `sh scripts/db-audit/talkx-campaign-recurrence.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-segments-rpc.test.sh` | `sh scripts/db-audit/talkx-campaign-segments-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-segments.test.sh` | `sh scripts/db-audit/talkx-campaign-segments.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-state-transitions.test.sh` | `sh scripts/db-audit/talkx-campaign-state-transitions.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-transitions.test.sh` | `sh scripts/db-audit/talkx-campaign-transitions.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-window-open.test.sh` | `sh scripts/db-audit/talkx-campaign-window-open.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-campaign-worker-lease.test.sh` | `sh scripts/db-audit/talkx-campaign-worker-lease.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-contact-attributes.test.sh` | `sh scripts/db-audit/talkx-contact-attributes.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-conversion-defaults.test.sh` | `sh scripts/db-audit/talkx-conversion-defaults.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-counters-integrity.test.sh` | `sh scripts/db-audit/talkx-counters-integrity.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-current-template-version.test.sh` | `sh scripts/db-audit/talkx-current-template-version.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-delivery-leases-contract.test.mjs` | `node --test scripts/db-audit/talkx-delivery-leases-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-delivery-leases.test.sh` | `sh scripts/db-audit/talkx-delivery-leases.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-draft-recipients.test.sh` | `sh scripts/db-audit/talkx-draft-recipients.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-draft-save.test.sh` | `sh scripts/db-audit/talkx-draft-save.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-e27-replay-divergence.test.sh` | `sh scripts/db-audit/talkx-e27-replay-divergence.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-e90-links-contract.test.mjs` | `node --test scripts/db-audit/talkx-e90-links-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-engine-cron-runs-role-gate.test.sh` | `sh scripts/db-audit/talkx-engine-cron-runs-role-gate.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-engine-health.test.sh` | `sh scripts/db-audit/talkx-engine-health.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-engine-provider.test.sh` | `sh scripts/db-audit/talkx-engine-provider.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-engine-tick.test.sh` | `sh scripts/db-audit/talkx-engine-tick.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-engine-window-contract.test.mjs` | `node --test scripts/db-audit/talkx-engine-window-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-escape-hatch-auth.test.sh` | `sh scripts/db-audit/talkx-escape-hatch-auth.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-events-contract.test.sh` | `sh scripts/db-audit/talkx-events-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-expurgo-escopo-ai-jobs.test.sh` | `sh scripts/db-audit/talkx-expurgo-escopo-ai-jobs.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-guards-fail-closed.test.sh` | `sh scripts/db-audit/talkx-guards-fail-closed.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-help-top-topics.test.sh` | `sh scripts/db-audit/talkx-help-top-topics.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-history-saved-by-fk.test.sh` | `sh scripts/db-audit/talkx-history-saved-by-fk.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-insights-rules.test.sh` | `sh scripts/db-audit/talkx-insights-rules.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-lgpd.test.sh` | `sh scripts/db-audit/talkx-lgpd.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-lifecycle-events.test.sh` | `sh scripts/db-audit/talkx-lifecycle-events.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-links-conversions.test.sh` | `sh scripts/db-audit/talkx-links-conversions.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-message-snapshot.test.sh` | `sh scripts/db-audit/talkx-message-snapshot.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-metrics-view-invoker.test.sh` | `sh scripts/db-audit/talkx-metrics-view-invoker.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-monitor-panel.test.sh` | `sh scripts/db-audit/talkx-monitor-panel.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-n102-window-acl.test.sh` | `sh scripts/db-audit/talkx-n102-window-acl.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-n102a-ddl.test.sh` | `sh scripts/db-audit/talkx-n102a-ddl.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-n102b-cast.test.sh` | `sh scripts/db-audit/talkx-n102b-cast.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-n102c-window.test.sh` | `sh scripts/db-audit/talkx-n102c-window.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-navigation-contract.test.mjs` | `node --test scripts/db-audit/talkx-navigation-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-optout.test.sh` | `sh scripts/db-audit/talkx-optout.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-overview-stats.test.sh` | `sh scripts/db-audit/talkx-overview-stats.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-personalize-parity.test.mjs` | `node --test scripts/db-audit/talkx-personalize-parity.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-purge-nao-falsa-falha.test.sh` | `sh scripts/db-audit/talkx-purge-nao-falsa-falha.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-receipts-replies.test.sh` | `sh scripts/db-audit/talkx-receipts-replies.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-regressoes-chain.test.sh` | `sh scripts/db-audit/talkx-regressoes-chain.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-retry-resolve.test.sh` | `sh scripts/db-audit/talkx-retry-resolve.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-role-gates.test.sh` | `sh scripts/db-audit/talkx-role-gates.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-save-template-variants.test.sh` | `sh scripts/db-audit/talkx-save-template-variants.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` | `node --test scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-scheduler-contract.test.mjs` | `node --test scripts/db-audit/talkx-scheduler-contract.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-segment-fields.test.sh` | `sh scripts/db-audit/talkx-segment-fields.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-segment-health.test.sh` | `sh scripts/db-audit/talkx-segment-health.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-segment-library-stats.test.sh` | `sh scripts/db-audit/talkx-segment-library-stats.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-segment-progress.test.sh` | `sh scripts/db-audit/talkx-segment-progress.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-send-budget.test.sh` | `sh scripts/db-audit/talkx-send-budget.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-send-interval-teto-24h.test.sh` | `sh scripts/db-audit/talkx-send-interval-teto-24h.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-settings-replay-idempotent.test.sh` | `sh scripts/db-audit/talkx-settings-replay-idempotent.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-settings-rls.test.sh` | `sh scripts/db-audit/talkx-settings-rls.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-suppress-phone-axis.test.sh` | `sh scripts/db-audit/talkx-suppress-phone-axis.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-suppression-read-rpcs.test.sh` | `sh scripts/db-audit/talkx-suppression-read-rpcs.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-template-columns.test.sh` | `sh scripts/db-audit/talkx-template-columns.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-template-history-behavior.test.sh` | `sh scripts/db-audit/talkx-template-history-behavior.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-template-second-update-snapshot.test.sh` | `sh scripts/db-audit/talkx-template-second-update-snapshot.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-tick-expurgo.test.sh` | `sh scripts/db-audit/talkx-tick-expurgo.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-transition-overload-postgrest.test.sh` | `sh scripts/db-audit/talkx-transition-overload-postgrest.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-transition-postgrest.test.ts` | `node scripts/automation.mjs doctor --static` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-update-limits-22009.test.sh` | `sh scripts/db-audit/talkx-update-limits-22009.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-update-limits-casts.test.sh` | `sh scripts/db-audit/talkx-update-limits-casts.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-update-limits-rpc.test.sh` | `sh scripts/db-audit/talkx-update-limits-rpc.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-update-limits-send-window.test.sh` | `sh scripts/db-audit/talkx-update-limits-send-window.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v12-lifecycle-events.test.sh` | `sh scripts/db-audit/talkx-v12-lifecycle-events.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v15-replied-count-guard.test.sh` | `sh scripts/db-audit/talkx-v15-replied-count-guard.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v16-time-series.test.sh` | `sh scripts/db-audit/talkx-v16-time-series.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v17-read-at.test.sh` | `sh scripts/db-audit/talkx-v17-read-at.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v19-retry-recipient.test.sh` | `sh scripts/db-audit/talkx-v19-retry-recipient.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v21-launch-flags.test.sh` | `sh scripts/db-audit/talkx-v21-launch-flags.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v23-draft-step.test.sh` | `sh scripts/db-audit/talkx-v23-draft-step.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v25-owner.test.sh` | `sh scripts/db-audit/talkx-v25-owner.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/talkx-v26-template-version.test.sh` | `sh scripts/db-audit/talkx-v26-template-version.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/tasks-rearm-on-remind-change.test.sh` | `sh scripts/db-audit/tasks-rearm-on-remind-change.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/tc002-direct-conversation-race.test.sh` | `sh scripts/db-audit/tc002-direct-conversation-race.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-chat-department-transfer-guards.test.sh` | `sh scripts/db-audit/team-chat-department-transfer-guards.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh` | `sh scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-chat-media-acl-r2-db-020.test.sh` | `sh scripts/db-audit/team-chat-media-acl-r2-db-020.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-chat-media-contract.test.sh` | `sh scripts/db-audit/team-chat-media-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-chat-rpc-ambiguity.test.sh` | `sh scripts/db-audit/team-chat-rpc-ambiguity.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-direct-conversation-race.test.sh` | `sh scripts/db-audit/team-direct-conversation-race.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-member-role-rpcs.test.sh` | `sh scripts/db-audit/team-member-role-rpcs.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-membership-bootstrap-owner.test.sh` | `sh scripts/db-audit/team-membership-bootstrap-owner.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-message-read-state.test.sh` | `sh scripts/db-audit/team-message-read-state.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-messages-page-cursor-tiebreak.test.sh` | `sh scripts/db-audit/team-messages-page-cursor-tiebreak.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-reaction-membership.test.sh` | `sh scripts/db-audit/team-reaction-membership.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-receipts-membership.test.sh` | `sh scripts/db-audit/team-receipts-membership.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | `sh scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/telefonia-homologacao-runbook.test.mjs` | `node --test scripts/db-audit/telefonia-homologacao-runbook.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/telefonia-snapshot.mjs` | `node scripts/db-audit/telefonia-snapshot.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/types-sync-psql-buffer.test.mjs` | `node --test scripts/db-audit/types-sync-psql-buffer.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/user-sessions-expire.test.sh` | `sh scripts/db-audit/user-sessions-expire.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/user-settings-sound-integrity-contract.test.sh` | `sh scripts/db-audit/user-settings-sound-integrity-contract.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/validate-destino.test.mjs` | `node --test scripts/db-audit/validate-destino.test.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/validate-runtime-proof.mjs` | `node scripts/db-audit/validate-runtime-proof.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/validate-talkx-runtime.mjs` | `node scripts/db-audit/validate-talkx-runtime.mjs` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/verify-ledger-statements.mjs` | `node scripts/db-audit/verify-ledger-statements.mjs` | .github/workflows/db-guard.yml, .github/workflows/db-migrate.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/wa-label-connection-scope.test.sh` | `sh scripts/db-audit/wa-label-connection-scope.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/wa-tag-and-status-authorization.test.sh` | `sh scripts/db-audit/wa-tag-and-status-authorization.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/wait-postgres-final-start.sh` | `sh scripts/db-audit/wait-postgres-final-start.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/whatsapp-default-connection-atomicity.test.sh` | `sh scripts/db-audit/whatsapp-default-connection-atomicity.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/whatsapp-media-policies-sem-curinga.test.sh` | `sh scripts/db-audit/whatsapp-media-policies-sem-curinga.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-audit/whatsapp-media-select-scope.test.sh` | `sh scripts/db-audit/whatsapp-media-select-scope.test.sh` | .github/workflows/db-guard.yml, .github/workflows/types-sync.yml |
| `scripts/db-tests/rpc-envelope.mjs` | `node scripts/db-tests/rpc-envelope.mjs` | scripts/db-tests/run-all.mjs, scripts/db-tests/run-all.unit.mjs |
| `scripts/db-tests/run-all.mjs` | `node scripts/db-tests/run-all.mjs` | scripts/db-tests/run-all.unit.mjs |
| `scripts/db-tests/run-all.unit.mjs` | `node --test scripts/db-tests/run-all.unit.mjs` | .github/workflows/db-guard.yml |
| `scripts/db/seed-contatos-redesign-local.sh` | `sh scripts/db/seed-contatos-redesign-local.sh` | scripts/ci/seed-contatos-redesign-local.unit.mjs |
| `scripts/docs/verificar-docs-realtime.mjs` | `node scripts/docs/verificar-docs-realtime.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/e2e-isolated/admission.mjs` | `node scripts/e2e-isolated/admission.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/collection.mjs` | `node scripts/e2e-isolated/collection.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/fixture-access.mjs` | `node scripts/e2e-isolated/fixture-access.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/force-online.mjs` | `node scripts/e2e-isolated/force-online.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/gateway.mjs` | `node scripts/e2e-isolated/gateway.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/main/index.ts` | `node scripts/automation.mjs doctor --static` | scripts/e2e-isolated/run.mjs |
| `scripts/e2e-isolated/main/memory-pressure.ts` | `node scripts/automation.mjs doctor --static` | scripts/e2e-isolated/main/index.ts |
| `scripts/e2e-isolated/migrations.mjs` | `node scripts/e2e-isolated/migrations.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/network-contexts-browser.mjs` | `node scripts/e2e-isolated/network-contexts-browser.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/network-contexts-policy.mjs` | `node scripts/e2e-isolated/network-contexts-policy.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/network-contexts.mjs` | `node scripts/e2e-isolated/network-contexts.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/network-proof-browser.mjs` | `node scripts/e2e-isolated/network-proof-browser.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/network-proof-policy.mjs` | `node scripts/e2e-isolated/network-proof-policy.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/network-proof.mjs` | `node scripts/e2e-isolated/network-proof.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/playwright.config.ts` | `node scripts/automation.mjs doctor --static` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/provider-diagnostics.mjs` | `node scripts/e2e-isolated/provider-diagnostics.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/providers.mjs` | `node scripts/e2e-isolated/providers.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/qr-contract.mjs` | `node scripts/e2e-isolated/qr-contract.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/qr-fixture-access.mjs` | `node scripts/e2e-isolated/qr-fixture-access.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/resolve-images.mjs` | `node scripts/e2e-isolated/resolve-images.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/results.mjs` | `node scripts/e2e-isolated/results.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/routine-ownership.mjs` | `node scripts/e2e-isolated/routine-ownership.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/run.mjs` | `node scripts/e2e-isolated/run.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/run.sh` | `sh scripts/e2e-isolated/run.sh` | .github/workflows/e2e-logado-isolado.yml, .github/workflows/e2e-logado.yml |
| `scripts/e2e-isolated/runtime-contract.mjs` | `node scripts/e2e-isolated/runtime-contract.mjs` | .github/workflows/e2e-logado-isolado.yml, .github/workflows/e2e-logado.yml |
| `scripts/e2e-isolated/runtime-probe.mjs` | `node scripts/e2e-isolated/runtime-probe.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/seed-login.mjs` | `node scripts/e2e-isolated/seed-login.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/seed-qr.mjs` | `node scripts/e2e-isolated/seed-qr.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/seed-suite.mjs` | `node scripts/e2e-isolated/seed-suite.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/stack.mjs` | `node scripts/e2e-isolated/stack.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/tls-edge-probe.ts` | `node scripts/automation.mjs doctor --static` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/tls-probe.mjs` | `node scripts/e2e-isolated/tls-probe.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/tls.mjs` | `node scripts/e2e-isolated/tls.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/verify-providers.mjs` | `node scripts/e2e-isolated/verify-providers.mjs` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/e2e-isolated/vite.config.ts` | `node scripts/automation.mjs doctor --static` | .github/workflows/e2e-logado-isolado.yml |
| `scripts/edge-deploy/api-traversal.unit.mjs` | `node --test scripts/edge-deploy/api-traversal.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/collect-remote.mjs` | `node scripts/edge-deploy/collect-remote.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/deploy-plan.mjs` | `node scripts/edge-deploy/deploy-plan.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/deploy-plan.unit.mjs` | `node --test scripts/edge-deploy/deploy-plan.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/deployment-record.mjs` | `node scripts/edge-deploy/deployment-record.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/deployment-record.unit.mjs` | `node --test scripts/edge-deploy/deployment-record.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/generate-manifest.mjs` | `node scripts/edge-deploy/generate-manifest.mjs` | .github/workflows/ci.yml, .github/workflows/deploy-functions.yml, .husky/pre-commit |
| `scripts/edge-deploy/health-check.mjs` | `node scripts/edge-deploy/health-check.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/health-check.unit.mjs` | `node --test scripts/edge-deploy/health-check.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/log-injection.unit.mjs` | `node --test scripts/edge-deploy/log-injection.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/manifest-lib.mjs` | `node scripts/edge-deploy/manifest-lib.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/manifest.unit.mjs` | `node --test scripts/edge-deploy/manifest.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/path-traversal.unit.mjs` | `node --test scripts/edge-deploy/path-traversal.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/preparar-artifact-deploy.sh` | `sh scripts/edge-deploy/preparar-artifact-deploy.sh` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/preparar-artifact-deploy.unit.mjs` | `node --test scripts/edge-deploy/preparar-artifact-deploy.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/redigir-log.mjs` | `node scripts/edge-deploy/redigir-log.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/redigir-log.unit.mjs` | `node --test scripts/edge-deploy/redigir-log.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/register-deployment.mjs` | `node scripts/edge-deploy/register-deployment.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/secrets-scope.mjs` | `node scripts/edge-deploy/secrets-scope.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/secrets-scope.unit.mjs` | `node --test scripts/edge-deploy/secrets-scope.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/serialize-scope.mjs` | `node scripts/edge-deploy/serialize-scope.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/serialize-scope.unit.mjs` | `node --test scripts/edge-deploy/serialize-scope.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/smoke-functions.mjs` | `node scripts/edge-deploy/smoke-functions.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/smoke-functions.unit.mjs` | `node --test scripts/edge-deploy/smoke-functions.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/stable-inventory.mjs` | `node scripts/edge-deploy/stable-inventory.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/stable-inventory.unit.mjs` | `node --test scripts/edge-deploy/stable-inventory.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/talkx-preflight.mjs` | `node scripts/edge-deploy/talkx-preflight.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/talkx-preflight.unit.mjs` | `node --test scripts/edge-deploy/talkx-preflight.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/unchanged-from-log.mjs` | `node scripts/edge-deploy/unchanged-from-log.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/unchanged-from-log.unit.mjs` | `node --test scripts/edge-deploy/unchanged-from-log.unit.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/edge-deploy/verify-remote.mjs` | `node scripts/edge-deploy/verify-remote.mjs` | .github/workflows/deploy-functions.yml |
| `scripts/eslint/no-secret-compare.js` | `node scripts/eslint/no-secret-compare.js` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/graphify/setup.sh` | `sh scripts/graphify/setup.sh` | package.json:scripts |
| `scripts/ia/ensaio-provisionamento.mjs` | `node scripts/ia/ensaio-provisionamento.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/inventario/gerar-banco.mjs` | `node scripts/inventario/gerar-banco.mjs` | .github/workflows/inventario-estado-semanal.yml |
| `scripts/inventario/gerar-repo.mjs` | `node scripts/inventario/gerar-repo.mjs` | .github/workflows/inventario-estado-semanal.yml |
| `scripts/inventario/gerar-rotas.mjs` | `node scripts/inventario/gerar-rotas.mjs` | .github/workflows/inventario-estado-semanal.yml |
| `scripts/inventario/mudou-conteudo.mjs` | `node scripts/inventario/mudou-conteudo.mjs` | .github/workflows/inventario-estado-semanal.yml |
| `scripts/lib/seguranca-processo.mjs` | `node scripts/lib/seguranca-processo.mjs` | scripts/catalog/validate-plan.mjs, scripts/ci/audit-prod.mjs, scripts/db-audit/check-catalog-fresh.mjs, scripts/db-audit/check-grants-fresh.mjs |
| `scripts/lib/seguranca-processo.test.mjs` | `node --test scripts/lib/seguranca-processo.test.mjs` | .github/workflows/ci.yml |
| `scripts/mutation/run-mapa.mjs` | `node scripts/mutation/run-mapa.mjs` | package.json:scripts, .github/workflows/ci.yml |
| `scripts/qa/contatos-redesign-baseline.cjs` | `node scripts/qa/contatos-redesign-baseline.cjs` | scripts/qa/contatos-redesign-baseline.unit.mjs |
| `scripts/qa/contatos-redesign-baseline.unit.mjs` | `node --test scripts/qa/contatos-redesign-baseline.unit.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/qa/contraste-auditores.unit.mjs` | `node --test scripts/qa/contraste-auditores.unit.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/qa/contraste-combobox.mjs` | `node scripts/qa/contraste-combobox.mjs` | scripts/qa/contraste-auditores.unit.mjs |
| `scripts/qa/contraste-contatos.mjs` | `node scripts/qa/contraste-contatos.mjs` | scripts/qa/contraste-auditores.unit.mjs, scripts/qa/contraste-combobox.mjs |
| `scripts/qa/medir-tipografia.cjs` | `node scripts/qa/medir-tipografia.cjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/qa/prova-orcamento-rate-limit.sh` | `sh scripts/qa/prova-orcamento-rate-limit.sh` | scripts/ci/prova-orcamento-argv-secrets.unit.mjs |
| `scripts/qa/prova-visao-classificadores.mjs` | `node scripts/qa/prova-visao-classificadores.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/qa/prova-visao-classificadores.unit.mjs` | `node --test scripts/qa/prova-visao-classificadores.unit.mjs` | .github/workflows/ci.yml |
| `scripts/regras_negocio/generate.py` | `python3 scripts/regras_negocio/generate.py` | .github/workflows/contexto.yml |
| `scripts/regras_negocio/indice.py` | `python3 scripts/regras_negocio/indice.py` | .github/workflows/contexto.yml |
| `scripts/regras_negocio/publish.sh` | `sh scripts/regras_negocio/publish.sh` | .github/workflows/contexto.yml |
| `scripts/regras_negocio/test_generate.py` | `python3 scripts/regras_negocio/test_generate.py` | .github/workflows/contexto.yml |
| `scripts/supabase_snapshot/snapshot.py` | `python3 scripts/supabase_snapshot/snapshot.py` | .github/workflows/contexto.yml |
| `scripts/supabase_snapshot/test_snapshot.py` | `python3 scripts/supabase_snapshot/test_snapshot.py` | .github/workflows/contexto.yml |
| `scripts/talkx/gen-estados.mjs` | `node scripts/talkx/gen-estados.mjs` | scripts/talkx/gen-estados.unit.mjs |
| `scripts/talkx/gen-estados.unit.mjs` | `node --test scripts/talkx/gen-estados.unit.mjs` | .github/workflows/db-guard.yml |
| `scripts/talkx/lado-a-lado.mjs` | `node scripts/talkx/lado-a-lado.mjs` | .github/workflows/e2e-talkx.yml |
| `scripts/talkx/lado-a-lado.unit.mjs` | `node --test scripts/talkx/lado-a-lado.unit.mjs` | .github/workflows/ci.yml |
| `scripts/talkx/v4-status.mjs` | `node scripts/talkx/v4-status.mjs` | .github/workflows/ci.yml, .github/workflows/talkx-status-regen.yml |
| `scripts/talkx/v4-status.unit.mjs` | `node --test scripts/talkx/v4-status.unit.mjs` | .github/workflows/ci.yml |
| `scripts/tarefas/seed-local-imagens.ts` | `node scripts/automation.mjs doctor --static` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/team-chat-db-validate.mjs` | `node scripts/team-chat-db-validate.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/team-chat-db-validate.unit.mjs` | `node --test scripts/team-chat-db-validate.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ui-audit/contacts-navy-header.unit.mjs` | `node --test scripts/ui-audit/contacts-navy-header.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ui-audit/layout-guard.mjs` | `node scripts/ui-audit/layout-guard.mjs` | scripts/ui-audit/layout-guard.unit.mjs |
| `scripts/ui-audit/layout-guard.unit.mjs` | `node --test scripts/ui-audit/layout-guard.unit.mjs` | .github/workflows/ci.yml |
| `scripts/ui-audit/root-className.mjs` | `node scripts/ui-audit/root-className.mjs` | scripts/ui-audit/layout-guard.mjs |
| `scripts/ui-audit/view-container-padding.unit.mjs` | `node --test scripts/ui-audit/view-container-padding.unit.mjs` | .github/workflows/db-guard.yml |
| `scripts/ui-audit/width-check.mjs` | `node scripts/ui-audit/width-check.mjs` | scripts/ui-audit/width-regression.mjs |
| `scripts/ui-audit/width-regression.mjs` | `node scripts/ui-audit/width-regression.mjs` | scripts/ci/width-regression.unit.mjs |
| `scripts/vercel/ignore-build.sh` | `sh scripts/vercel/ignore-build.sh` | scripts/ci/vercel-config.unit.mjs, scripts/vercel/ignore-build.unit.mjs |
| `scripts/vercel/ignore-build.unit.mjs` | `node --test scripts/vercel/ignore-build.unit.mjs` | .github/workflows/ci.yml |
| `scripts/vercel/verify-production.mjs` | `node scripts/vercel/verify-production.mjs` | scripts/vercel/verify-production.unit.mjs |
| `scripts/vercel/verify-production.unit.mjs` | `node --test scripts/vercel/verify-production.unit.mjs` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |
| `scripts/vercel/verify-release-targets.mjs` | `node scripts/vercel/verify-release-targets.mjs` | .github/workflows/front-release-targets.yml |

## Hooks e workflows anteriores

Hooks inventariados: `.husky/_` era o hooksPath observado. A tabela registra os arquivos, sem afirmar bootstrap instalado ou execução efetiva em outro clone. O registro legacy desses hooks limita apenas execução arbitrária pelo dispatcher; o Git e a ponte preservam os gatilhos originais.

| Hook exato | Gatilho Git original | Referência de inventário |
|---|---|---|
| `.husky/commit-msg` | `commit-msg` | Hook preservado e encadeado antes do novo dispatcher. |
| `.husky/pre-commit` | `pre-commit` | Hook preservado e encadeado antes do novo dispatcher. |
| `.husky/pre-push` | `pre-push` | Hook preservado e encadeado antes do novo dispatcher. |

Workflows anteriores preservados: 21. Os gatilhos e condições de cada arquivo continuam definidos no YAML original; esta listagem não os promove ao novo pipeline e não executa suas operações.

- `.github/workflows/auto-update-pr-branch.yml`
- `.github/workflows/branch-hygiene-audit.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/contexto.yml`
- `.github/workflows/crm-sync-worker.yml`
- `.github/workflows/db-guard.yml`
- `.github/workflows/db-live-guard.yml`
- `.github/workflows/db-migrate.yml`
- `.github/workflows/deploy-functions.yml`
- `.github/workflows/e2e-logado-isolado.yml`
- `.github/workflows/e2e-logado.yml`
- `.github/workflows/e2e-talkx.yml`
- `.github/workflows/front-release-targets.yml`
- `.github/workflows/inventario-estado-semanal.yml`
- `.github/workflows/notifica-falha-main.yml`
- `.github/workflows/settings-guard.yml`
- `.github/workflows/talkx-status-regen.yml`
- `.github/workflows/targeted-ledger-evidence.yml`
- `.github/workflows/types-sync.yml`
- `.github/workflows/vercel-env-cleanup.yml`

Os helpers dos corretores anteriores são cobertos por suites de regressão em fixtures; a chamada operacional original continua no respectivo hook/workflow. Os quatro registros principais e helpers ficam explícitos no JSON, sem globs para novos arquivos.
