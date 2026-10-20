# Distribuição de Atendimentos — Tabela-Verdade de Fallbacks

> **Código:** `DOC-DIST-001` | **Versão:** 1.0 | **Data:** 2026-04-11

---

## 1. Visão Geral

O sistema ZAPP-WEB distribui conversas automaticamente para atendentes disponíveis usando uma cascata de algoritmos com fallbacks inteligentes. Este documento define a **tabela-verdade** de qual algoritmo é usado em cada cenário.

### 1.1 Algoritmos Disponíveis

| ID | Algoritmo | Descrição | Prioridade |
|----|-----------|-----------|------------|
| A1 | **history** | Mesmo atendente do último contato | 1 (mais alto) |
| A2 | **skillset** | Atendente com skills compatíveis | 2 |
| A3 | **least_load** | Atendente com menos conversas ativas | 3 |
| A4 | **round_robin** | Próximo atendente na rotação circular | 4 (fallback) |
| A5 | **queue_manual** | Aguardar na fila para distribuição manual | 5 (emergencia) |

---

## 2. Tabela-Verdade de Distribuição

### 2.1 Matriz de Decisão Principal

| # | Cliente Retornante? | Skills Requeridas? | Atendentes Disponíveis? | Algoritmo Usado | Fallback |
|---|---------------------|--------------------|--------------------------|-----------------|-----------|
| 1 | ✅ Sim | - | ✅ Atendente anterior online | **history** | - |
| 2 | ✅ Sim | - | ❌ Atendente anterior offline | skillset → least_load | round_robin |
| 3 | ❌ Não | ✅ Sim | ✅ Com skill disponível | **skillset** | least_load |
| 4 | ❌ Não | ✅ Sim | ❌ Sem skill disponível | least_load | round_robin |
| 5 | ❌ Não | ❌ Não | ✅ Algum disponível | **least_load** | round_robin |
| 6 | - | - | ❌ Nenhum disponível | **queue_manual** | - |

### 2.2 Condições Detalhadas

```
SE cliente_retornante E atendente_anterior.online:
    RETORNAR history(atendente_anterior)
    
SENÃO SE fila.requer_skills:
    candidatos = atendentes.filter(possui_skills_requeridas)
    SE candidatos.length > 0:
        RETORNAR least_load(candidatos)
    SENÃO:
        RETORNAR least_load(todos_disponiveis) // fallback sem skill
        
SENÃO SE atendentes_disponiveis.length > 0:
    RETORNAR least_load(atendentes_disponiveis)
    
SENÃO:
    RETORNAR queue_manual() // aguardar na fila
```

---

## 3. Detalhamento dos Algoritmos

### 3.1 History (Histórico)

**Objetivo:** Manter continuidade do relacionamento.

```sql
-- Buscar último atendente do contato
SELECT assigned_to 
FROM conversations 
WHERE contact_id = :contact_id 
AND status = 'closed'
AND assigned_to IS NOT NULL
ORDER BY updated_at DESC 
LIMIT 1;
```

**Critérios de elegibilidade:**
- Atendente deve estar `online`
- Atendente deve estar na mesma fila (se aplicável)
- Não exceder `max_concurrent_chats`
- Último atendimento < 30 dias atrás

### 3.2 Skillset (Habilidades)

**Objetivo:** Rotear para especialista quando necessário.

```sql
-- Buscar atendentes com skills compatíveis
SELECT p.id, p.full_name, p.current_chats
FROM profiles p
JOIN user_skills us ON us.user_id = p.id
JOIN queue_skills qs ON qs.skill_id = us.skill_id
WHERE qs.queue_id = :queue_id
AND p.status = 'online'
AND p.current_chats < p.max_concurrent_chats
GROUP BY p.id
HAVING COUNT(DISTINCT us.skill_id) >= :required_skills_count
ORDER BY p.current_chats ASC;
```

**Skills comuns:**
- `vendas` - Questões comerciais
- `suporte_tecnico` - Problemas técnicos
- `financeiro` - Cobrança, pagamentos
- `logistica` - Entregas, rastreamento
- `vip` - Clientes premium

### 3.3 Least Load (Menor Carga)

**Objetivo:** Balancear carga entre atendentes.

```sql
-- Atendente com menos chats ativos
SELECT p.id, p.full_name, p.current_chats
FROM profiles p
WHERE p.status = 'online'
AND p.current_chats < p.max_concurrent_chats
AND (:queue_id IS NULL OR p.id IN (
    SELECT user_id FROM queue_members WHERE queue_id = :queue_id
))
ORDER BY 
    p.current_chats ASC,
    p.last_assignment_at ASC NULLS FIRST
LIMIT 1;
```

**Desempate:** Se vários atendentes têm a mesma carga, priorizar:
1. Quem não recebeu chat há mais tempo
2. Ordem alfabética (determinismo)

### 3.4 Round Robin (Rotação Circular)

**Objetivo:** Fallback justo quando outros falham.

```sql
-- Próximo na rotação
WITH eligible AS (
    SELECT p.id, p.full_name,
           ROW_NUMBER() OVER (ORDER BY p.last_assignment_at NULLS FIRST, p.id) as rn
    FROM profiles p
    WHERE p.status = 'online'
    AND p.current_chats < p.max_concurrent_chats
)
SELECT id, full_name FROM eligible WHERE rn = 1;
```

### 3.5 Queue Manual (Fila Manual)

**Objetivo:** Último recurso quando ninguém está disponível.

```sql
-- Deixar na fila aguardando
UPDATE conversations 
SET 
    status = 'waiting',
    queue_position = (
        SELECT COALESCE(MAX(queue_position), 0) + 1 
        FROM conversations 
        WHERE queue_id = :queue_id AND status = 'waiting'
    )
WHERE id = :conversation_id;
```

