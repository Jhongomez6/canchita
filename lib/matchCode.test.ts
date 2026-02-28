import { describe, it, expect } from "vitest";
import { sanitizeMatchCode } from "./matchCode";

describe("sanitizeMatchCode", () => {
    // ── Basic codes ──
    it("returns a plain code preserving original case", () => {
        expect(sanitizeMatchCode("bQZArdJKKtgr1nZnwEpD")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("trims whitespace", () => {
        expect(sanitizeMatchCode("  bQZArdJKKtgr1nZnwEpD  ")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("preserves mixed case", () => {
        expect(sanitizeMatchCode("XyZ789")).toBe("XyZ789");
    });

    // ── .ai / .app suffix (WhatsApp trick) ──
    it("strips .ai suffix from a bare code", () => {
        expect(sanitizeMatchCode("bQZArdJKKtgr1nZnwEpD.ai")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("strips .AI suffix (case-insensitive)", () => {
        expect(sanitizeMatchCode("bQZArdJKKtgr1nZnwEpD.AI")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("strips .app suffix from a bare code", () => {
        expect(sanitizeMatchCode("bQZArdJKKtgr1nZnwEpD.app")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("strips .App suffix (mixed case)", () => {
        expect(sanitizeMatchCode("bQZArdJKKtgr1nZnwEpD.App")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    // ── Full join URLs ──
    it("extracts code from full https join URL", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("extracts code from http join URL", () => {
        expect(sanitizeMatchCode("http://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("extracts code from join URL WITH .ai suffix", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD.ai")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("extracts code from join URL WITH .app suffix", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD.app")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    // ── Edge cases: trailing slash ──
    it("handles trailing slash after code", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD/")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("handles trailing slash after .ai code", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD.ai/")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    // ── Edge cases: query params ──
    it("handles query params after code", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD?ref=wa")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("handles query params after .ai code", () => {
        expect(sanitizeMatchCode("https://la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD.ai?ref=wa")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    // ── URL without /join/ ──
    it("strips https:// from a bare domain-less URL", () => {
        expect(sanitizeMatchCode("https://bQZArdJKKtgr1nZnwEpD")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    // ── Bare domain/join link without protocol ──
    it("extracts code from join path without protocol", () => {
        expect(sanitizeMatchCode("la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    it("extracts code from join path without protocol, with .ai", () => {
        expect(sanitizeMatchCode("la-canchita.vercel.app/join/bQZArdJKKtgr1nZnwEpD.ai")).toBe("bQZArdJKKtgr1nZnwEpD");
    });

    // ── Does NOT strip partial matches ──
    it("does NOT strip .air (only exact .ai or .app)", () => {
        expect(sanitizeMatchCode("abc123.air")).toBe("abc123.air");
    });

    it("does NOT strip .aio", () => {
        expect(sanitizeMatchCode("abc123.aio")).toBe("abc123.aio");
    });

    // ── Empty / minimal input ──
    it("handles empty string", () => {
        expect(sanitizeMatchCode("")).toBe("");
    });

    it("handles whitespace-only string", () => {
        expect(sanitizeMatchCode("   ")).toBe("");
    });
});
