# 🚨 ZAPP-WEB — Runbook de Incidentes

**Versão:** 1.0  
**Data:** 2026-04-11  
**Autor:** Claude AI — SRE Agent  
**Status:** Aprovado

---

## 🎯 Objetivo

Este runbook define procedimentos padronizados para resposta a incidentes no sistema ZAPP-WEB, garantindo:
- Resposta rápida e consistente
- Minimização de impacto ao cliente
- Documentação e aprendizado contínuo

---

## 📞 Contatos de Emergência

| Papel | Nome | Contato | Horário |
|-------|------|---------|----------|
| **On-Call Principal** | Joaquim | WhatsApp / Slack | 24/7 |
| **Supabase Support** | — | support@supabase.io | 24/7 |
| **Vercel Support** | — | support@vercel.com | Business hours |
| **Evolution API** | — | GitHub Issues | Business hours |

---

## 🌡️ Níveis de Severidade

| Nível | Descrição | RTO | Exemplos |
|-------|-----------|-----|----------|
| **SEV-1** | Sistema completamente fora | 15 min | DB down, API 100% erro |
| **SEV-2** | Funcionalidade crítica degradada | 1 hora | Chat lento, mensagens não enviando |
| **SEV-3** | Funcionalidade secundária afetada | 4 horas | Dashboard lento, relatórios com erro |
| **SEV-4** | Bug cosmmético ou menor | 24 horas | UI desalinhada, texto errado |

---

## 🔥 INCIDENTE: Sistema Fora do Ar (SEV-1)

### Sintomas
- Página não carrega
- Erro 500/502/503
- Mensagens "Connection refused"

### Diagnóstico (5 min)

```bash
# 1. Verificar Supabase Dashboard
https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh

# 2. Verificar status público
https://status.supabase.com/
https://www.vercel-status.com/

# 3. Testar conectividade DB
curl -X POST "https://tnnnlkbymytvtqngbbqh.supabase.co/rest/v1/" \
  -H "apikey: <anon_key>" \
  -H "Content-Type: application/json"
```

### Ações de Recuperação

| # | Ação | Responsável | Tempo |
|---|------|-------------|-------|
| 1 | Verificar status Supabase | On-Call | 2 min |
| 2 | Verificar logs Edge Functions | On-Call | 5 min |
| 3 | Reiniciar Edge Functions | On-Call | 2 min |
| 4 | Se persist, abrir ticket Supabase | On-Call | 5 min |
| 5 | Comunicar stakeholders | On-Call | 2 min |

### Escalação
- **15 min sem resolução:** Escalar para Supabase Support
- **30 min sem resolução:** Escalar para Vercel Support

---

## 💬 INCIDENTE: WhatsApp Não Conecta (SEV-2)

### Sintomas
- Status "Disconnected" no painel
- QR Code não aparece
- Mensagens não enviando/recebendo

### Diagnóstico

```bash
# 1. Verificar conexões WhatsApp
SELECT id, instance_name, status, last_seen_at 
FROM whatsapp_connections 
ORDER BY updated_at DESC LIMIT 10;

# 2. Verificar Evolution API
curl -X GET "https://<evolution-api-url>/instance/fetchInstances" \
  -H "apikey: <evolution_key>"

# 3. Verificar logs da Edge Function
# Dashboard > Logs > evolution-api
```

### Ações de Recuperação

| # | Ação | Comando |
|---|------|---------|
| 1 | Verificar status da instância | `GET /instance/connectionState/{instance}` |
| 2 | Tentar reconectar | `POST /instance/connect/{instance}` |
| 3 | Se falhar, logout e reconectar | `DELETE /instance/logout/{instance}` |
| 4 | Último recurso: recriar instância | `DELETE /instance/delete/{instance}` + `POST /instance/create` |

---

## 📩 INCIDENTE: Mensagens Não Estão Chegando (SEV-2)

