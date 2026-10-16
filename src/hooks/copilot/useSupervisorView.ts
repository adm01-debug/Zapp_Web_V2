// CV-121–122: useSupervisorView hook
// Supervisor monitors vendor conversations and sees RADAR suggestions in real-time

export interface VendorPerformance {
  vendorId: string;
  conversationsToday: number;
  avgResponseTime: number; // seconds
  copilotAcceptanceRate: number; // 0-1
  activeConversations: number;
  lossRiskCount: number;
}

export interface SupervisorAlert {
  conversationId: string;
  vendorId: string;
  alertType: 'loss_risk' | 'long_silence' | 'repeated_objection' | 'low_acceptance';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

export interface UseSupervisorViewResult {
  performances: VendorPerformance[];
  alerts: SupervisorAlert[];
  intervene: (conversationId: string, message: string) => void;
}

/**
 * CV-121–122
 * Allows a supervisor to monitor vendor conversations and see RADAR alerts.
 * Currently returns stub data; real-time integration is a future milestone.
 */
export function useSupervisorView(vendorIds: string[]): UseSupervisorViewResult {
  const performances: VendorPerformance[] = vendorIds.map((vendorId) => ({
    vendorId,
    conversationsToday: 0,
    avgResponseTime: 0,
    copilotAcceptanceRate: 0,
    activeConversations: 0,
    lossRiskCount: 0,
  }));

  const alerts: SupervisorAlert[] = [];

  function intervene(conversationId: string, message: string): void {
    // Stub: in production this would send a supervisor message to the conversation
    console.log('[SupervisorView] intervene', { conversationId, message });
  }

  return { performances, alerts, intervene };
}
