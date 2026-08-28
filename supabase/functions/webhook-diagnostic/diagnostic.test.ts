
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mock implementation of logic for testing without actual DB/API calls
// In a real scenario, we'd use a test DB or mock the fetch
function calculateHealthScore(connections: any[], webhooks: any[]) {
  if (connections.length === 0) return 0;
  const activeCount = connections.filter(c => c.status === 'connected').length;
  const webhookOk = webhooks.every(w => w.configured);
  
  let score = (activeCount / connections.length) * 80;
  if (webhookOk) score += 20;
  
  return Math.round(score);
}

Deno.test("Health Score Calculation - All Connected", () => {
  const connections = [{ status: 'connected' }, { status: 'connected' }];
  const webhooks = [{ configured: true }];
  const score = calculateHealthScore(connections, webhooks);
  assertEquals(score, 100);
});

Deno.test("Health Score Calculation - Half Connected", () => {
  const connections = [{ status: 'connected' }, { status: 'disconnected' }];
  const webhooks = [{ configured: true }];
  const score = calculateHealthScore(connections, webhooks);
  assertEquals(score, 60); // (0.5 * 80) + 20
});

Deno.test("Health Score Calculation - Webhook Missing", () => {
  const connections = [{ status: 'connected' }];
  const webhooks = [{ configured: false }];
  const score = calculateHealthScore(connections, webhooks);
  assertEquals(score, 80);
});

Deno.test("Health Score Calculation - No Connections", () => {
  const connections: any[] = [];
  const webhooks = [{ configured: true }];
  const score = calculateHealthScore(connections, webhooks);
  assertEquals(score, 0);
});
