-- ai_block03_pr2_zero_default_only_projection
-- versão 20260930540000 reservada para hermes-ia-bloco-03-pr2-zero-default-only-2610010946e3a2 em 2026-10-01T09:46:29-03:00 (hermes-db-migrar --nova)
-- Classe: aditiva (sem DDL; UPDATE com WHERE). SENSIVEL: altera dado de ~3.106 linhas.
-- rollback: restaurar da antes-imagem (CSV gerado imediatamente antes do apply, com sha256 e
--           contagem de linhas registrados no relatorio/PR) com o trigger LIGADO, apenas as
--           colunas ai_sentiment e ai_priority. updated_at NAO e restaurado (custo aceito e
--           autorizado pelo dono). PROIBIDO desligar trigger em producao.
-- Janela: aplicar em baixo uso (antes das 8h ou depois das 19h) — decisao do dono, card
--         20260930-193937-f9f4. O PR-1 (merge 4079cd0b) ja aplicou C e A; esta e a B, que ficou
--         fora do PR-1 justamente porque a classe aditiva aplica na hora, sem modo "registrar sem aplicar".

-- ── PROBLEMA ─────────────────────────────────────────────────────────────────
-- Os defaults legados de conversation_analyses ('neutro'/'media') foram copiados para
-- contacts.ai_sentiment/ai_priority em algum ponto do fluxo antigo: 3.106 contatos carregam
-- "sentimento neutro" e "prioridade media" que ninguem afirmou — e esse valor vira leitura de
-- analise no dashboard, no copiloto de voz e no payload enviado ao CRM externo.
-- A migration A (PR-1) removeu os defaults; esta B limpa o que eles ja gravaram.

-- ── PREDICADO ESTREITO (4 guardas) ───────────────────────────────────────────
-- So apaga quando NAO ha analise por tras (ai_projection_analysis_id IS NULL e
-- ai_projection_updated_at IS NULL) E o valor e exatamente o par do default legado.
-- Diferenca para o predicado literal (ai_sentiment='neutro' and ai_priority='medium'):
-- o literal destruiria valor real gravado por ai-auto-tag/chatbot-l1 (contato sem analise
-- por tras) e valor orfao de analise apagada (FK on delete set null). Na foto atual os dois
-- predicados selecionam praticamente o mesmo conjunto; a variante estreita e a que nao vira
-- bomba-relogio quando a analise voltar a rodar em cima dos contatos legados.

-- ── IMPACTO ──────────────────────────────────────────────────────────────────
-- Um unico UPDATE com WHERE: RowExclusiveLock (compativel com leitura e com outros
-- escritores) + lock de linha nos alvos; nenhum AccessExclusiveLock, nenhum rewrite de
-- tabela, nenhum indice recriado. O lock_timeout curto faz a migration FALHAR RAPIDO em vez
-- de ficar enfileirada atras de transacao longa que segure linha do conjunto.
-- EFEITO COLATERAL CONHECIDO (vem do trigger update_contacts_updated_at, BEFORE UPDATE):
-- reescreve updated_at das linhas afetadas. Irreversivel por UPDATE simples no rollback e
-- distorce a idade usada pelo ChurnPredictionDashboard. Custo aceito e autorizado pelo dono.

set local lock_timeout = '5s';

update public.contacts
   set ai_sentiment = null,
       ai_priority  = null
 where ai_projection_analysis_id is null
   and ai_projection_updated_at is null
   and ai_sentiment is not distinct from 'neutro'
   and ai_priority  is not distinct from 'medium';

-- ── POS-CONDICOES (conferir logo apos aplicar) ───────────────────────────────
-- select count(*) from public.contacts where ai_sentiment = 'neutro';
--   -> deve ficar 0 (qualquer 'neutro' restante seria leitura real de analise, nao default)
-- select count(*) from public.contacts where ai_sentiment is null and deleted_at is null;
--   -> deve subir em ~3.106
-- Idempotente: rodar de novo nao acha mais nada (ai_sentiment is not distinct from 'neutro'
-- deixa de casar nas linhas zeradas).
