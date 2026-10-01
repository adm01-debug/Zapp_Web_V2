-- ai_block03_pr1_zero_default_only_projection
-- versão 20260930510000 reservada para hermes-ia-bloco-03-pr1-mascaras-acl-26100108352104 em 2026-10-01T08:35:40-03:00 (hermes-db-migrar --nova)
-- Classe: aditiva (sem DDL; UPDATE com WHERE). Sensivel: altera dado de ~3.106 linhas — janela de baixo uso.
-- rollback: restaurar da antes-imagem (arquivo CSV anexado ao PR) com o trigger LIGADO, apenas ai_sentiment e
--           ai_priority (updated_at NAO e restaurado — custo aceito e autorizado).
--           PROIBIDO desligar trigger em producao.

-- ═══════════════════════════════════════════════════════════════════════════════
-- migration B (RECOMENDADA) — remocao da mascara de ausencia na PROJECAO de contato
--
-- Classe pelo classificador do hermes-db-migrar: ADITIVA (nao ha DDL: nenhum
-- ALTER TABLE, nenhum indice, nenhuma constraint, nenhum DEFAULT, nenhum GRANT).
-- Tratada como SENSIVEL em revisao porque altera dado de 3.106 linhas e e
-- irreversivel sem a antes-imagem.
--
-- ── PROBLEMA ─────────────────────────────────────────────────────────────────
-- A migration de contrato 20260930150000 parou de INVENTAR valor (defaults
-- set default null), mas o que o DEFAULT LEGADO ja havia gravado continuou no
-- banco: em 30/09/2026 os 3.106 contatos de producao tem ai_sentiment='neutro'
-- e ai_priority='medium' sem NUNCA ter havido analise por tras
-- (ai_projection_analysis_id IS NULL em todos; conversation_analyses vazia).
-- O backfill de 150000 traduziu 'neutral'->'neutro' e 'normal'->'medium' e
-- assim deu APARENCIA canonica a ausencia.
--
-- Medido no canonico tnnnlkbymytvtqngbbqh (somente leitura) antes de escrever:
--   total=3106  sem_analise=3106  com_analise=0
--   ai_sentiment='neutro'=3106   ai_sentiment NULL=0   ai_sentiment outro=0
--   ai_priority='medium'=3106    ai_priority  NULL=0   ai_priority  outro=0
--   ai_projection_updated_at IS NULL=3106
--
-- ── PREDICADO: 4 guardas ─────────────────────────────────────────────────────
-- A guarda (1) e a autorizada pelo dono. As guardas (2)(3)(4) existem porque
-- `ai_projection_analysis_id IS NULL` NAO e sinonimo de "sem analise por tras"
-- no codigo atual — os dois caminhos abaixo sao reais e reproduzidos na
-- simulacao (casos C4/C4b e C6/C6b):
--
--   (2) ai_projection_updated_at IS NULL
--       A FK contacts_ai_projection_analysis_id_fkey e `on delete set null`
--       (20260930110000). Apagar a linha de conversation_analyses zera
--       ai_projection_analysis_id e DEIXA ai_projection_updated_at e o valor
--       REAL na coluna. Sem esta guarda, apagar uma analise converteria dado
--       real em "default-only" e a migration o zeraria.
--
--   (3)(4) ai_sentiment IS NOT DISTINCT FROM 'neutro' e
--          ai_priority  IS NOT DISTINCT FROM 'medium'
--       `ai-auto-tag` (index.ts, secao "Vocabulario CANONICO") e `chatbot-l1`
--       (index.ts, "Update contact AI metadata") gravam ai_sentiment/ai_priority
--       DIRETO em contacts com update simples, valor canonico, SEM criar analise
--       e SEM tocar em ai_projection_analysis_id. Um 'negativo'/'high' sem
--       analise e valor REAL de produtor vivo, nao mascara: zera-lo apagaria o
--       unico sinal existente. Somente o token que o DEFAULT legado produziria
--       ('neutral'->'neutro', 'normal'->'medium') e considerado mascara.
--
-- ESCOPO POR LINHA, NAO POR COLUNA: o UPDATE exige AS DUAS colunas iguais ao
-- default. Uma linha como ('neutro','high') NAO e tocada, porque nao ha como
-- saber se o 'neutro' veio do default ou de uma analise — e' o lado seguro.
-- (Variante por coluna medida na simulacao; ver relatorio.)
--
-- ── IMPACTO E JANELA ─────────────────────────────────────────────────────────
-- Um unico UPDATE com WHERE, sem DDL: RowExclusiveLock na tabela (compativel
-- com leitura e com outros escritores) + lock de linha nos 3.106; NENHUM
-- AccessExclusiveLock, NENHUM rewrite de tabela, NENHUM indice recriado.
-- lock_timeout curto faz a migration FALHAR RAPIDO em vez de ficar enfileirada
-- atras de uma transacao longa que segure linha do conjunto.
--
-- EFEITO COLATERAL CONHECIDO (nao e opcional, vem do trigger): o trigger
-- update_contacts_updated_at (BEFORE UPDATE FOR EACH ROW -> new.updated_at=now())
-- reescreve updated_at das 3.106 linhas. Isso e' irreversivel por UPDATE simples
-- no rollback e distorce a idade usada pelo ChurnPredictionDashboard. Ver
-- Achados do relatorio.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';

update public.contacts
   set ai_sentiment = null,
       ai_priority  = null
 where ai_projection_analysis_id is null
   and ai_projection_updated_at is null
   and ai_sentiment is not distinct from 'neutro'
   and ai_priority  is not distinct from 'medium';

commit;
