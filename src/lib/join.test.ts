import { describe, expect, it } from "vitest";
import { JoinInput, isPlaceholderEmail } from "./join";

describe("JoinInput", () => {
  it("tidies the name and email, and leaves the password as typed", () => {
    expect(JoinInput.parse({ name: " Sam ", email: " Sam@Example.com ", password: " ten or more " })).toEqual({ name: "Sam", email: "sam@example.com", password: " ten or more " });
  });

  it("says what's wrong", () => {
    const errors = JoinInput.safeParse({ name: " ", email: "sam", password: "short" }).error!.issues.map((i) => i.message);
    expect(errors).toHaveLength(3);
    expect(errors.join(" ")).toMatch(/name.*email.*at least 10/i);
  });

  it("won't hash something enormous", () => {
    expect(JoinInput.safeParse({ name: "Sam", email: "sam@example.com", password: "x".repeat(129) }).success).toBe(false);
  });
});

describe("isPlaceholderEmail", () => {
  it("knows the stand-in for a Discord account without one", () => {
    expect(isPlaceholderEmail("100000000000000001@discord.invalid")).toBe(true);
    expect(isPlaceholderEmail("sam@example.com")).toBe(false);
  });
});
