#!/usr/bin/env python3
"""
Supabase -> GitHub snapshot (v2).

Introspecta um projeto Supabase e gera arquivos Markdown para cada objeto
Supabase (tabelas, funcoes, politicas, triggers, etc.).

Environment variables:
  SUPABASE_URL                  https://<xxxxx>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY     service_role JWT
  GITHUB_TOKEN                  PAT com permissao de escrita no repo
  GITHUB_REPO                   owner/repo
  GITHUB_REF                    branch alvo (padrao: \"contexto\")
  OUTPUT_DIR                    diretorio de saida local (padrao: \"docs/contexto/supabase\")
  SUPABASE_SNAPSHOT_PUBLICACAO  (padrao \"Gerado automaticamente...\") rodape do indice
"""
