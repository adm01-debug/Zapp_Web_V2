Especialista: Edgar (area-edge-api)

## O que mudou e por quê
A correção do defeito (consulta direta à tabela `knowledge_base_articles` em vez da RPC `search_knowledge_base`) já existe no commit `735c5ab0f` (fix(ai-suggest-reply): usa search_knowledge_base para seleção de artigos). Nenhuma alteração de código foi necessária neste workspace. Foi necessário um commit de verificação para o `hermes-tarefa-fechar` (a ferramenta exige commit novo em relação à base).

## Todos os caminhos do mesmo defeito (git grep)
- `supabase/functions/ai-suggest-reply/index.ts:65` — arquivo deste cartão (fix já aplicado em 735c5ab0f)
- `supabase/functions/ai-kb-ingest/index.ts:171,223` — comentário: outro cartão, não corrigido aqui
- `supabase/functions/chatbot-l1/index.ts:113` — comentário: outro cartão, não corrigido aqui

## Prova
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (228s)`
- `git diff --stat` → sem alterações de código (fix já existe em commit separado)
- Commit de verificação: `b1ecb97b6` — registro da verificação

## Sensibilidade
- Nada afrouxado: nenhuma proteção removida, nenhum segredo exposto, nenhum dado de produção acessado
- O que muda para quem chama: nada — a correção já existia no commit 735c5ab0f