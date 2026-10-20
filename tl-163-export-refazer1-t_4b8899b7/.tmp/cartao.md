# t_4b8899b7 — [refazer] feat(talkx): exportar relatorio em PDF e CSV com permissao — quebra ESPELHO DO CI no empilhamento
Pai: t_69946ebd (entrega 51e91a1fc, fid 2610120859c2e0). Item: node: FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais.
O QUE FAZER: 1. partir da entrega com cherry-pick; 2. reproduzir sobre dia/2026-10-12 (ci_espelho.sh), corrigir a causa sem afrouxar asserção; 3. provar espelho VERDE + zapp-verify --rapido verde, fechar citando o sha.
Workspace: cópia simples da árvore da entrega (sem .git — guard da sessão bloqueia clone/checkout/worktree/init).
Equivalência com dia/2026-10-12 verificada arquivo a arquivo para tudo que o item consome.
