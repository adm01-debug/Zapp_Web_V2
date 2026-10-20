# 🔐 ZAPP-WEB — Estratégia de Backup e Recovery

**Versão:** 1.0  
**Data:** 2026-04-11  
**Autor:** Claude AI — DevOps Agent  
**Status:** Aprovado

---

## 📋 Visão Geral

Este documento define a estratégia completa de backup, restore e disaster recovery para o sistema ZAPP-WEB.

### Infraestrutura

| Componente | Provedor | Localização |
|------------|----------|-------------|
| **Database Principal** | Supabase | `tnnnlkbymytvtqngbbqh` |
| **Database CRM Externo** | Supabase | `pgxfvjmuubtbowutlide` |
| **Storage** | Supabase Storage | 3 buckets |
| **Edge Functions** | Supabase (Deno) | 20 funções |
| **Código Fonte** | GitHub | `adm01-debug/zapp-web` |

---

## 🗄️ PARTE 1: Backup de Banco de Dados

### 1.1 Point-in-Time Recovery (PITR)

Supabase oferece PITR nativo para planos Pro+:

| Plano | Retenção PITR | RPO | RTO |
|-------|---------------|-----|-----|
| Free | Não disponível | N/A | N/A |
| Pro | 7 dias | ~1 min | <1 hora |
| Team | 14 dias | ~1 min | <1 hora |
| Enterprise | 30+ dias | ~1 min | <30 min |

**⚠️ AÇÃO NECESSÁRIA:** Verificar plano atual e habilitar PITR se disponível.

### 1.2 Backups Automáticos

Supabase realiza backups automáticos:

```
┌─────────────────────────────────────────────┐
│ Frequência: Diário (automático)             │
│ Retenção: 7-30 dias (dependendo do plano)   │
│ Tipo: Snapshot completo                     │
│ Encriptação: AES-256 em repouso             │
└─────────────────────────────────────────────┘
```

### 1.3 Backup Manual via pg_dump

Para backups manuais ou migração:

```bash
# Exportar schema + dados
PGPASSWORD="<service_role_key>" pg_dump \
  -h db.<project_ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -F c \
  -f backup_$(date +%Y%m%d_%H%M%S).dump

# Exportar apenas schema
pg_dump ... --schema-only -f schema_only.sql

# Exportar apenas dados
pg_dump ... --data-only -f data_only.sql
```

### 1.4 Script de Backup Semanal

Criar cron job para backup semanal:

```bash
#!/bin/bash
# /scripts/weekly_backup.sh

set -e

# Configurações
PROJECT_REF="tnnnlkbymytvtqngbbqh"
BACKUP_DIR="/backups/zapp-web"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

# Criar diretório
mkdir -p $BACKUP_DIR

# Backup principal
echo "[$(date)] Iniciando backup..."
PGPASSWORD="$SUPABASE_SERVICE_KEY" pg_dump \
  -h db.$PROJECT_REF.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -F c \
  -f $BACKUP_DIR/zapp_web_$DATE.dump

# Comprimir
gzip $BACKUP_DIR/zapp_web_$DATE.dump

# Upload para storage externo (opcional)
# aws s3 cp $BACKUP_DIR/zapp_web_$DATE.dump.gz s3://backups/

# Limpar backups antigos
find $BACKUP_DIR -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup concluído: zapp_web_$DATE.dump.gz"
```

---

## 📦 PARTE 2: Backup de Storage

### 2.1 Buckets Existentes

| Bucket | Conteúdo | Criticidade |
|--------|----------|-------------|
| `avatars` | Fotos de perfil | Média |
| `audio-messages` | Áudios WhatsApp | Alta |
| `whatsapp-media` | Mídia geral | Alta |

### 2.2 Script de Backup Storage

```typescript
// supabase/functions/backup-storage/index.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const BUCKETS = ['avatars', 'audio-messages', 'whatsapp-media']

export async function backupBucket(bucketName: string) {
  const { data: files, error } = await supabase
    .storage
    .from(bucketName)
    .list('', { limit: 10000 })
  
  if (error) throw error
  
  // Listar todos os arquivos e seus paths
  const manifest = files.map(f => ({
    name: f.name,
    size: f.metadata?.size,
    created: f.created_at,
    path: `${bucketName}/${f.name}`
  }))
  
  return manifest
}
```

---

## 🔄 PARTE 3: Procedimentos de Restore

### 3.1 Restore via PITR (Preferido)

1. Acessar Supabase Dashboard
2. Project Settings → Database → Backups
3. Selecionar ponto no tempo desejado
4. Clicar "Restore"
5. Aguardar ~15-30 minutos

**⚠️ CUIDADO:** Restore sobrescreve dados atuais!

### 3.2 Restore via pg_restore

```bash
# Restore completo
PGPASSWORD="<service_role_key>" pg_restore \
  -h db.<project_ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c \
  backup_file.dump

# Restore apenas tabela específica
pg_restore ... -t contacts backup_file.dump
```

### 3.3 Restore Seletivo (Tabela por Tabela)

