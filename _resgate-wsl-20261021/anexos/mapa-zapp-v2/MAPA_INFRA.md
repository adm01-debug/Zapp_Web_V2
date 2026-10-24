# Mapa de infraestrutura — Zapp Web V2

Lido em 04/10/2026 ~12:40 UTC, só leitura (Vercel, Portainer, n8n, GitHub Actions). Escopo: só o que serve ou alimenta o Zapp Web V2.

## 1. Front-end do V2: só Vercel
| Projeto Vercel | Domínio | Publica | Última produção |
|---|---|---|---|
| `zapp_web_v2` (criado 08/2026) | zapp-web-v2.vercel.app | todo commit da `main` em produção | `2b4dac2d` (#1869), READY |
| `zapp-web-v2-main` (criado 03/10/2026) | zapp-web-v2-main.vercel.app | **o mesmo** commit da `main` em produção | `2b4dac2d`, READY |
- **M-INF-02:** dois projetos de produção para o mesmo repositório e branch: build duplicado a cada merge, duas URLs "de produção". Nenhum domínio próprio aponta para eles.

## 2. Domínios de produção na VPS NÃO são o V2
Stack Portainer `zapp-web-prod` (id 157, atualizado 02/10) atende **zapp.atomicabr.com.br**, **zappweb.app.br** e **www.zappweb.app.br**, mas a imagem é `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-3af583f0…` — **repositório Zapp Web V3**.
- **M-INF-03:** os domínios oficiais servem o V3. O V2 só existe em `*.vercel.app`. Qual banco o V3 usa e se compartilha `tnnnlkbymytvtqngbbqh` está fora do escopo (ordem: só V2) — **Decisão do Joaquim (04/10): V3 abandonado; V2 é a versão oficial.** Consequência: os domínios oficiais hoje servem um produto abandonado; apontá-los para o V2 (e escolher UM projeto Vercel ou a VPS como hospedagem) entra na lista de correções pós-mapa como prioridade alta.

## 3. Backend do V2
- Supabase `tnnnlkbymytvtqngbbqh` (ver MAPA_BANCO.md e MAPA_EDGE_FUNCTIONS.md).
- CI/CD GitHub Actions: Deploy Edge Functions (workflow_dispatch), CI/CD Pipeline, DB Guard (offline), DB Live Guard (schedule), E2E logado, Settings Guard (schedule, **falhando**: 403/null já conhecido, falta PAT administration:read), Talk X V4 placar regen, Auto Update PR Branches, types-sync.
- Runners self-hosted na VPS: stacks `github-runner` e `github-actions-runner` (+ `runner-janitor`).

## 4. Serviços na VPS ligados ao Zapp (Portainer)
| Stack | Papel provável |
|---|---|
| `evolution` (+ `evolution-rabbit-consumer`, `evolution-watchdogs`, `evolution-db-purge`, `evolution-security-guardian`, `evolution-pgbackrest-backup`) | API do WhatsApp usada pelo V2 (`evolution-api`, `evolution-webhook`, `evolution-sync`) |
| `zapp-ops`, `zapp-functions-health` | operação/saúde do Zapp |
| `whatsapp-observer`, `whatsapp-watchdog` | vigilância das instâncias WhatsApp |
| `n8n` | automações (ver §5) |
| `rabbitmq`, `redis`, `minio`, `traefik`, `crowdsec` | infraestrutura compartilhada |
Total no Portainer: 95 stacks (3 inativos); os demais são de outros sistemas.

## 5. n8n (100 workflows, 56 ativos) — os que citam o Zapp
| Estado | Workflow | Atualizado |
|---|---|---|
| ativo | ZAPP Media Downloader (10 nós) | 10/08 |
| ativo | zapp-health-guard → WhatsApp Alert (6 nós) | 09/08 |
| ativo | Warroom Alert Receiver - Evolution DB (6 nós) | 14/08 |
| inativo | Health Guard → WhatsApp Alert | 05/07 |
O template `docs/talkx/n8n/talkx-alerts.json` (R3-DELTA-013/014) **não está importado** no n8n.

## 6. Lacunas desta camada
- **Evolution API:** conector MCP devolve 401 (chave do conector desatualizada). Instâncias, status de conexão e webhooks não mapeados.
- **Cloudflare:** conector desconectado. Workers `*.adm01.workers.dev` (MCPs de banco usados pelos agentes, ex. `supabase-zapp-web-v2-mcp-ro`) não inventariados.
- Variáveis de ambiente da Vercel (para qual Supabase o front aponta): não lidas (contêm segredos).
