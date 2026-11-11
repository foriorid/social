import assert from "node:assert/strict";
import { test } from "node:test";
import { costIdr, monthKey, parseIdeas, parseLines, parseProfile } from "./logic.ts";

test("parseProfile reads Instagram and TikTok links and bare handles", () => {
  assert.deepEqual(parseProfile("https://instagram.com/alvian.indonesia/"), { handle: "@alvian.indonesia", platform: "Instagram" });
  assert.deepEqual(parseProfile("https://www.tiktok.com/@alvian.indonesia?lang=id"), { handle: "@alvian.indonesia", platform: "TikTok" });
  assert.deepEqual(parseProfile("@forior.id"), { handle: "@forior.id", platform: "Instagram" });
  assert.equal(parseProfile("https://example.com/someone"), null);
  assert.equal(parseProfile(""), null);
});

test("costIdr prices by model and falls back to the dearest tier", () => {
  assert.equal(costIdr("claude-haiku-5-5", 1_000_000, 1_000_000, 16000), 0.6 * 16000);
  assert.equal(costIdr("claude-sonnet-5-5", 500_000, 100_000, 16000), 2 * 16000);
  assert.equal(costIdr("model-tak-dikenal", 1_000_000, 0, 16000), 4 * 16000);
});

test("parseLines strips bullets, numbering and quotes", () => {
  assert.deepEqual(parseLines("1. “Hook satu”\n- Hook dua\n\n* Hook tiga"), ["Hook satu", "Hook dua", "Hook tiga"]);
});

test("parseIdeas keeps only IDE: lines", () => {
  assert.deepEqual(parseIdeas("Ringkasan akun\nIDE: Before/after kamar\n- ide: Biaya foto interior"), ["Before/after kamar", "Biaya foto interior"]);
});

test("monthKey pads the month", () => {
  assert.equal(monthKey(new Date(2026, 2, 5)), "2026-03");
});