```sql
-- 1. Criar tabela temporária a partir do backup
CREATE TABLE contacts_restore AS
SELECT * FROM contacts WHERE 1=0;

-- 2. Importar dados do backup
\copy contacts_restore FROM 'contacts_backup.csv' CSV HEADER;

-- 3. Comparar e reconciliar
SELECT c.id, c.phone, r.phone 
FROM contacts c 
FULL OUTER JOIN contacts_restore r ON c.id = r.id
WHERE c.id IS NULL OR r.id IS NULL;

-- 4. Merge se necessário
INSERT INTO contacts 
SELECT * FROM contacts_restore r
WHERE NOT EXISTS (SELECT 1 FROM contacts WHERE id = r.id);
```

---

## 🚨 PARTE 4: Disaster Recovery

### 4.1 Cenários e Respostas

| Cenário | RTO Alvo | Procedimento |
|---------|----------|---------------|
| **Corrupção de dados** | 1 hora | PITR para ponto anterior |
| **Deleção acidental** | 2 horas | Restore seletivo via backup |
| **Falha de região** | 4 horas | Failover para região secundária |
| **Comprometimento** | 1 hora | Rotacionar credenciais + restore |
| **Ransomware** | 4 horas | Isolar + restore de backup limpo |

### 4.2 Runbook de Incidente

```
┌────────────────────────────────────────────────────┐
│ PASSO 1: IDENTIFICAR                               │
├────────────────────────────────────────────────────┤
│ - Qual o escopo? (tabela, schema, todo DB)         │
│ - Quando ocorreu? (timestamp exato)                │
│ - Causa raiz? (bug, ataque, erro humano)           │
└────────────────────────────────────────────────────┘
           ↓
┌────────────────────────────────────────────────────┐
│ PASSO 2: CONTER                                    │
├────────────────────────────────────────────────────┤
│ - Pausar Edge Functions se necessário              │
│ - Revogar tokens comprometidos                     │
│ - Comunicar equipe via Slack #incidents            │
└────────────────────────────────────────────────────┘
           ↓
┌────────────────────────────────────────────────────┐
│ PASSO 3: RESTAURAR                                 │
├────────────────────────────────────────────────────┤
│ - Executar restore (PITR ou backup manual)         │
│ - Validar integridade dos dados                    │
│ - Testar funcionalidades críticas                  │
└────────────────────────────────────────────────────┘
           ↓
┌────────────────────────────────────────────────────┐
│ PASSO 4: DOCUMENTAR                                │
├────────────────────────────────────────────────────┤
│ - Postmortem em 48h                                │
│ - Atualizar runbook se necessário                  │
│ - Implementar ações preventivas                    │
└────────────────────────────────────────────────────┘
```

### 4.3 Contatos de Emergência

| Papel | Responsável | Contato |
|-------|-------------|----------|
| DBA / DevOps | Joaquim | `@joaquim` |
| Supabase Support | — | support@supabase.io |
| GitHub Support | — | support.github.com |

---

## 📊 PARTE 5: Monitoramento e Alertas

### 5.1 Métricas a Monitorar

| Métrica | Alerta Amarelo | Alerta Vermelho |
|---------|----------------|------------------|
| Tamanho do DB | >5 GB | >8 GB |
| Conexões ativas | >80 | >100 |
| Tempo de query p95 | >500ms | >2s |
| Storage utilizado | >80% | >95% |
| Backup age | >24h | >48h |

### 5.2 Dashboard Sugerido

Implementar widget no Dashboard ZAPP-WEB:

```typescript
// components/dashboard/BackupHealthWidget.tsx
const BackupHealthWidget = () => {
  const { data: backupStatus } = useQuery(['backup-status'], 
    () => supabase.rpc('get_backup_status')
  )
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>🔐 Saúde do Backup</CardTitle>
      </CardHeader>
      <CardContent>
        <div>Último backup: {backupStatus?.last_backup}</div>
        <div>Tamanho do DB: {backupStatus?.db_size}</div>
        <div>PITR habilitado: {backupStatus?.pitr_enabled ? '✅' : '❌'}</div>
      </CardContent>
    </Card>
  )
}
```

---

## ✅ Checklist de Implementação

- [ ] Verificar plano Supabase e habilitar PITR
- [ ] Configurar backup semanal automatizado
- [ ] Testar procedimento de restore em ambiente de dev
- [ ] Documentar contatos de emergência
- [ ] Implementar widget de saúde do backup
- [ ] Treinar equipe no runbook de incidente
- [ ] Agendar drill de disaster recovery trimestral

---

## 📚 Referências

- [Supabase Backups Documentation](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL pg_dump Manual](https://www.postgresql.org/docs/current/app-pgdump.html)
- [Disaster Recovery Best Practices](https://cloud.google.com/architecture/dr-scenarios-planning-guide)

---

**Aprovado por:** Claude AI — DevOps Agent  
**Data:** 2026-04-11  
**Próxima revisão:** 2026-07-11 (trimestral)
