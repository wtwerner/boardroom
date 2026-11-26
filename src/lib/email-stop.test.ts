import { describe, expect, it } from "vitest";
import { readStopKey, signStopKey } from "./email-stop";

describe("stop keys", () => {
  it("say whose they are", () => {
    expect(readStopKey(signStopKey("u-sam", "secret"), "secret")).toBe("u-sam");
    expect(readStopKey(signStopKey("Ab12cd34Ef56gh78Ij90kl12Mn34op56", "secret"), "secret")).toBe("Ab12cd34Ef56gh78Ij90kl12Mn34op56");
  });

  it("can't be moved to someone else, or made without the secret", () => {
    const signature = signStopKey("u-sam", "secret").split(".")[1];
    expect(readStopKey(`u-alex.${signature}`, "secret")).toBeNull();
    expect(readStopKey(signStopKey("u-sam", "other"), "secret")).toBeNull();
    for (const key of ["u-sam", "u-sam.short", "", ".aaaaaaaaaaaaaaaaaaaaaa", "u sam.aaaaaaaaaaaaaaaaaaaaaa"]) expect(readStopKey(key, "secret")).toBeNull();
  });
});
