import { describe, expect, it } from "vitest";
import { netWarning, summarizeMovement } from "./movement-summary";

describe("summarizeMovement", () => {
  it("nets a balanced realignment to zero with no warning", () => {
    const s = summarizeMovement([{ amount: 30_000_000 }, { amount: -30_000_000 }]);
    expect(s).toEqual({ plus: 30_000_000, minus: -30_000_000, net: 0 });
    expect(netWarning("realignment", s.net)).toBeNull();
  });

  it("warns when a realignment does not net to zero", () => {
    const s = summarizeMovement([{ amount: 500 }, { amount: -300 }]);
    expect(s).toEqual({ plus: 500, minus: -300, net: 200 });
    expect(netWarning("realignment", s.net)).toBe("This realignment does not net to zero (net ₱2.00)");
  });

  it("warns for an augmentation too, with the sign before the peso sign", () => {
    expect(netWarning("augmentation", -150)).toBe("This realignment does not net to zero (net -₱1.50)");
  });

  it("does not warn for a reversion", () => {
    const s = summarizeMovement([{ amount: -500 }]);
    expect(s).toEqual({ plus: 0, minus: -500, net: -500 });
    expect(netWarning("reversion", s.net)).toBeNull();
  });

  it("is all zero for no lines", () => {
    expect(summarizeMovement([])).toEqual({ plus: 0, minus: 0, net: 0 });
  });
});
