import { describe, it, expect } from "vitest";
import { auditFonts, extractFontFamiliesFromCSS, extractFontFamiliesFromJS } from "../scripts/audit-fontes.js";

describe("audit-fontes", () => {
  describe("extractFontFamiliesFromCSS", () => {
    it("detecta fonte fora do padrao (deviation)", () => {
      const html = '<div style="font-family: Plus Jakarta Sans, sans-serif">texto</div>';
      const findings = extractFontFamiliesFromCSS(html, "test.html");
      expect(findings.length).toBe(1);
      expect(findings[0].status).toBe("deviation");
      expect(findings[0].deviations).toContain("plus jakarta sans");
    });

    it("detecta fonte dentro do padrao (ok)", () => {
      const html = '<div style="font-family: system-ui, -apple-system, sans-serif">texto</div>';
      const findings = extractFontFamiliesFromCSS(html, "test.html");
      expect(findings.length).toBe(1);
      expect(findings[0].status).toBe("ok");
      expect(findings[0].deviations).toEqual([]);
    });

    it("retorna lista vazia quando nao ha font-family", () => {
      const html = "<div>texto sem fonte</div>";
      const findings = extractFontFamiliesFromCSS(html, "test.html");
      expect(findings.length).toBe(0);
    });
  });

  describe("extractFontFamiliesFromJS", () => {
    it("detecta setFont com fonte fora do padrao", () => {
      const js = 'doc.setFont("helvetica");';
      const findings = extractFontFamiliesFromJS(js, "generate_audit_pdf.ts");
      expect(findings.length).toBe(1);
      expect(findings[0].status).toBe("deviation");
      expect(findings[0].deviations).toContain("helvetica");
    });

    it("detecta setFont com fonte dentro do padrao", () => {
      const js = 'doc.setFont("sans-serif");';
      const findings = extractFontFamiliesFromJS(js, "test.ts");
      expect(findings.length).toBe(1);
      expect(findings[0].status).toBe("ok");
      expect(findings[0].deviations).toEqual([]);
    });
  });

  describe("auditFonts", () => {
    it("escaneia HTML falso e detecta fontes fora do padrao", async () => {
      const { mkdirSync, writeFileSync, rmSync, readdirSync } = await import("node:fs");
      const { join } = await import("path");
      const tmpDir = join(process.cwd(), ".tmp", "audit-fontes-test");
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(join(tmpDir, "docs", "talkx", "references"), { recursive: true });
      mkdirSync(join(tmpDir, "public"), { recursive: true });

      writeFileSync(
        join(tmpDir, "docs", "talkx", "references", "INDEX.html"),
        '<html><body style="font-family: system-ui, sans-serif">ok</body></html>'
      );
      writeFileSync(
        join(tmpDir, "public", "index.html"),
        '<html><body style="font-family: Arial, sans-serif">arial</body></html>'
      );
      writeFileSync(
        join(tmpDir, "generate_audit_pdf.ts"),
        'doc.setFont("helvetica");'
      );

      const results = auditFonts(tmpDir);
      rmSync(tmpDir, { recursive: true, force: true });

      const deviations = results.filter((r) => r.status === "deviation");
      expect(deviations.length).toBeGreaterThanOrEqual(2);

      const publicDeviation = results.find(
        (r) => r.file.includes("public/index.html") && r.status === "deviation"
      );
      expect(publicDeviation).toBeDefined();
      expect(publicDeviation!.deviations).toContain("arial");

      const pdfDeviation = results.find(
        (r) => r.file.includes("generate_audit_pdf.ts") && r.status === "deviation"
      );
      expect(pdfDeviation).toBeDefined();
      expect(pdfDeviation!.deviations).toContain("helvetica");
    });
  });
});
