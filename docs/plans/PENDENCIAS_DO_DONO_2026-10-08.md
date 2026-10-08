# Pendências que não são de agente (arquivadas em 08/10/2026)

Cartões arquivados do quadro porque nenhum agente pode fechá-los. Ficam com o Joaquim ou com o Claude.

## GitHub / CI (ação administrativa)
- SL-001 merge do PR #1343 (types-sync) · SL-120 "Edge contracts" como check obrigatório · SL-121 Branch Protection Sentinel / PR Size Gate · SL-124 DB Live Guard obrigatório · SL-129 podar os 9 GitHub Apps · SL-135 remotos ≤ 25 · SL-136 aposentar dispatcher N8N · SL-142 aprovações exigidas = 1 · SL-146 CODEOWNERS · SL-148 merge na main e tag v2.0.0-hostinger · SL-158 tag catalog-v1.0.0.
## Produção / infra / terceiros
- SL-003 monitor de uptime externo · SL-029 teste de restore de backup · SL-036 ativar CRM_SYNC_WORKER_ENABLED após o lote · SL-037 alerta e breadcrumbs no Sentry · SL-006 e2e logado na main (login real) · SL-019 homologação de áudio com agente real · SL-089 contas e dados de homologação.
## Trilha de banco (decisão e migration grande; fazer em onda própria)
- SL-058 perfil somente-leitura (novo papel + RLS) · SL-062 `departments.whatsapp_api_key` para o Vault (DROP COLUMN) · "Retomada gradual (E05)" (3 camadas: coluna, RPC e Edge).
## Obsoletos (já resolvidos ou pré-requisito inexistente)
- Ingest matched/not_matched, drenagem de opt-out (dependem de outbox que não existe na base) · integrador/zapp-db-local (corrigido) · prova do pacote 2A (o pacote está "pronto" na fila) · promover migration 2A · fechar cartão de sessão morta.
## Desbloqueados e reatribuídos (migration/Edge só no repositório)
- SL-009, SL-010, SL-042 (edgar) · SL-044, SL-045 (workersql).
