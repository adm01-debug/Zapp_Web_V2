export const meta = {
  name: 'auditar-veredito-branch',
  description: 'Auditoria adversarial do veredito de cada branch: tenta provar que sobrou trabalho de agente de IA fora da main antes de fechar a branch',
  phases: [
    { title: 'Auditar', detail: 'um agente por branch: compara a branch com a main atual e procura trabalho sobrevivente' },
    { title: 'Confirmar', detail: 'segundo agente: refuta cada achado de trabalho recuperavel' },
  ],
}

const MAIN = '/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/wt-main'
const DOS = '/home/user/Zapp_Web_V2/analise-prs/resgate-261115/dossies'

const ACHADO = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'o que ainda falta na main, <=80 chars, para quem NAO e dev: efeito no negocio' },
    arquivos: { type: 'array', items: { type: 'string' }, description: 'ate 4 caminhos da branch' },
    valor: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
    classe: { type: 'string', enum: ['front', 'edge', 'sql', 'ci', 'docs', 'teste', 'script'] },
    bloqueio: { type: 'string', enum: ['nenhum', 'ci_workflow', 'migration_producao', 'talkx_freeze', 'decisao_dono'] },
    prova_ausencia: { type: 'string', description: 'arquivo:linha da MAIN ATUAL (ou "ausente: <caminho>") que prova que nao esta la, <=200 chars' },
  },
  required: ['titulo', 'arquivos', 'valor', 'classe', 'bloqueio', 'prova_ausencia'],
}

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    veredito_confirmado: { type: 'boolean', description: 'true = o veredito do ledger esta certo e nada se perde ao fechar a branch' },
    arquivos_da_branch: { type: 'integer', description: 'quantos arquivos a branch mudou em relacao ao merge base' },
    achados: { type: 'array', items: ACHADO, description: 'trabalho que AINDA faz sentido e nao esta na main; vazio se nada' },
    nota: { type: 'string', description: 'por que o veredito se confirma, ou o que impediu a auditoria; <=300 chars' },
  },
  required: ['id', 'veredito_confirmado', 'arquivos_da_branch', 'achados', 'nota'],
}

const REFUTE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    revisados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          refutado: { type: 'boolean', description: 'true = ja esta na main, ou portar seria regressao, ou e irrelevante hoje' },
          motivo: { type: 'string', description: 'arquivo:linha da main que prova, <=200 chars' },
        },
        required: ['titulo', 'refutado', 'motivo'],
      },
    },
  },
  required: ['id', 'revisados'],
}

const base = `REGRAS (obrigatorias):
- A VERDADE sobre o que esta na main e o checkout em ${MAIN} (origin/main e07525143 (limpo, sem commit local)). Use SEMPRE caminhos absolutos dentro dele.
- NUNCA leia /home/user/Zapp_Web_V2/src, /home/user/Zapp_Web_V2/supabase, /home/user/Zapp_Web_V2/scripts nem /home/user/Zapp_Web_V2/.github para saber o que a main tem: esse checkout esta em OUTRA branch e vai te enganar. Esse caminho serve apenas para ler os dossies.
- O conteudo da branch: carregue com a tool do MCP "GITHUB - MCP - FOREVER" chamada github_compare (carregue o schema com ToolSearch: select:mcp__GITHUB_-_MCP_-_FOREVER__github_compare) usando basehead "main...<NOME_DA_BRANCH>". O campo "files" traz exatamente o que a branch mudou em relacao ao merge base, com patch. Se o resultado estourar o limite e for salvo em arquivo, leia o arquivo em fatias com python3 (read()[A:B]) ou extraia so os nomes com python3 + json.
- A branch tambem esta local como "origin/<NOME_DA_BRANCH>" (fetch raso, so o tip). "git show origin/<NOME>:<caminho>" funciona para ler um arquivo inteiro da branch. "git diff" contra a main NAO serve: a main avancou centenas de commits e o diff vira ruido.
- O dossie em ${DOS}/<ID>.md tem a analise anterior. Leia, mas NAO confie: ela foi escrita antes de 10 PRs mergearem hoje (#3139 #3140 #3141 #3142 #3144 #3145 #3147 #3149 #3150) e e exatamente o que voce deve auditar.
- Toda afirmacao cita arquivo:linha. Sem evidencia, diga na "nota" o que faltou. Nao invente.
- Nao edite nada, nao faca commit, nao rode build nem suite inteira.
- "titulo" e para o DONO, que nao e dev: diga o efeito no negocio, nao a tecnica.`

