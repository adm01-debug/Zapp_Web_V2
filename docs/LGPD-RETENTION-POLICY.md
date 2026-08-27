# 🛡️ ZAPP-WEB — Política de Retenção de Dados (LGPD)

**Versão:** 1.0  
**Data:** 2026-04-11  
**Autor:** Claude AI — Compliance Agent  
**Status:** Aprovado  
**Base Legal:** Lei 13.709/2018 (LGPD) + GDPR (referência)

---

## 1. OBJETIVO

Estabelecer as diretrizes de retenção, arquivamento e exclusão de dados pessoais no sistema ZAPP-WEB, em conformidade com a Lei Geral de Proteção de Dados (LGPD).

---

## 2. ESCOPO

**Aplica-se a:**
- Todos os dados pessoais tratados pelo sistema
- Usuários internos (atendentes, supervisores, administradores)
- Titulares externos (contatos/clientes via WhatsApp)
- Dados em trânsito, em processamento e em repouso

**Sistemas abrangidos:**
- Supabase `tnnnlkbymytvtqngbbqh` (banco principal)
- Supabase `pgxfvjmuubtbowutlide` (CRM externo)
- Storage buckets (avatars, audio-messages, whatsapp-media)

---

## 3. DEFINIÇÕES

| Termo | Definição |
|-------|------------|
| **Dado Pessoal** | Informação relacionada a pessoa natural identificada ou identificável |
| **Dado Sensível** | Origem racial/étnica, opinião política, dados de saúde, etc. |
| **Titular** | Pessoa natural a quem se referem os dados |
| **Controlador** | Quem decide sobre o tratamento (empresa cliente) |
| **Operador** | Quem trata dados em nome do controlador (ZAPP-WEB) |
| **Retenção** | Período de armazenamento dos dados |
| **Anonimização** | Remoção de atributos identificadores |
| **Exclusão Lógica** | Soft delete (campo deleted_at) |
| **Exclusão Física** | Remoção definitiva do banco |

---

## 4. TABELA DE RETENÇÃO

### 4.1 Dados de Atendimento

| Tabela | Tipo de Dado | Retenção | Base Legal | Ação após Prazo |
|--------|--------------|----------|------------|------------------|
| `contacts` | Pessoal | 2 anos* | Legítimo interesse | Anonimizar |
| `messages` | Pessoal + Comunicação | 2 anos* | Legítimo interesse | Anonimizar |
| `contact_notes` | Pessoal | 2 anos* | Legítimo interesse | Excluir |
| `contact_tags` | Metadata | 2 anos* | Legítimo interesse | Excluir |
| `csat_surveys` | Feedback | 2 anos | Legítimo interesse | Anonimizar |
| `conversation_analyses` | Analítico | 2 anos | Legítimo interesse | Anonimizar |

*Contado a partir do último contato ativo

### 4.2 Dados de Usuários Internos

| Tabela | Tipo de Dado | Retenção | Base Legal | Ação após Prazo |
|--------|--------------|----------|------------|------------------|
| `profiles` | Pessoal + Profissional | 5 anos* | Contrato | Anonimizar |
| `user_sessions` | Log de acesso | 90 dias | Segurança | Excluir |
| `user_devices` | Fingerprint | 90 dias | Segurança | Excluir |
| `login_attempts` | Log de segurança | 90 dias | Segurança | Excluir |
| `passkey_credentials` | Autenticação | 5 anos* | Contrato | Excluir |
| `mfa_sessions` | Autenticação | 30 dias | Segurança | Excluir |

*Contado a partir da inativação do usuário

### 4.3 Dados de Operação

| Tabela | Tipo de Dado | Retenção | Base Legal | Ação após Prazo |
|--------|--------------|----------|------------|------------------|
| `audit_logs` | Auditoria | 5 anos | Obrigação legal | Arquivar |
| `campaigns` | Operacional | 2 anos | Legítimo interesse | Excluir |
| `campaign_contacts` | Operacional | 2 anos | Legítimo interesse | Excluir |
| `scheduled_messages` | Operacional | 90 dias | Legítimo interesse | Excluir |
| `chatbot_executions` | Operacional | 90 dias | Legítimo interesse | Excluir |

