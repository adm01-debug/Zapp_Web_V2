# SLA Escalation Cron — Documentação Técnica

> **Código:** `DOC-CRON-001` | **Versão:** 1.0 | **Data:** 2026-04-11

---

## 1. Visão Geral

O sistema ZAPP-WEB utiliza **pg_cron** (extensão nativa do PostgreSQL no Supabase) para executar verificações automáticas de SLA e escalar conversas que ultrapassaram os limites definidos.

### Objetivos do Cron

- Detectar violações de SLA antes que impactem o cliente
- Escalar automaticamente para supervisores/gerentes
- Notificar via webhook (n8n/WhatsApp) sobre tickets críticos
- Registrar métricas para análise de performance

---

## 2. Definições de SLA

| Nível | Nome | TMPR (1ª Resposta) | TMR (Resolução) | Escalação Após |
|-------|------|---------------------|-----------------|----------------|
| 1 | Standard | 5 minutos | 2 horas | 10 min |
| 2 | Priority | 3 minutos | 1 hora | 5 min |
| 3 | VIP | 1 minuto | 30 minutos | 2 min |
| 4 | Critical | 30 segundos | 15 minutos | 1 min |

### Matriz de Escalação

| Tempo Violado | Ação | Destinatário |
|---------------|------|--------------|
| 100% do TMPR | Alerta amarelo | Atendente atual |
| 150% do TMPR | Escalar Nível 1 | Supervisor de turno |
| 200% do TMPR | Escalar Nível 2 | Gerente de operações |
| 300% do TMPR | Escalar Nível 3 | Diretor + Alerta crítico |

---

## 3. Implementação SQL

### 3.1 Habilitar pg_cron

```sql
-- Verificar se a extensão está ativa
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Se não estiver, habilitar:
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;
```

### 3.2 Tabela de Log de Violações

```sql
CREATE TABLE IF NOT EXISTS public.sla_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    sla_level INTEGER NOT NULL DEFAULT 1,
    expected_response_time INTERVAL NOT NULL,
    actual_wait_time INTERVAL NOT NULL,
    violation_percentage NUMERIC(5,2) NOT NULL,
    
    escalation_level INTEGER NOT NULL DEFAULT 0,
    escalated_to UUID REFERENCES profiles(id),
    escalation_reason TEXT,
    
    status TEXT NOT NULL DEFAULT 'open' 
        CHECK (status IN ('open', 'acknowledged', 'resolved', 'expired')),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sla_violations_status ON sla_violations(status) WHERE status = 'open';
CREATE INDEX idx_sla_violations_conversation ON sla_violations(conversation_id);
CREATE INDEX idx_sla_violations_created ON sla_violations(created_at DESC);

ALTER TABLE sla_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors can view violations"
ON sla_violations FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'supervisor', 'manager')
));
```

### 3.3 Função de Verificação de SLA

