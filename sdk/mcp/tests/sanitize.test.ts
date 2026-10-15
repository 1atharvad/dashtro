/**
 * Unit tests for sanitizeInput's XSS tripwire: real script tags and event-handler
 * attributes are rejected, but ordinary words containing "script" are not.
 */

import { describe, expect, it } from "vitest";
import { sanitizeInput } from "../src/server.js";

describe("sanitizeInput", () => {
  it("allows script substrings in prose next to component tags", () => {
    const text = "<HighlightedText>TypeScript and JavaScript description</HighlightedText> subscriptions";
    expect(sanitizeInput(text)).toBe(text);
  });

  it("rejects script tags and on*= handler attributes", () => {
    for (const payload of [
      "<script>alert(1)</script>",
      "<SCRIPT src=x>",
      '<img src=x onerror="alert(1)">',
      "<div onClick = 'x()'>hi</div>",
    ]) {
      expect(() => sanitizeInput(payload)).toThrow(/suspicious content rejected/);
    }
  });
});
