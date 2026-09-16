import { describe, expect, it } from "vitest";
import { makeCommitment, makeResolutionHash, makeTermsHash, scopedStorageKey, veilAbi } from "./chain";

describe("Veil contract adapter", () => {
  it("builds repeatable terms hashes from the submitted fields", () => {
    const first = makeTermsHash("Open reporting", "Publish the report", 4n, 1_800_000_000n);
    expect(makeTermsHash("Open reporting", "Publish the report", 4n, 1_800_000_000n)).toBe(first);
    expect(makeTermsHash("Open reporting", "Different report", 4n, 1_800_000_000n)).not.toBe(first);
  });

  it("creates opaque commitments and hashes resolution references", () => {
    expect(makeCommitment()).not.toBe(makeCommitment());
    expect(makeResolutionHash("evidence:task-1042")).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("keeps local data namespaces separated by account and contract", () => {
    expect(scopedStorageKey("0xAbC")).toContain(":968:");
    expect(scopedStorageKey("0xAbC")).not.toBe(scopedStorageKey("0xDef"));
    expect(scopedStorageKey()).toContain(":public");
  });

  it("exposes only the deployed operator proof lifecycle", () => {
    expect(veilAbi.map((item) => "name" in item ? item.name : "")).toEqual([
      "operator", "grants", "createGrant", "markFunded", "resolve", "GrantCreated", "GrantFunded", "GrantResolved",
    ]);
  });
});
