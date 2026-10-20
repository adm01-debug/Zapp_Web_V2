
## Segurança — Regras para Agentes

- **Nunca imprimir** conteúdo de `.git-credentials`, tokens, secrets ou variáveis de ambiente sensíveis no output de ferramentas ou commits.
- **Nunca commitar** `.env.local`, `.git-credentials`, chaves de API ou service_role keys.
- PATs expostos em transcritos de chat devem ser rotacionados imediatamente via GitHub Settings → Developer Settings → Personal access tokens.
- Secrets de edge functions são gerenciados exclusivamente via `supabase secrets set` ou Supabase Dashboard — nunca em texto nos arquivos de migration.

## graphify

O projeto tem um grafo de conhecimento do código em `graphify-out/` (gerado localmente por `bun run graph:setup`; ver seção "graphify" do `CLAUDE.md`).

- Para perguntas sobre o código, quando `graphify-out/graph.json` existir, rode primeiro `graphify query "<pergunta>"`. Use `graphify path "<A>" "<B>"` para relações e `graphify explain "<conceito>"` para um conceito específico.
- Leia `graphify-out/GRAPH_REPORT.md` só para revisão ampla de arquitetura ou quando query/path/explain não bastarem.
- Depois de alterar código, rode `graphify update .` (só AST, sem custo de API).
