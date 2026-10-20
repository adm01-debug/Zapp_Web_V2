# Riscos abertos

- **Concorrência:** novos PRs surgem durante a auditoria; toda conclusão deve registrar SHA/data e ser revalidada antes da execução.
- **Migrations:** CLAUDE.md registra incidentes reais de drift por DDL fora da ordem merge/deploy. Não tratar migration como patch comum.
- **Banco:** confirmar projeto oficial; bancos externos são read-only; migrations aplicadas não são reescritas; evidência/ledger não pode ser fabricada.
- **PRs/issues ativos:** havia trabalho aberto de Talk X, sync DB, sidebar, CI/types-sync, E2E e issues de db-live-guard/settings-guard/branch hygiene/segurança. Reconsultar antes de delegar.
- **Document drift:** checkbox não é fonte de verdade.
- **Skills/instruções:** reconciliar CLAUDE.md, AGENTS.md, .claude, .codex e .agents.
- **Limpeza:** dynamic imports, registries, eventos, Edge Functions, SQL/RPC e configuração podem gerar falso "sem consumidor".