### Sintomas
- Cliente enviou mensagem mas não aparece no ZAPP
- Mensagens atrasadas >30 segundos

### Diagnóstico

```sql
-- 1. Verificar últimas mensagens recebidas
SELECT id, content, direction, created_at 
FROM messages 
WHERE direction = 'incoming' 
ORDER BY created_at DESC LIMIT 20;

-- 2. Verificar webhooks recebidos
SELECT * FROM audit_logs 
WHERE action LIKE '%webhook%' 
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 3. Verificar subscriptions Realtime
-- Dashboard > Realtime > Subscriptions
```

### Ações de Recuperação

| # | Causa Provável | Ação |
|---|----------------|------|
| 1 | Webhook não configurado | Verificar URL do webhook na Evolution |
| 2 | Edge Function com erro | Verificar logs e redeployer se necessário |
| 3 | Realtime desconectado | Refresh da página / verificar RLS |
| 4 | Rate limit atingido | Verificar rate_limit_logs |

---

## 🔒 INCIDENTE: Acesso Não Autorizado / Brute Force (SEV-1)

### Sintomas
- Alertas de múltiplas tentativas de login
- IPs suspeitos em rate_limit_logs
- Usuários reportando contas comprometidas

### Ação Imediata (< 5 min)

```sql
-- 1. Identificar IPs suspeitos
SELECT ip_address, COUNT(*) as attempts, MAX(created_at) as last_attempt
FROM login_attempts
WHERE created_at > NOW() - INTERVAL '1 hour'
AND success = false
GROUP BY ip_address
HAVING COUNT(*) > 10
ORDER BY attempts DESC;

-- 2. Bloquear IPs maliciosos
INSERT INTO blocked_ips (ip_address, reason, blocked_until, blocked_by)
VALUES ('x.x.x.x', 'Brute force detected', NOW() + INTERVAL '24 hours', auth.uid());

-- 3. Forçar logout de sessões suspeitas
DELETE FROM user_sessions WHERE ip_address = 'x.x.x.x';
```

### Ações Pós-Incidente
- [ ] Revisar logs de auditoria
- [ ] Notificar usuários afetados
- [ ] Considerar habilitar MFA obrigatório
- [ ] Atualizar regras de rate limit

---

## 📉 INCIDENTE: Performance Degradada (SEV-3)

### Sintomas
- Páginas lentas (>3s load time)
- Queries timeout
- Reclamações de usuários

### Diagnóstico

```sql
-- 1. Verificar queries lentas
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 2. Verificar conexões ativas
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- 3. Verificar tamanho das tabelas
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
```

### Ações de Recuperação

| # | Ação | Impacto |
|---|------|----------|
| 1 | Matar queries travadas | `SELECT pg_terminate_backend(pid)` |
| 2 | Adicionar índice faltante | Médio prazo |
| 3 | Otimizar query lenta | Médio prazo |
| 4 | Escalar DB (Supabase) | Se necessário |

---

## 📄 Template de Postmortem

```markdown
# Postmortem: [TÍTULO DO INCIDENTE]

**Data:** YYYY-MM-DD  
**Severidade:** SEV-X  
**Duração:** X horas Y minutos  
**Impacto:** X usuários afetados

## Timeline
- HH:MM - Incidente detectado
- HH:MM - Equipe acionada
- HH:MM - Causa raiz identificada
- HH:MM - Mitigação aplicada
- HH:MM - Sistema normalizado

## Causa Raiz
[Descrição técnica da causa]

## O Que Deu Certo
- [Ponto positivo 1]
- [Ponto positivo 2]

## O Que Pode Melhorar
- [Ponto de melhoria 1]
- [Ponto de melhoria 2]

## Ações Corretivas
| # | Ação | Responsável | Prazo |
|---|------|-------------|-------|
| 1 | [Ação] | [Nome] | [Data] |
```

---

## 📭 INCIDENTE: Disparo Multiplix com falhas / itens em dead letter (SEV-3)