### 4.4 Dados de Segurança

| Tabela | Tipo de Dado | Retenção | Base Legal | Ação após Prazo |
|--------|--------------|----------|------------|------------------|
| `blocked_ips` | Segurança | 1 ano | Segurança | Excluir |
| `rate_limit_logs` | Segurança | 30 dias | Segurança | Excluir |
| `security_alerts` | Segurança | 5 anos | Segurança | Arquivar |
| `password_reset_requests` | Segurança | 30 dias | Segurança | Excluir |

### 4.5 Mídias (Storage)

| Bucket | Tipo | Retenção | Ação |
|--------|------|----------|------|
| `avatars` | Imagem perfil | 5 anos* | Excluir |
| `audio-messages` | Áudio WhatsApp | 2 anos | Excluir |
| `whatsapp-media` | Mídia geral | 2 anos | Excluir |

---

## 5. PROCEDIMENTOS DE EXCLUSÃO

### 5.1 Exclusão Lógica (Soft Delete)

Para dados que podem ser recuperados:

```sql
-- Soft delete de contato
UPDATE contacts
SET 
  deleted_at = NOW(),
  status = 'deleted'
WHERE id = '<contact_id>';
```

### 5.2 Anonimização

Para dados que devem perder identificabilidade:

```sql
-- Anonimizar contato (manter para análise)
UPDATE contacts
SET
  name = 'Anonimizado',
  phone = CONCAT('+55', SUBSTRING(phone FROM 4 FOR 2), '*****', RIGHT(phone, 4)),
  email = NULL,
  avatar_url = NULL,
  notes = NULL,
  company = NULL,
  surname = NULL,
  nickname = NULL,
  job_title = NULL,
  anonymized_at = NOW()
WHERE id = '<contact_id>';
```

### 5.3 Exclusão Física (Hard Delete)

Para dados que devem ser removidos completamente:

```sql
-- Excluir permanentemente (cascata configurada)
DELETE FROM contacts WHERE id = '<contact_id>';
```

### 5.4 Purge Automático (Cron Job)

```sql
-- Executar semanalmente via pg_cron ou Edge Function

-- 1. Limpar rate_limit_logs > 30 dias
DELETE FROM rate_limit_logs 
WHERE created_at < NOW() - INTERVAL '30 days';

-- 2. Limpar login_attempts > 90 dias
DELETE FROM login_attempts 
WHERE created_at < NOW() - INTERVAL '90 days';

-- 3. Limpar user_sessions > 90 dias
DELETE FROM user_sessions 
WHERE created_at < NOW() - INTERVAL '90 days';

-- 4. Limpar user_devices > 90 dias (sem login recente)
DELETE FROM user_devices 
WHERE last_used_at < NOW() - INTERVAL '90 days';

-- 5. Limpar mfa_sessions > 30 dias
DELETE FROM mfa_sessions 
WHERE created_at < NOW() - INTERVAL '30 days';

-- 6. Limpar password_reset_requests > 30 dias
DELETE FROM password_reset_requests 
WHERE created_at < NOW() - INTERVAL '30 days';
```

---

## 6. DIREITOS DOS TITULARES

### 6.1 Direito de Acesso (Art. 18, II)

```sql
-- Exportar todos os dados de um titular
SELECT * FROM contacts WHERE phone = '+5511999999999';
SELECT * FROM messages WHERE contact_id = '<contact_id>';
SELECT * FROM contact_notes WHERE contact_id = '<contact_id>';
SELECT * FROM csat_surveys WHERE contact_id = '<contact_id>';
```

### 6.2 Direito de Correção (Art. 18, III)

Implementado via interface de edição de contatos.

### 6.3 Direito de Exclusão (Art. 18, VI)

```sql
-- Atender solicitação de exclusão
-- 1. Verificar se não há obrigação legal de manter
-- 2. Executar anonimização ou exclusão
-- 3. Registrar em audit_logs

INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
VALUES (
  auth.uid(),
  'LGPD_EXCLUSION_REQUEST',
  'contact',
  '<contact_id>',
  '{"reason": "Solicitação do titular", "date": "2026-04-11"}'
);
```

