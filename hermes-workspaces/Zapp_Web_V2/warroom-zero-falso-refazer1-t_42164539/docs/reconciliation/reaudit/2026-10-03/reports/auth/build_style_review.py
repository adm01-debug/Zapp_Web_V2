"""Persist manual CSS source review; validate fixed source before documenting it."""
from pathlib import Path
import datetime, hashlib, json, subprocess
OUT=Path(__file__).resolve().parent
BASE=OUT.parents[1]
SRC=BASE/'source'
HEAD='da307ba5626dce892f0b37cb6762463f55d14a96'
pins={r['path']:r for r in json.loads((BASE/'source-integrity.json').read_text())['files']}
assert subprocess.check_output(['git','-C',str(SRC),'rev-parse','HEAD'],text=True).strip()==HEAD
notes=[
 dict(path='src/styles/components.css',line_count=499,
      proves=['Leitura integral1–499: cards/hover/press/ranks1–73; conversas, anel mascarado, bubbles e status75–147; gamificação149–158; email HTML160–192; TalkX194–305; catálogo308–471; watermark473–489; chips491–499.',
              'main.tsx importa index.css, que importa este CSS na linha4. Consumidores confirmados por trechos: VirtualizedRealtimeList358–382 aplica conversation-row-selected; EmailChatBubble150–174 aplica wrappers/email-html-body/collapsed; CatalogProductCard364–382 aplica catalog-card e offscreen quando !priority; ChatWatermark1–10 aplica decoração aria-hidden.'],
      mocks_and_fixtures=['Nenhum mock ou runtime: leitura da fonte CSS, buscas de consumidores e leitura limitada dos trechos de ligação. Arquivos auxiliares não são promovidos a integrais por esta leitura.'],
      positive_controls=['Pseudo-elementos decorativos e watermark usam pointer-events:none; conteúdo da conversa fica acima do anel. Emails têm wrap/limite de largura/scroll horizontal e color-scheme light explícito; fundo branco da imagem de produto é decisão comentada.',
                         'Contraprovas de leitura cruzada: animations.css163–197 define propriedade/keyframes do anel e o desliga em reduced-motion; accessibility.css64–70 limita animações/transições globalmente; utilities.css238–247 aplica .chip-active.chip-active com primary-text e maior especificidade. Portanto não foi contado como defeito o token primary-glow isolado da regra base.'],
      limits=['Não há render/browser/build Tailwind, inspeção de estilo computado, medição de contraste, foco, legibilidade, viewport/CLS ou compatibilidade de máscara/content-visibility/revert-layer. Comentários de acessibilidade e performance não são prova de resultado visual.',
              'Não certifica todos os seletores alcançáveis: foram confirmados os consumidores citados, sem classificar outros como mortos. Estilos de cascata/presets podem alterar cores/tamanhos; rail fixo isolado não prova overflow sem layout completo. Nenhum mecanismo novo acionável demonstrado neste recorte.'],
      observations=['Sem novo achado: os52IDs Auth foram preservados. Review_level semantic significa corpo CSS lido, não homologação visual.']),
 dict(path='src/styles/tokens.css',line_count=528,
      proves=['Leitura integral1–528: escalas radius/elevation/paleta/tipografia/ícones/motion/z-index1–102; tokenslight103–373; overridesdark375–528, incluindo foreground/background, status, ranks, chat/sidebar, sombras/charts e máscara de chat.',
              'Fonte ativa pelo import index.css1. components.css consome os tokens hsl/rgb/radius/shadow; exemplo demonstrado da máscara de chat usa URL/tile/rgb/opacity definidos368–372 e dark526–527.'],
      mocks_and_fixtures=['Nenhuma execução: valores declarados lidos; comentário de razões de contraste é evidência documental do autor, não medição repetida nesta auditoria.'],
      positive_controls=['Há pares específicos primary-text/warning-text/destructive-text por tema; padrão de chat ajusta cor/opacidade no dark mantendo mesma máscara; fontes têm cadeia fallback e escala clamp possui limites.',
                         'presets.ts680–704 foi lido como fronteira: aplica CSS vars inline, mas remove cores inline quando high-contrast está ativo. Logo tokens.css sozinho não determina todo estilo final; não foi promovido defeito por comparar paleta isolada com screenshots inexistentes.'],
      limits=['Não certifica contraste WCAG, carregamento das fontes/assets, tema efetivamente aplicado, cobertura de todas as variáveis ou legibilidade de gradientes/ranks. Sem render, testes ou amostras do deployment.',
              'Valores hardcoded de catálogo/dashboard e defaults de root podem ser sobrescritos por preset/override; falta de override .dark isoladamente não prova um bug. Tokens de z-index não provam empilhamento de portais em runtime. Nenhum achado novo com consumidor e falha demonstrados.'],
      observations=['Faixa1..EOF e hashes validam o objeto revisado. Os comentários com medições anteriores não foram tratados como novas medições desta reauditoria.'])
]
files=[]
for item in notes:
 raw=(SRC/item['path']).read_bytes();n=len(raw.decode().splitlines());blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
 assert n==item['line_count'] and blob==pins[item['path']]['git_blob_sha']
 files.append(dict(item,source_head=HEAD,git_blob_sha=blob,source_sha256=hashlib.sha256(raw).hexdigest(),reviewer='auth',review_level='semantic',review_status='SEMANTIC_REVIEW_COMPLETE',reviewed_ranges=[[1,n]],runtime_execution='NOT_EXECUTED',finding_ids=[]))
a=dict(schema_version=1,source_head=HEAD,owner='auth',status='COMPLETE',updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),method='Manual integral CSS source review plus identified consumer/cascade excerpts; no runtime, rendering, visual contrast certification or tests.',allocated_files=2,allocated_lines=1027,actual_lines_read=1027,files=files)
(OUT/'style-review.json').write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
lines=['# Revisão de estilos — Auth','',f'Fonte `{HEAD}`; COMPLETE 2/2 arquivos, 1027/1027 linhas. Leitura de fonte, sem renderização, execução ou certificação visual. Nenhum novo achado originado exclusivamente destes dois arquivos. A revisão adicional das regras de Diversity e de seus consumidores está registrada separadamente em R2-AUTH-053.', '']
for f in files:
 lines += [f'## `{f["path"]}`','',f'Faixa1–{f["line_count"]}; blob`{f["git_blob_sha"]}`; SHA256`{f["source_sha256"]}`.','']
 for k,t in [('proves','Escopo lido e consumidores'),('positive_controls','Controles positivos'),('mocks_and_fixtures','Método'),('limits','Limites'),('observations','Adjudicação')]:lines += [f'**{t}:** '+' '.join(f[k]),'']
(OUT/'style-review.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'status':a['status'],'files':2,'lines':1027,'source_head':HEAD}))
