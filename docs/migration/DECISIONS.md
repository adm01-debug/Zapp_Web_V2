## Plano de 30 etapas — decisões adicionais (append)

| ID | Decisão | Classificação | Status |
|----|---------|---------------|--------|
| D7 | Publication realtime = expansão funcional; `supabase_realtime` com 11 tabelas é criado no step 38 mas assinantes confirmados apenas após deploy das functions (step 61). Criar sem subscriber não quebra nada. | expansão intencional documentada | ✅ Registrado |
| D8 | Wildcard domain `*.srv1481814.hstgr.cloud` confirmado: `dig zapp.srv1481814.hstgr.cloud` retorna `187.77.151.129`. Subdomínio funciona sem configuração adicional. App pode ser servido em `zapp.srv1481814.hstgr.cloud` via Traefik. | infra confirmada | ✅ Sessão 4 |

