import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const doc = new jsPDF();

// Estilos
doc.setFont("helvetica", "bold");
doc.setFontSize(22);
doc.text("RELATORIO DE AUDITORIA ENTERPRISE", 20, 20);

doc.setFontSize(14);
doc.text("SISTEMA: PRONTO TALK SUITE (ZAPP-WEB)", 20, 30);
doc.text("DATA: 14/05/2026", 20, 38);

doc.line(20, 45, 190, 45);

doc.setFontSize(12);
doc.setFont("helvetica", "normal");
doc.text("Resumo Executivo:", 20, 55);
doc.setFontSize(10);
const summary = "A auditoria detalhada do sistema Pronto Talk Suite identificou um ecossistema robusto de atendimento omnichannel. Com mais de 250 migrations de banco de dados e 60+ edge functions, o sistema apresenta alta escalabilidade e seguranca de nivel enterprise.";
doc.text(doc.splitTextToSize(summary, 170), 20, 62);

// Tabela de Funcionalidades
autoTable(doc, {
  startY: 80,
  head: [['Modulo', 'Funcionalidade', 'Status', 'Prioridade']],
  body: [
    ['Inbox', 'Chat Realtime Virtualizado', 'OK', 'P0'],
    ['Seguranca', 'MFA WebAuthn (Passkeys)', 'OK', 'P0'],
    ['IA', 'Transcricao ElevenLabs', 'OK', 'P1'],
    ['CRM', 'Pipeline Kanban', 'OK', 'P1'],
    ['SLA', 'Tracking de Metricas', 'OK', 'P0'],
    ['Admin', 'Telemetria do Sistema', 'OK', 'P2'],
    ['Seguranca', 'Audit Logs Completos', 'OK', 'P0'],
    ['Mobile', 'Suporte PWA', 'OK', 'P1'],
  ],
});

doc.addPage();
doc.setFontSize(16);
doc.text("Anexo de Evidencias (Paths)", 20, 20);
doc.setFontSize(10);
const evidence = [
  "RBAC: src/hooks/useUserRole.ts",
  "Realtime: src/hooks/useRealtimeMessages.ts",
  "IA Functions: supabase/functions/ai-*/",
  "Migrations: supabase/migrations/",
  "Audit Logic: src/lib/audit.ts",
  "WebAuthn: src/lib/webauthnUtils.ts"
];

let y = 30;
evidence.forEach(line => {
  doc.text(line, 20, y);
  y += 10;
});

 doc.save("docs/audit_report.pdf");
 console.log("PDF gerado em docs/audit_report.pdf");
