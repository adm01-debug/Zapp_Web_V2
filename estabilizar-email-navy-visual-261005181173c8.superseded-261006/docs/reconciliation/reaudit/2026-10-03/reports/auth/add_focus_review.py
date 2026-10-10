"""Persist the independent, source-only Diversity focus review. No product execution."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

BASE = Path(__file__).resolve().parents[2]
SRC = BASE / 'source'
OUT = Path(__file__).resolve().parent
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=SRC, text=True).strip() == HEAD
pins = {x['path']: x for x in json.loads((BASE / 'source-integrity.json').read_text())['files']}

def evidence(path, start, end, symbol):
    raw = (SRC / path).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert blob == pins[path]['git_blob_sha']
    assert 1 <= start <= end <= len(raw.decode().splitlines())
    return dict(path=path, start_line=start, end_line=end, blob_sha=blob, symbol=symbol, observation='')

ev = [
    evidence('src/index.css', 1, 8, 'entrada de estilos importa base e override Diversity'),
    evidence('src/pages/ViewRouter.tsx', 70, 80, 'view themes registrada para ThemeCustomizer'),
    evidence('src/pages/lazyViews.ts', 30, 38, 'import lazy do consumidor ativo'),
    evidence('src/components/settings/ThemeCustomizer.tsx', 51, 56, 'botão Salvar padrão sem indicador de foco alternativo local'),
    evidence('src/components/settings/ThemeCustomizer.tsx', 115, 125, 'catálogo clássico liga seleção do card a applyPreset'),
    evidence('src/components/settings/theme/presets.ts', 394, 400, 'identidade do preset Diversity'),
    evidence('src/components/settings/theme/presets.ts', 554, 564, 'Diversity incluído no catálogo de presets'),
    evidence('src/components/settings/theme/useThemePreset.ts', 30, 60, 'seleção atualiza config e efeito aplica preset ao documento'),
    evidence('src/components/settings/theme/presets.ts', 667, 677, 'applyThemePreset estampa data-preset-id no elemento html'),
    evidence('src/styles/diversity-overrides.css', 71, 81, 'seletor substring casa com focus-visible:ring-2 e remove sombras com important'),
    evidence('src/components/ui/button.tsx', 8, 18, 'Button usa outline-none e ring para sinalizar foco; variação padrão não substitui esse indicador'),
    evidence('src/components/ui/button.tsx', 51, 60, 'wrapper aplica classes do Button ao elemento nativo'),
    evidence('src/styles/base.css', 209, 223, 'fallback global remove outline e usa box-shadow sem important'),
    evidence('src/components/settings/theme/PresetCard.tsx', 37, 51, 'cards focalizáveis usam a mesma combinação outline-none/ring-2'),
]
finding = dict(
    id='R2-AUTH-053',
    title='O tema Diversity remove o indicador de foco definido para botões padrão e cards de tema',
    severity='medium', priority='P2', status='CONFIRMED_STATIC', source_head=HEAD, audit_pass='second',
    consumer_flow='ViewRouter themes → ThemeCustomizer → PresetCard Diversity → useThemePreset.applyPreset → applyThemePreset escreve html[data-preset-id="diversity"] → override CSS casa com focus-visible:ring-2 do Button Salvar e dos cards.',
    precondition='O preset Diversity está aplicado; o usuário navega por teclado até um botão padrão habilitado, como Salvar em ThemeCustomizer, ou um PresetCard. O consumidor demonstrado não declara um indicador de foco alternativo que vença o override.',
    failure_and_effect='O seletor [class*="ring-2"] examina a string de classes, portanto também casa com a classe variante focus-visible:ring-2, mesmo sem uma classe ring-2 isolada. Sob Diversity, box-shadow:none!important e as variáveis de ring zeradas vencem tanto o ring do Button quanto o box-shadow de :focus-visible global. Esses consumidores também removem outline. A regra criada para suprimir halos decorativos assim remove o indicador explícito de posição do foco, incluindo o botão Salvar ativo nas configurações. PresetCard apresenta o mesmo mecanismo. A conclusão é a remoção dos indicadores definidos no código nesses consumidores; a capacidade de receber foco e de ativar a ação por teclado não é cancelada por essa regra.',
    evidence=ev, offline_probes=[], feature_claim_ids=[],
    prior_comparison=dict(kind='new_not_in_previous_104', ids=[], assessment='Busca por Diversity, foco/ring e box-shadow nos 104 achados prévios e relatórios atuais não localizou esse mecanismo. AUTH052 trata cancelamento de keydown na tabela de ligações; este achado trata exclusivamente a cascata do indicador visual sob um preset. O root realizou leitura integral de diversity-overrides.css; esta é revisão independente das faixas e da cadeia ativa de consumidores.'),
    acceptance_criteria=[
        'Restringir a supressão de sombras decorativas para preservar :focus-visible, ou definir um indicador explícito de foco que permaneça visível na cascata do preset.',
        'Verificar Tab e Shift+Tab no botão Salvar e nos PresetCards com Diversity em light e dark: o controle focalizado deve ter indicador distinto e a seleção/ativação deve permanecer funcional.',
        'Cobrir o estilo computado do foco no consumidor real e manter controles com outro preset; avaliar separadamente alto contraste e preferências do navegador, sem deduzir conformidade visual apenas das classes.',
    ],
    limitations=[
        'Conclusão estática de seletor, classes e precedência important, sem navegador, captura de tela, DOM executado, medição de contraste ou certificação WCAG.',
        'O seletor depende explicitamente de data-preset-id="diversity"; não se generaliza a perda de foco a outros presets ou a componentes que possuam indicador alternativo efetivo.',
        'O outline-none e o fallback global de box-shadow foram verificados; estilos de usuário, forced-colors do navegador e tecnologia assistiva não foram executados nem certificados.',
        'Não há novo probe: as onze provas offline anteriores permanecem preservadas, sem reexecução ou nova contagem. Nenhuma fonte ou dado de produto foi alterado.',
    ],
)
supp = json.loads((OUT / 'second-pass.json').read_text())
supp['new_findings'] = [f for f in supp['new_findings'] if f['id'] != finding['id']] + [finding]
supp['new_findings'].sort(key=lambda f: f['id'])
for e in ev:
    p = e['path']
    entry = supp['reviewed_files'].setdefault(p, dict(review_level='targeted', symbols=[], ranges=[]))
    if e['symbol'] not in entry['symbols']:
        entry['symbols'].append(e['symbol'])
    r = dict(start_line=e['start_line'], end_line=e['end_line'], symbol=e['symbol'])
    if r not in entry['ranges']:
        entry['ranges'].append(r)
supp['last_extended_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT / 'second-pass.json').write_text(json.dumps(supp, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(id=finding['id'], evidence_spans=len(ev), source_head=HEAD, product_execution=False)))
