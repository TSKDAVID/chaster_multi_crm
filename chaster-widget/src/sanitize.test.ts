import { describe, expect, it } from "vitest";

import { sanitizeOutgoingMessage } from "./sanitize";

describe("sanitizeOutgoingMessage", () => {
  it("removes control characters and trims", () => {
    const value = sanitizeOutgoingMessage("  hello\u0001   world  ");
    expect(value).toBe("hello world");
  });

  it("caps message length", () => {
    const long = "x".repeat(4000);
    expect(sanitizeOutgoingMessage(long)).toHaveLength(2000);
  });
});
