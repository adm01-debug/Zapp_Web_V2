# Graphify — grafo de conhecimento do código

```bash
bun run graph:setup
```

Instala o [graphify](https://pypi.org/project/graphifyy/) (`uv tool install`
ou `pipx install`, o que estiver disponível) e configura o grafo neste clone.
Requer Linux, macOS ou WSL e `uv` ou `pipx` no PATH. Versão fixada em
`GRAPHIFY_VERSION` (env var, default no script).

Depois de instalado, o grafo fica em `graphify-out/` — ver `docs/agentes/mapa-repo.md`
para `graphify query`, `graphify path` e `graphify explain`.
