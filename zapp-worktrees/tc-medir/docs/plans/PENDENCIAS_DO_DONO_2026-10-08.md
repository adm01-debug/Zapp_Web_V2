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

## Acréscimo do ciclo das 20h
- SL-069 (DROP TABLE department_invites / RPCs), SL-159 (17º workflow), TL-020 (piloto Compras com envios reais), TL-099 (revogar token Talk X: ação manual do dono), SL-022 refazer (componentes de contatos: plano próprio), testes de falha dupla da Edge e prova do effects (aceite inalcançável).
- SL-103 (Initial JS <= 300 KB, hoje ~342 KB) segue bloqueado: precisa decisão de escopo (code-splitting).

## Acréscimo do plano 95% (08/10, 21h40): itens de CI/baseline/config que o portão proíbe ao agente (ficam com o Claude)
- t_dd5ff492 SL-103 Performance: Initial JS <= 300 KB (337,8 KB hoje; margem de 3,2
- t_9195a9dc SL-130 CI/DevOps: --update-baseline em commit próprio (16 entradas fan
- t_898ca06e SL-145 CI/DevOps: Seção Perímetro do GitHub com tabela canônica
- t_565efcbc SL-147 CI/DevOps: Trocar .nvmrc para 20.19.0 e npm ci por bun install 
- t_fdf7a447 SL-161 Configurações/Notificações: Divida ESLint por modulo: settings 
- t_22435b52 SL-179 Design System/UI: Divida ESLint em src/components/ui: 44 achado
- t_7dc0e369 SL-232 Performance: Budget de performance, ratchets de TS/@ts-nocheck 
