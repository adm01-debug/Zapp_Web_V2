// Edge: searchbox-budget-alert (E91)
// Canal 2 do alerta de custo do autocomplete de endereco: e-mail para o responsavel.
// Chamada 1x/dia pelo cron pg_cron `searchbox-budget-alert` (net.http_post), nunca pelo app.
// O canal 1 (notificacao no app) e feito em SQL pela funcao notify_searchbox_budget().
//
// Autorizacao: helper canonico _shared/cron-secret-auth.ts (x-cron-secret contra o env CRON_SECRET
// desta funcao; o valor correspondente vive no Vault como searchbox_alert_cron_secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, requireEnv } from "../_shared/validation.ts";
import { unauthorizedResponse } from "../_shared/cron-secret-auth.ts";

const DESTINATARIO = "adm01@promobrindes.com.br";
const LIMITE = 400;   // das 500 gratis; o guarda do client degrada em 450

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const secret = req.headers.get("x-cron-secret");
  const esperado = Deno.env.get("CRON_SECRET");
  if (!secret || !esperado || secret !== esperado) {
    // Falha FECHADA: sem segredo configurado, nao envia nada.
    return unauthorizedResponse({ "Content-Type": "application/json" });
  }

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data, error } = await supabase
    .from("searchbox_usage_daily")
    .select("sessoes")
    .gte("dia", new Date(new Date().toISOString().slice(0, 7) + "-01").toISOString().slice(0, 10));

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500 });
  }

  const sessoes = (data ?? []).reduce((soma, linha) => soma + (linha.sessoes ?? 0), 0);
  if (sessoes < LIMITE) {
    return new Response(JSON.stringify({ ok: true, enviado: false, sessoes, motivo: "abaixo do limite" }), { status: 200 });
  }

  const resendKey = requireEnv("RESEND_API_KEY");
  const corpo = [
    "<p>O autocomplete de endereco atingiu <strong>" + sessoes + "</strong> usos neste mes.</p>",
    "<p>O teto gratuito da Mapbox e de 500 sessoes/mes e o guarda passa a degradar para /forward em 450.</p>",
    "<p>Acompanhe em <code>docs/mapa/USO_SEARCHBOX.md</code> (view <code>searchbox_usage_daily</code>).</p>",
  ].join("");

  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + resendKey },
    body: JSON.stringify({
      from: "Zapp <nao-responda@promobrindes.com.br>",
      to: [DESTINATARIO],
      subject: "[Zapp] Custo do autocomplete de endereco: " + sessoes + " usos no mes",
      html: corpo,
    }),
  });

  return new Response(
    JSON.stringify({ ok: resposta.ok, enviado: resposta.ok, sessoes, status: resposta.status }),
    { status: resposta.ok ? 200 : 502 },
  );
});
