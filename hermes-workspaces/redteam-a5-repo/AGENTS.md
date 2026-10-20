
## Segurança — Regras para Agentes

- **Nunca imprimir** conteúdo de `.git-credentials`, tokens, secrets ou variáveis de ambiente sensíveis no output de ferramentas ou commits.
- **Nunca commitar** `.env.local`, `.git-credentials`, chaves de API ou service_role keys.
- PATs expostos em transcritos de chat devem ser rotacionados imediatamente via GitHub Settings → Developer Settings → Personal access tokens.
- Secrets de edge functions são gerenciados exclusivamente via `supabase secrets set` ou Supabase Dashboard — nunca em texto nos arquivos de migration.
