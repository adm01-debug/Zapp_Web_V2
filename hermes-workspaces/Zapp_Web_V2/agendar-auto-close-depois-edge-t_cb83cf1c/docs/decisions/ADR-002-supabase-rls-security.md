# ADR-002: Row-Level Security (RLS) como Camada Primária de Autorização

## Status: Aceito
## Data: 2025-02-01

## Contexto
O sistema lida com dados sensíveis de múltiplos agentes/equipes e precisa garantir isolamento de dados sem depender exclusivamente de lógica de aplicação.

## Decisão
Adotamos RLS do PostgreSQL/Supabase como camada primária de autorização com 194+ políticas ativas cobrindo todas as tabelas com dados sensíveis. Roles são armazenados em tabela separada (`user_roles`) com função `has_role()` SECURITY DEFINER para evitar recursão de RLS.

## Consequências
- ✅ Segurança enforçada no nível do banco de dados
- ✅ Impossível bypassing via API — mesmo queries diretas são filtradas
- ✅ Credenciais sensíveis (channel_connections.credentials) protegidas por role
- ❌ Políticas complexas impactam levemente performance de queries
- ❌ Debugging de permissões requer análise das políticas SQL
