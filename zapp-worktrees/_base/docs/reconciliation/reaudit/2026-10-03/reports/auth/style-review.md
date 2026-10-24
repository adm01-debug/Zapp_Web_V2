# Revisão de estilos — Auth

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`; COMPLETE 2/2 arquivos, 1027/1027 linhas. Leitura de fonte, sem renderização, execução ou certificação visual. Nenhum novo achado originado exclusivamente destes dois arquivos. A revisão adicional das regras de Diversity e de seus consumidores está registrada separadamente em R2-AUTH-053.

## `src/styles/components.css`

Faixa1–499; blob`bdd77fc2fb4a1dc75a777721dd775b2b17f5719a`; SHA256`294a52855b7098363f2c005c60aabbbba9604ba1ce1a0464daf2913f8d475b06`.

**Escopo lido e consumidores:** Leitura integral1–499: cards/hover/press/ranks1–73; conversas, anel mascarado, bubbles e status75–147; gamificação149–158; email HTML160–192; TalkX194–305; catálogo308–471; watermark473–489; chips491–499. main.tsx importa index.css, que importa este CSS na linha4. Consumidores confirmados por trechos: VirtualizedRealtimeList358–382 aplica conversation-row-selected; EmailChatBubble150–174 aplica wrappers/email-html-body/collapsed; CatalogProductCard364–382 aplica catalog-card e offscreen quando !priority; ChatWatermark1–10 aplica decoração aria-hidden.

**Controles positivos:** Pseudo-elementos decorativos e watermark usam pointer-events:none; conteúdo da conversa fica acima do anel. Emails têm wrap/limite de largura/scroll horizontal e color-scheme light explícito; fundo branco da imagem de produto é decisão comentada. Contraprovas de leitura cruzada: animations.css163–197 define propriedade/keyframes do anel e o desliga em reduced-motion; accessibility.css64–70 limita animações/transições globalmente; utilities.css238–247 aplica .chip-active.chip-active com primary-text e maior especificidade. Portanto não foi contado como defeito o token primary-glow isolado da regra base.

**Método:** Nenhum mock ou runtime: leitura da fonte CSS, buscas de consumidores e leitura limitada dos trechos de ligação. Arquivos auxiliares não são promovidos a integrais por esta leitura.

**Limites:** Não há render/browser/build Tailwind, inspeção de estilo computado, medição de contraste, foco, legibilidade, viewport/CLS ou compatibilidade de máscara/content-visibility/revert-layer. Comentários de acessibilidade e performance não são prova de resultado visual. Não certifica todos os seletores alcançáveis: foram confirmados os consumidores citados, sem classificar outros como mortos. Estilos de cascata/presets podem alterar cores/tamanhos; rail fixo isolado não prova overflow sem layout completo. Nenhum mecanismo novo acionável demonstrado neste recorte.

**Adjudicação:** Sem novo achado: os52IDs Auth foram preservados. Review_level semantic significa corpo CSS lido, não homologação visual.

## `src/styles/tokens.css`

Faixa1–528; blob`345e0bfee1040d95712ce441bcc03fa98496d781`; SHA256`ca19bfc1a5fd31d443e2763da0304e73bc25027cd894add5d0a32d015f805a28`.

**Escopo lido e consumidores:** Leitura integral1–528: escalas radius/elevation/paleta/tipografia/ícones/motion/z-index1–102; tokenslight103–373; overridesdark375–528, incluindo foreground/background, status, ranks, chat/sidebar, sombras/charts e máscara de chat. Fonte ativa pelo import index.css1. components.css consome os tokens hsl/rgb/radius/shadow; exemplo demonstrado da máscara de chat usa URL/tile/rgb/opacity definidos368–372 e dark526–527.

**Controles positivos:** Há pares específicos primary-text/warning-text/destructive-text por tema; padrão de chat ajusta cor/opacidade no dark mantendo mesma máscara; fontes têm cadeia fallback e escala clamp possui limites. presets.ts680–704 foi lido como fronteira: aplica CSS vars inline, mas remove cores inline quando high-contrast está ativo. Logo tokens.css sozinho não determina todo estilo final; não foi promovido defeito por comparar paleta isolada com screenshots inexistentes.

**Método:** Nenhuma execução: valores declarados lidos; comentário de razões de contraste é evidência documental do autor, não medição repetida nesta auditoria.

**Limites:** Não certifica contraste WCAG, carregamento das fontes/assets, tema efetivamente aplicado, cobertura de todas as variáveis ou legibilidade de gradientes/ranks. Sem render, testes ou amostras do deployment. Valores hardcoded de catálogo/dashboard e defaults de root podem ser sobrescritos por preset/override; falta de override .dark isoladamente não prova um bug. Tokens de z-index não provam empilhamento de portais em runtime. Nenhum achado novo com consumidor e falha demonstrados.

**Adjudicação:** Faixa1..EOF e hashes validam o objeto revisado. Os comentários com medições anteriores não foram tratados como novas medições desta reauditoria.

