import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { Toaster } from "@/components/ui/sonner";

vi.mock("@/hooks/ui/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

// t_a0562af3 (item 3): o viewport do app é o do Sonner e ele anuncia em pt-BR —
// o padrão do pacote é inglês ("Notifications" / "Close"). No jsdom o pacote
// monta só a região de anúncio (que carrega o `containerAriaLabel`); o viewport
// visível `[data-sonner-toaster]` só aparece com toast em tela.
describe("sonner — anúncio em pt-BR", () => {
  it("a região de anúncio usa o containerAriaLabel em pt-BR", async () => {
    render(<Toaster />);

    await waitFor(() => {
      expect(document.querySelector('[aria-label^="Notificações"]')).not.toBeNull();
    });

    expect(document.body.innerHTML).not.toContain("Notifications");
  });
});
