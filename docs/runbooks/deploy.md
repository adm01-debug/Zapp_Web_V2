# Runbook de Deploy e Operações

## Visão Geral
Este documento descreve os procedimentos operacionais para deploy, monitoramento e resposta a incidentes da plataforma WhatsApp Omnichannel.

---

## 1. Deploy

### 1.1 Deploy via Lovable
O deploy é automático via Lovable. Basta clicar em **Publish** no painel Lovable.

- **URL de Preview**: `https://id-preview--1d419c34-35ac-4a71-96a5-146ca1b3ebf2.lovable.app`
- **URL de Produção**: `https://pronto-talk-suite.lovable.app`

### 1.2 Checklist Pré-Deploy
- [ ] Todos os testes passam (`vitest run`)
- [ ] Build sem erros (`tsc --noEmit`)
- [ ] Sem warnings de lint críticos
- [ ] Migrações de banco aplicadas e aprovadas
- [ ] Edge Functions testadas via `curl`
- [ ] Variáveis de ambiente/secrets configurados

### 1.3 Edge Functions
As Edge Functions são deployadas **automaticamente** pelo Lovable Cloud. Não é necessário deploy manual.

Para testar uma Edge Function:
```bash
curl -X POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/<function-name> \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

---

## 2. Monitoramento

### 2.1 Web Vitals
Métricas coletadas automaticamente via `src/lib/web-vitals.ts`:
- **LCP** < 2.5s (target)
- **INP** < 200ms
- **CLS** < 0.1

### 2.2 Logs de Edge Functions
Acessíveis via Lovable Cloud → Backend → Logs.

### 2.3 Banco de Dados
- Audit logs: tabela `audit_logs`
- Login attempts: tabela `login_attempts`
- Connection health: tabela `connection_health_logs`

---

## 3. Resposta a Incidentes

### 3.1 App não carrega
1. Verificar status do Lovable Cloud
2. Checar logs do dev server
3. Verificar se as variáveis de ambiente estão configuradas
4. Limpar cache do navegador e tentar novamente

### 3.2 WhatsApp desconectado
1. Verificar tabela `whatsapp_connections` para status da conexão
2. Checar logs da Edge Function `connection-health-check`
3. Reconectar via painel de Conexões no app
4. Verificar se a Evolution API está respondendo

### 3.3 Erros de autenticação
1. Verificar tabela `login_attempts` para bloqueios
2. Checar se o email do usuário está confirmado
3. Verificar RLS policies da tabela `profiles`
4. Verificar logs de auth no backend

### 3.4 Template de Post-Mortem
```markdown
## Incidente: [Descrição]
## Data: YYYY-MM-DD HH:mm
## Duração: X horas
## Impacto: [Usuários afetados]
## Timeline:
- HH:mm - Incidente detectado
- HH:mm - Investigação iniciada
- HH:mm - Root cause identificado
- HH:mm - Fix aplicado
- HH:mm - Serviço restaurado
## Root Cause: [Causa raiz]
## Ações Corretivas:
- [ ] Ação 1
- [ ] Ação 2
```

---

## 4. Contatos e Escalação
- **Lovable Cloud**: Suporte via interface Lovable
- **Evolution API**: Documentação em evolution-api.com