```sql
CREATE OR REPLACE FUNCTION check_sla_violations()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
    v_violations_count INTEGER := 0;
    v_conversation RECORD;
    v_wait_time INTERVAL;
    v_expected_time INTERVAL;
    v_escalation_threshold INTERVAL;
    v_violation_pct NUMERIC;
    v_escalation_level INTEGER;
BEGIN
    FOR v_conversation IN
        SELECT 
            c.id AS conversation_id,
            c.contact_id,
            c.queue_id,
            c.assigned_to,
            c.last_message_at,
            COALESCE(q.sla_level, 1) AS sla_level,
            COALESCE((ct.tags->>'vip')::boolean, false) AS is_vip
        FROM conversations c
        LEFT JOIN queues q ON c.queue_id = q.id
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        WHERE c.status IN ('open', 'pending', 'waiting')
        AND c.last_message_at < NOW() - INTERVAL '1 minute'
        AND NOT EXISTS (
            SELECT 1 FROM sla_violations sv
            WHERE sv.conversation_id = c.id AND sv.status = 'open'
        )
    LOOP
        v_wait_time := NOW() - v_conversation.last_message_at;
        
        v_expected_time := CASE v_conversation.sla_level
            WHEN 4 THEN INTERVAL '30 seconds'
            WHEN 3 THEN INTERVAL '1 minute'
            WHEN 2 THEN INTERVAL '3 minutes'
            ELSE INTERVAL '5 minutes'
        END;
        
        v_escalation_threshold := CASE v_conversation.sla_level
            WHEN 4 THEN INTERVAL '1 minute'
            WHEN 3 THEN INTERVAL '2 minutes'
            WHEN 2 THEN INTERVAL '5 minutes'
            ELSE INTERVAL '10 minutes'
        END;
        
        IF v_conversation.is_vip THEN
            v_expected_time := v_expected_time * 0.5;
            v_escalation_threshold := v_escalation_threshold * 0.5;
        END IF;
        
        v_violation_pct := EXTRACT(EPOCH FROM v_wait_time) / 
                          NULLIF(EXTRACT(EPOCH FROM v_expected_time), 0) * 100;
        
        IF v_wait_time >= v_escalation_threshold THEN
            v_escalation_level := CASE
                WHEN v_violation_pct >= 300 THEN 3
                WHEN v_violation_pct >= 200 THEN 2
                WHEN v_violation_pct >= 150 THEN 1
                ELSE 0
            END;
            
            INSERT INTO sla_violations (
                conversation_id, contact_id, queue_id, assigned_user_id,
                sla_level, expected_response_time, actual_wait_time,
                violation_percentage, escalation_level, escalation_reason
            ) VALUES (
                v_conversation.conversation_id, v_conversation.contact_id,
                v_conversation.queue_id, v_conversation.assigned_to,
                v_conversation.sla_level, v_expected_time, v_wait_time,
                v_violation_pct, v_escalation_level,
                CASE v_escalation_level
                    WHEN 3 THEN 'CRÍTICO: Espera excede 300% do SLA'
                    WHEN 2 THEN 'URGENTE: Espera excede 200% do SLA'
                    WHEN 1 THEN 'ALERTA: Espera excede 150% do SLA'
                    ELSE 'AVISO: SLA em risco'
                END
            );
            v_violations_count := v_violations_count + 1;
        END IF;
    END LOOP;
    
    UPDATE sla_violations 
    SET status = 'resolved', resolved_at = NOW()
    WHERE status = 'open'
    AND conversation_id IN (
        SELECT id FROM conversations WHERE status IN ('closed', 'resolved')
    );
    
    RETURN v_violations_count;
END;
$fn$;
```

### 3.4 Agendamento do Cron

```sql
-- Verificação de SLA a cada 5 minutos
SELECT cron.schedule(
    'check-sla-violations',
    '*/5 * * * *',
    $$SELECT check_sla_violations()$$
);

-- Limpeza de violações antigas (diário às 3h)
SELECT cron.schedule(
    'cleanup-old-violations',
    '0 3 * * *',
    $$DELETE FROM sla_violations 
      WHERE status IN ('resolved', 'expired') 
      AND created_at < NOW() - INTERVAL '90 days'$$
);

-- Verificar jobs agendados
SELECT * FROM cron.job ORDER BY jobname;
```

---

## 4. Monitoramento

```sql
-- Violações abertas por nível
SELECT escalation_level, COUNT(*), AVG(violation_percentage)::int as avg_pct
FROM sla_violations WHERE status = 'open'
GROUP BY escalation_level ORDER BY escalation_level DESC;

-- Taxa de cumprimento de SLA por fila (últimos 7 dias)
SELECT 
    q.name as fila,
    COUNT(*) FILTER (WHERE sv.id IS NULL) as dentro_sla,
    COUNT(*) FILTER (WHERE sv.id IS NOT NULL) as violado,
    ROUND(COUNT(*) FILTER (WHERE sv.id IS NULL)::numeric / 
          NULLIF(COUNT(*), 0) * 100, 1) as compliance_pct
FROM conversations c
LEFT JOIN queues q ON c.queue_id = q.id
LEFT JOIN sla_violations sv ON c.id = sv.conversation_id
WHERE c.created_at >= NOW() - INTERVAL '7 days'
GROUP BY q.id, q.name ORDER BY compliance_pct ASC;
```

---

## 5. Troubleshooting

```sql
-- Ver jobs ativos
SELECT * FROM cron.job;

-- Ver execuções recentes
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Forçar execução manual
SELECT check_sla_violations();
```

---

## 6. Integração n8n

O webhook de escalação pode ser configurado no n8n para:

1. Receber payload JSON com dados da violação
2. Rotear por nível de escalação
3. Enviar WhatsApp para supervisor/gerente
4. Atualizar status no Bitrix24

**Endpoint sugerido:** `POST https://n8n.atomicabr.com.br/webhook/sla-escalation`

---

**Última atualização:** 2026-04-11