---

## 4. Configurações por Fila

### 4.1 Tabela `queues` - Campos Relevantes

| Campo | Tipo | Descrição | Default |
|-------|------|-----------|----------|
| `distribution_mode` | enum | Modo primário | `auto` |
| `enable_history` | boolean | Priorizar histórico | `true` |
| `enable_skillset` | boolean | Usar skills | `true` |
| `fallback_mode` | enum | Comportamento sem atendente | `queue` |
| `max_wait_time` | interval | Tempo máximo na fila | `30 minutes` |
| `sla_level` | integer | Nível de SLA (1-4) | `1` |

### 4.2 Modos de Distribuição

| Modo | Comportamento |
|------|---------------|
| `auto` | Cascata completa: history → skillset → least_load → round_robin |
| `manual` | Apenas queue_manual, supervisores distribuem |
| `skillset_only` | Apenas skillset → queue_manual (sem fallback para outros) |
| `round_robin_only` | Apenas round_robin (ignora history e skills) |

---

## 5. Fluxograma de Distribuição

```
                    ┌─────────────────┐
                    │ Nova Conversa  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Cliente        │
                    │ Retornante?    │
                    └─────┬────┬─────┘
                      SIM  │     │ NÃO
              ┌───────────▼     ▼────────────┐
              │ Atendente            │ Fila Requer │
              │ Anterior Online?     │ Skills?     │
              └────┬─────┬────       └────┬────┬───┘
                SIM │     │ NÃO          SIM │    │ NÃO
                    ▼     │                  ▼    │
           ┌────────────┐  │         ┌────────────┐ │
           │  HISTORY   │  │         │  SKILLSET  │ │
           │  ✅ Fim     │  │         └─────┬──────┘ │
           └────────────┘  │               │       │
                          │               ▼       ▼
                          │       ┌───────────────────┐
                          ├──────▶│    LEAST_LOAD     │
                          │       └────────┬──────────┘
                          │                │
                          │       ┌────────▼─────────┐
                          │       │ Encontrou        │
                          │       │ Atendente?       │
                          │       └────┬──────┬──────┘
                          │         SIM │      │ NÃO
                          │             ▼      ▼
                          │      ┌──────────┐  ┌─────────────┐
                          │      │ ATRIBUIR │  │ ROUND_ROBIN │
                          │      │ ✅ Fim    │  └─────┬───────┘
                          │      └──────────┘        │
                          │                         ▼
                          │               ┌─────────────────┐
                          │               │ Encontrou      │
                          │               │ Atendente?     │
                          │               └───┬──────┬─────┘
                          │                 SIM│      │NÃO
                          │                    ▼      ▼
                          │             ┌─────────┐ ┌────────────┐
                          │             │ATRIBUIR │ │QUEUE_MANUAL│
                          │             │✅ Fim    │ │⏳ Aguardar │
                          │             └─────────┘ └────────────┘
```

---

## 6. Métricas de Monitoramento

### 6.1 Queries de Acompanhamento

```sql
-- Distribuição por algoritmo (hoje)
SELECT 
    distribution_algorithm,
    COUNT(*) as total,
    ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) as pct
FROM conversations
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY distribution_algorithm
ORDER BY total DESC;

-- Taxa de fallback
SELECT 
    DATE(created_at) as dia,
    COUNT(*) FILTER (WHERE distribution_algorithm = 'history') as history,
    COUNT(*) FILTER (WHERE distribution_algorithm = 'skillset') as skillset,
    COUNT(*) FILTER (WHERE distribution_algorithm = 'least_load') as least_load,
    COUNT(*) FILTER (WHERE distribution_algorithm = 'round_robin') as round_robin,
    COUNT(*) FILTER (WHERE distribution_algorithm = 'queue_manual') as manual
FROM conversations
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY dia;

-- Tempo médio até atribuição
SELECT 
    distribution_algorithm,
    AVG(EXTRACT(EPOCH FROM (assigned_at - created_at))) as avg_seconds,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (assigned_at - created_at))) as p95_seconds
FROM conversations
WHERE assigned_at IS NOT NULL
AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY distribution_algorithm;
```

### 6.2 Alertas Recomendados

| Métrica | Threshold Amarelo | Threshold Vermelho |
|---------|-------------------|---------------------|
| % queue_manual | > 5% | > 15% |
| % round_robin | > 30% | > 50% |
| Tempo médio fila | > 2 min | > 5 min |
| Conversas sem atribuir | > 10 | > 25 |

---

## 7. Troubleshooting

| Sintoma | Causa Provável | Solução |
|---------|----------------|----------|
| Todos indo para queue_manual | Nenhum atendente online | Verificar status dos atendentes |
| Histórico não funciona | `enable_history = false` na fila | Habilitar na configuração |
| Skills ignoradas | Atendentes sem skills cadastradas | Vincular skills aos usuários |
| Round robin sempre usado | Atendentes com chats no limite | Aumentar `max_concurrent_chats` |
| Distribuição desbalanceada | `last_assignment_at` desatualizado | Verificar trigger de atualização |

---

## 8. Checklist de Implementação

- [ ] Adicionar coluna `distribution_algorithm` em `conversations`
- [ ] Criar tabela `user_skills` e `queue_skills`
- [ ] Implementar função `distribute_conversation()`
- [ ] Criar trigger para atualizar `last_assignment_at`
- [ ] Configurar filas com modos de distribuição
- [ ] Dashboard de monitoramento
- [ ] Alertas de fallback excessivo

---

**Última atualização:** 2026-04-11