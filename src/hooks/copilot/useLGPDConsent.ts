// CV-117–118: LGPD Consent hook
// Tracks and surfaces LGPD consent status for the current contact

export type LGPDConsentType = 'explicit' | 'implicit' | 'none';

export interface LGPDStatus {
  hasConsent: boolean;
  consentDate: string | null;
  consentType: LGPDConsentType;
  requiresRenewal: boolean;
}

export interface LGPDConsentResult {
  status: LGPDStatus;
  suggestConsentMessage: boolean;
}

// Consent is considered to require renewal after 12 months
const RENEWAL_MONTHS = 12;

function isExpired(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const monthsDiff =
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());
  return monthsDiff >= RENEWAL_MONTHS;
}

/**
 * Derives LGPD consent status from conversation messages.
 *
 * In production this hook would query the database; here it derives
 * status from the messages array passed by the caller so the logic
 * is testable without a network dependency.
 *
 * @param contactId  - ID of the current contact
 * @param messages   - conversation messages (optional, used for implicit consent)
 * @param explicitConsent - explicit consent record from DB (optional)
 */
export function useLGPDConsent(
  _contactId: string,
  messages: Array<{ type?: string; created_at?: string }> = [],
  explicitConsent: { date: string } | null = null
): LGPDConsentResult {
  let status: LGPDStatus;

  if (explicitConsent) {
    const requiresRenewal = isExpired(explicitConsent.date);
    status = {
      hasConsent: !requiresRenewal,
      consentDate: explicitConsent.date,
      consentType: 'explicit',
      requiresRenewal,
    };
  } else {
    // Check for implicit consent: customer replied to a marketing message
    const marketingReply = messages.find((m) => m.type === 'marketing_reply');
    if (marketingReply) {
      const date = marketingReply.created_at ?? new Date().toISOString();
      const requiresRenewal = isExpired(date);
      status = {
        hasConsent: !requiresRenewal,
        consentDate: date,
        consentType: 'implicit',
        requiresRenewal,
      };
    } else {
      status = {
        hasConsent: false,
        consentDate: null,
        consentType: 'none',
        requiresRenewal: false,
      };
    }
  }

  // Suggest requesting consent if no consent and conversation is active (>3 messages)
  const suggestConsentMessage = !status.hasConsent && messages.length > 3;

  return { status, suggestConsentMessage };
}