**Quando usar:** um disparo do Multiplix não entregou tudo e você precisa saber **o que falhou, por
quê e quando** — sem abrir tela nova (o disparo não tem painel; a consulta é por função).

**Consultar os itens que esgotaram as tentativas (dead letter).** Rode como **admin/supervisor**
(usuário sem esse papel é recusado de propósito — a função exige o papel dentro dela):

```sql
-- Todos os disparos (mais recentes primeiro), no máximo 500:
SELECT * FROM public.list_multiplix_dead_letters(100);

-- Só um disparo:
SELECT * FROM public.list_multiplix_dead_letters(100, '<dispatch_id>');

-- Só o número (para alerta/painel):
SELECT public.count_multiplix_dead_letters('<dispatch_id>');
```

Retorna: `item_id`, `dispatch_id`, `dispatch_name`, `recipient_id`, `block_id`, `block_order`,
`attempt_count`, `error_class`, `error_message` (o **motivo**), `failed_at` (o **quando**),
`next_attempt_at` e `destino_mascarado` (só os 4 últimos dígitos — diagnóstico não precisa do
contato inteiro).

**⚠️ Dead letter NÃO é `status='failed_permanent'`** — esse status não existe. O dead letter é o
par **`status='failed'` E `next_attempt_at IS NULL`** (tentativas esgotadas). Um item `failed` que
ainda tem `next_attempt_at` marcado é falha **transitória**: o sistema ainda vai retentar e ele
**não** aparece na consulta. Se você procurar pelo nome errado, a lista volta vazia e parece que
está tudo bem.

**O que fazer com o resultado:**

| Situação | Ação |
|---|---|
| `error_class` de número inválido/inexistente | Nada a fazer no sistema — é dado de cadastro ruim; corrigir a origem. |
| Falhas em massa no mesmo disparo | Verificar a conexão da instância (`whatsapp_connections.status`) e o nível de erro do provedor antes de reenviar. |
| Opt-out (supressão) no meio do disparo | **Esperado**: quem pediu opt-out depois do agendamento é suprimido na hora e não recebe. Não é falha; a lista do disparo não muda. |
| Muitos `outcome_unknown` | É quarentena (resposta do provedor não confirmada), não dead letter — ver o fluxo de resolução. |
| Quero reprocessar | Não há reprocessamento em massa pela função: a consulta é **somente leitura** (é diagnóstico). Reprocessar exige ação própria. |

**Por que não há tela:** decisão do dono (F59, 02/10/2026) — consulta operacional por função, sem
construir painel. Fundamento em `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` (D5).

## 📋 Checklist Geral de Incidente

### Durante o Incidente
- [ ] Identificar severidade (SEV-1/2/3/4)
- [ ] Comunicar equipe (Slack #incidents)
- [ ] Iniciar timer de RTO
- [ ] Documentar timeline em tempo real
- [ ] Aplicar mitigação
- [ ] Verificar resolução
- [ ] Comunicar stakeholders

### Pós-Incidente (48h)
- [ ] Escrever postmortem
- [ ] Agendar review com equipe
- [ ] Criar tickets para ações corretivas
- [ ] Atualizar runbook se necessário
- [ ] Arquivar documentação

---

## 📚 Recursos Úteis

### Dashboards
- [Supabase Dashboard](https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh)
- [Vercel Dashboard](https://vercel.com/juca1/zapp_web_v2)
- [ZAPP-WEB Produção (canônica)](https://zapp-web-v2.vercel.app)

### Documentação
- [Backup & Recovery](./BACKUP-RECOVERY-STRATEGY.md)
- [Arquitetura do Sistema](./ZAPP-ESPECIFICACAO-TECNICA-COMPLETA-V2.md)
- [API Reference](./API-REFERENCE-COMPLETA.md)

---

**Aprovado por:** Claude AI — SRE Agent  
**Data:** 2026-04-11  
**Próxima revisão:** 2026-07-11 (trimestral)
