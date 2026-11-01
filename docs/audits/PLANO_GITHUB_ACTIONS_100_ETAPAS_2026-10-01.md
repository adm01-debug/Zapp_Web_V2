# Auditoria exaustiva do GitHub Actions — plano de correção e melhorias em 100 etapas (v3)

**Data:** 2026-10-01 (13:10 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD da `main` auditado:** `7d3117c`
**Escopo:** os 14 arquivos que existiam em `.github/workflows/` no baseline (a reconciliação TRA-009 registrou **16** naquele retrato), os 3 workflows dinâmicos (Dependabot Updates, Dependency Graph,
Copilot reviewer), os GitHub Apps que publicam checks no repo, branch protection, environments, secrets, variáveis,
cache, artifacts, Dependabot, Code Scanning, scripts que os workflows chamam (`scripts/ci/`, `scripts/db-audit/`,
`scripts/edge-deploy/`) e as duas auditorias anteriores (26/09 e 27/09).
**Método:** leitura integral dos 14 YAML (4.648 linhas), dos scripts auxiliares que eles invocam, e estado **ao vivo**
via API do GitHub (runs das últimas 37 h, falhas por workflow, branch protection, environments, secrets, cache,
artifacts, PRs abertas, issues de alerta, check-runs do HEAD). Toda afirmação abaixo tem a evidência ao lado.
**Status:** PLANO. Nada foi executado nesta sessão. Nenhum arquivo além deste foi alterado.

---

## Atualização de 2026-10-02 — decisões e etapas superadas

Registrado pelo chat `hermes/settings-guard-e14-e13-e16` a partir de medição ao vivo em 02/10.
**A política vigente da casa prevalece sobre este plano.** A política de 01/10 (`strict=true` permanente,
mantida por `settings-guard` + `auto-update-pr-branch` + `CLAUDE.md