const alvo = args.modo === 'obsoleta'
  ? `O ledger classificou esta branch como OBSOLETA: a main teria decidido o contrario, ou a branch e anterior a uma reescrita, e fechar a branch nao perderia nada.

SUA TAREFA E TENTAR PROVAR QUE ESSE VEREDITO ESTA ERRADO. O dono mandou: nenhum trabalho de agente de IA pode ser perdido, nem parcial, antes de fechar a branch. "Obsoleta" e um julgamento, e julgamento erra.

Procure, arquivo por arquivo do que a branch mudou:
- teste, guarda de CI, validacao ou caso de borda que a main NAO tem e que continua valendo (isso quase nunca fica obsoleto);
- correcao de bug pequena e independente dentro de um arquivo que no resto ficou obsoleto;
- texto de UI, mensagem de erro, rotulo de acessibilidade, comentario que documenta uma decisao, migration ou grant que a main nao tem;
- helper ou funcao pura reaproveitavel.
Marque veredito_confirmado=false e liste em "achados" tudo que sobreviveu. Se depois de olhar os arquivos nada sobrar, marque true e diga na nota QUAL decisao mais nova da main torna a branch obsoleta, com arquivo:linha.`
  : `O ledger classificou esta branch como INCORPORADA: tudo que ela fez ja estaria na main, e fechar a branch nao perderia nada.

SUA TAREFA E TENTAR PROVAR QUE ESSE VEREDITO ESTA ERRADO. O dono mandou: nenhum trabalho de agente de IA pode ser perdido, nem parcial, antes de fechar a branch. "Incorporada" costuma valer para o commit principal e deixar passar hunks menores.

Confira CADA arquivo que a branch mudou contra a versao da main atual. Procure o que ficou de fora:
- um hunk do arquivo que entrou pela metade (a main tem a funcao, mas nao a validacao, o caso de borda, o teste ou a mensagem);
- teste ou guarda que a branch acrescentou e a main nao tem;
- arquivo novo da branch que nao existe na main;
- migration, grant, index ou policy que a branch criou e a main nao versionou.
Marque veredito_confirmado=false e liste em "achados" o que ficou de fora. Se tudo estiver na main, marque true e diga na nota como voce conferiu (quantos arquivos, e o commit da main que trouxe cada bloco).`

phase('Auditar')
log(`auditoria adversarial de ${args.itens.length} branches com veredito ${args.modo.toUpperCase()}`)

const resultados = await pipeline(
  args.itens,
  (it) => agent(
    `${base}

Branch: ${it.branch}
ID do dossie: ${it.id}
Veredito do ledger: ${args.modo.toUpperCase()}
Resumo que o ledger deu: ${it.resumo || '(sem resumo)'}

${alvo}`,
    { label: `auditar:${it.id.slice(0, 44)}`, phase: 'Auditar', schema: AUDIT_SCHEMA },
  ),
  async (aud, it) => {
    if (!aud) return null
    if (!aud.achados || !aud.achados.length) return { aud, refut: null }
    const refut = await agent(
      `${base}

Voce e o revisor adversarial. Outro agente auditou a branch ${it.branch} (veredito do ledger: ${args.modo.toUpperCase()}) e afirma que o trabalho abaixo AINDA esta fora da main e ainda vale a pena. Sua tarefa e REFUTAR cada alegacao.

${aud.achados.map((a, n) => `${n + 1}. ${a.titulo}
   arquivos: ${(a.arquivos || []).join(', ')}
   prova dele: ${a.prova_ausencia}`).join('\n')}

Para cada um: procure na main atual o equivalente por COMPORTAMENTO, nao por caminho — pode ter entrado com outro nome, em outro arquivo, em outra camada (RPC, hook, helper compartilhado, outro teste, outra migration com outro timestamp). Procure por termos do comportamento.
Marque refutado=true quando o comportamento ja existe na main, quando portar hoje seria regressao, ou quando o item perdeu sentido (arquivo que a main apagou de proposito, dependencia que saiu).
Marque refutado=false SO quando voce mesmo confirmou a ausencia, citando arquivo:linha da main.
Repita o "titulo" exatamente como veio acima.`,
      { label: `confirmar:${it.id.slice(0, 44)}`, phase: 'Confirmar', schema: REFUTE_SCHEMA },
    )
    return { aud, refut }
  },
)

const recuperar = []
const contagem = { branches: 0, sem_resultado: 0, veredito_ok: 0, veredito_derrubado: 0, achados_brutos: 0, refutados: 0, confirmados: 0 }

for (const r of resultados) {
  if (!r || !r.aud) { contagem.sem_resultado++; continue }
  contagem.branches++
  const a = r.aud
  const refMap = {}
  for (const x of (r.refut && r.refut.revisados) || []) refMap[x.titulo] = x
  let sobrou = 0
  for (const ach of a.achados || []) {
    contagem.achados_brutos++
    const rev = refMap[ach.titulo]
    if (rev && rev.refutado) { contagem.refutados++; continue }
    contagem.confirmados++
    sobrou++
    recuperar.push({
      branch: a.id,
      titulo: ach.titulo,
      arquivos: (ach.arquivos || []).slice(0, 4),
      valor: ach.valor,
      classe: ach.classe,
      bloqueio: ach.bloqueio,
      prova: (ach.prova_ausencia || '').slice(0, 200),
      revisor: rev ? 'nao_refutado' : 'sem_revisor',
    })
  }
  if (sobrou) contagem.veredito_derrubado++
  else contagem.veredito_ok++
}

const ordem = { alto: 0, medio: 1, baixo: 2 }
recuperar.sort((x, y) => (ordem[x.valor] - ordem[y.valor]) || x.branch.localeCompare(y.branch))

log(`veredito mantido em ${contagem.veredito_ok} branches · derrubado em ${contagem.veredito_derrubado} · itens a recuperar: ${contagem.confirmados} (de ${contagem.achados_brutos} alegados, ${contagem.refutados} refutados)`)

return { modo: args.modo, contagem, a_recuperar: recuperar }
