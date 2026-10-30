import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Contrato de fuso horário do Talk X:
 *
 * Toda avaliação de janela de envio DEVE usar deliveryWindowStatus de
 * _shared/talkx-window.ts — jamais calcular hora local na edge function.
 *
 * Motivação (auditoria 2026-09-16): talkx-send calculava hora de Brasília
 * com nowBR/hmBR, um Intl.DateTimeFormat hardcodado; ao adicionar fusos
 * configuráveis por campanha (schedule_timezone), a lógica duplicada teria
 * que ser replicada em dois lugares. A extração para _shared/ eliminou o
 * problema na raiz.
 */

const sender = readFileSync(
  "supabase/functions/talkx-send/index.ts",
  "utf8",
);
const windowShared = readFileSync(
  "supabase/functions/_shared/talkx-window.ts",
  "utf8",
);
const scheduler = readFileSync(
  "supabase/functions/talkx-scheduler/index.ts",
  "utf8",
);
const resumePolicy = readFileSync(
  "supabase/functions/_shared/talkx-resume-policy.ts",
  "utf8",
);

test('Talk X evaluates the delivery window in the campaign timezone and fails closed on invalid timezone', () => {
  // deliveryWindowStatus foi extraida para _shared/talkx-window.ts (auditoria
  // 2026-09-16) para que talkx-scheduler reuse a MESMA logica em vez de
  // reimplementar; talkx-send agora importa em vez de definir localmente.
  // [^}]* permite imports extras (ex.: parseDndHours, type DndSetting do N-118)
  assert.match(sender, /import \{ DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus, parseBusinessHours[^}]* \} from "\.\.\/\_shared\/talkx-window\.ts"/);
  assert.match(windowShared, /function deliveryWindowStatus/);
  assert.match(windowShared, /invalid_schedule_timezone/);
  assert.doesNotMatch(sender, /nowBR|hmBR|horário de Brasília/);
  assert.doesNotMatch(sender, /Intl\.DateTimeFormat/);
});

test('Talk X send window evaluates pauses in the configured timezone', () => {
  // schedule_timezone DEVE estar no SELECT da query principal do talkx-send;
  // sem ele a janela usa sempre America/Sao_Paulo mesmo para campanhas com
  // fuso configurado diferente.
  assert.match(sender, /schedule_timezone/);
});

test('Talk X wizard preserves the selected timezone through payload and review', () => {
  const wizard = readFileSync(
    "src/components/talkx/CampaignWizard/CampaignWizardForm.tsx",
    "utf8",
  );
  // O formulário deve persistir schedule_timezone no payload de criação
  // e exibir o fuso escolhido na tela de revisão.
  assert.match(wizard, /schedule_timezone/);
});

test('Talk X scheduler resume reuses deliveryWindowStatus (fails closed, respects schedule_timezone)', () => {
  // A política de retomada automática (selectResumableCampaigns) NÃO pode
  // reimplementar a janela de envio: ela DEVE chamar deliveryWindowStatus
  // de _shared/talkx-window.ts para que schedule_timezone seja respeitado.
  //
  // O scheduler também NÃO pode acessar connectionStatusById.get() diretamente:
  // a fiação "id da campanha → status da conexão" ficava inline, e trocar
  // null por "connected" no caso "sem whatsapp_connection_id" como se fosse
  // "conexão ok" sobrevivia às DUAS camadas de teste anteriores. A auditoria
  // de 2026-09-29 achou a lacuna; connectionStatusResolver encapsula isso e
  // tem teste dedicado na política — cada futuro refator tem que quebrar o
  // teste para ENTÃO alterar a fiação, não o contrário.
  //
  // A guarda aqui é intencional: se o scheduler precisar de outra função de
  // _shared/ ela precisa aparecer explicitamente no import que está em _shared/
  // (não inline no scheduler), e o import do scheduler precisa incluí-la.
  // Só assim a dependência fica visível e auditável.
  //
  // A segunda guarda (resumePolicy importa de _shared/talkx-window.ts)
  // fecha o ciclo: o scheduler delega para selectResumableCampaigns, que por
  // sua vez delega para deliveryWindowStatus — e a cadeia inteira está em
  // _shared/, sem lógica duplicada em nenhum dos dois lados.
  //
  // Motivação para connectionStatusResolver morar EM _shared/ e não inline
  // no scheduler: uma lacuna que aceitava null como "connected" sobrevivia às
  // DUAS camadas de teste anteriores porque a fiação morava dentro do scheduler
  // e nenhum teste a alcançava. O test abaixo fecha essa lacuna: qualquer
  // refactor que queira trocar null tem que quebrar ESTE test antes de agir,
  // dando visibilidade ao risco.
  //
  // Dica de diagnóstico: se esse test quebrar por causa de um import
  // "from \"../..\"" em vez de "from \"../\"" no scheduler, verifique se o
  // scheduler está importando de _shared/ (correto) e não de um nível acima
  // (incorreto — _shared/ É o local canônico de helpers compartilhados);
  // se quebrar por causa da linha abaixo do resumePolicy (./talkx-window.ts),
  // verifique o caminho relativo dentro de _shared/ (ambos os arquivos estão
  // no mesmo diretório — o ./ é correto, ../ seria incorreto).
  assert.match(scheduler, /import \{ AUTO_RESUME_REASONS, connectionStatusResolver, selectResumableCampaigns \} from "\.\.\/\_shared\/talkx-resume-policy\.ts"/);
  assert.match(scheduler, /schedule_timezone, send_window_start/);
  assert.match(scheduler, /selectResumableCampaigns\(/);
  // V03.2: a fiação do status da conexão NÃO pode voltar a morar inline no
  // scheduler — o test acima fecha essa lacuna na camada da política; este
  // fecha na camada do scheduler. Se connectionStatusResolver voltar a ser
  // inline, o test quebra antes de qualquer deploy.
  assert.doesNotMatch(scheduler, /connectionStatusById\.get\(/);
  assert.match(resumePolicy, /export function connectionStatusResolver\(/);
  assert.match(resumePolicy, /if \(typeof connectionId !== "string"\) return null;/);
  assert.match(resumePolicy, /import \{ deliveryWindowStatus, type ScheduleGuardCampaign \} from "\.\/talkx-window\.ts"/);
  assert.match(resumePolicy, /deliveryWindowStatus\(campaign, now\)\.allowed/);
  assert.doesNotMatch(resumePolicy, /nowBR|hmBR|isWithinSendWindow|Intl\.DateTimeFormat/);
});