### 6.4 Direito de Portabilidade (Art. 18, V)

Exportar dados em formato estruturado (JSON/CSV):

```typescript
// Edge Function: export-user-data
export async function exportUserData(phone: string) {
  const contacts = await supabase.from('contacts').select('*').eq('phone', phone);
  const messages = await supabase.from('messages').select('*').eq('contact_id', contacts.data[0].id);
  
  return {
    exported_at: new Date().toISOString(),
    format: 'JSON',
    data: { contacts: contacts.data, messages: messages.data }
  };
}
```

---

## 7. AUDITORIA E REGISTRO

### 7.1 Eventos a Registrar

| Evento | Tabela de Log | Retenção |
|--------|---------------|----------|
| Criação de contato | audit_logs | 5 anos |
| Edição de dados pessoais | audit_logs | 5 anos |
| Exclusão de contato | audit_logs | 5 anos |
| Acesso a dados | audit_logs | 5 anos |
| Exportação de dados | audit_logs | 5 anos |
| Solicitação LGPD | audit_logs | 5 anos |
| Purge automático | audit_logs | 5 anos |

### 7.2 Campos Obrigatórios no Log

```typescript
interface AuditLogEntry {
  id: string;
  user_id: string;           // Quem executou
  action: string;            // LGPD_*, CRUD_*
  entity_type: string;       // contact, message, etc.
  entity_id: string;         // ID do registro
  details: {
    reason?: string;         // Motivo da ação
    legal_basis?: string;    // Base legal
    requester?: string;      // Solicitante (se externo)
    previous_values?: any;   // Valores antes da alteração
  };
  ip_address: string;
  user_agent: string;
  created_at: timestamp;
}
```

---

## 8. IMPLEMENTAÇÃO TÉCNICA

### 8.1 Migration: Adicionar Campos LGPD

```sql
-- Migration: add_lgpd_fields
ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_retention_override INTERVAL;

-- Index para queries de purge
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at 
  ON contacts (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_anonymized_at 
  ON contacts (anonymized_at) WHERE anonymized_at IS NOT NULL;
```

### 8.2 Edge Function: LGPD Purge Scheduler

```typescript
// supabase/functions/lgpd-purge/index.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const results = {
    rate_limit_logs: 0,
    login_attempts: 0,
    user_sessions: 0,
    mfa_sessions: 0,
  }
  
  // Purge rate_limit_logs > 30 days
  const { count: rl } = await supabase
    .from('rate_limit_logs')
    .delete()
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  results.rate_limit_logs = rl || 0
  
  // ... outras tabelas
  
  // Log da execução
  await supabase.from('audit_logs').insert({
    action: 'LGPD_AUTOMATIC_PURGE',
    entity_type: 'system',
    details: results
  })
  
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## 9. CHECKLIST DE CONFORMIDADE

### Implementação Técnica
- [ ] Campos LGPD adicionados às tabelas
- [ ] Indexes para queries de purge
- [ ] Edge Function de purge automático
- [ ] Cron job configurado (semanal)
- [ ] Função de exportação de dados
- [ ] Função de anonimização

### Processos
- [ ] Procedimento de resposta a solicitações LGPD
- [ ] SLA de atendimento (15 dias úteis)
- [ ] Canal de contato do DPO
- [ ] Treinamento da equipe

### Documentação
- [ ] Política de privacidade atualizada
- [ ] Termos de uso atualizados
- [ ] Registro de atividades de tratamento
- [ ] RIPD (Relatório de Impacto)

---

## 10. CONTATO DPO

| Função | Responsável | Contato |
|--------|-------------|----------|
| DPO (Encarregado) | [A definir] | dpo@empresa.com.br |
| Suporte LGPD | Equipe | lgpd@empresa.com.br |

---

## 11. HISTÓRICO DE REVISÕES

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-04-11 | Claude AI | Versão inicial |

---

**Documento controlado. Revisão anual obrigatória.**
