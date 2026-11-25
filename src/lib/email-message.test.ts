import { describe, expect, it } from "vitest";
import { buildEmail, dateSet, emailWhen, nightChanged, nightMade, passwordReset, reminder } from "./email-message";

const f = { siteName: "Boardroom", timeZone: "America/Chicago", url: "https://example.com/events/4", settingsUrl: "https://example.com/settings#email" };
const night = { title: "10/29/26 Game Night", startsAt: "2026-10-30T00:00:00Z", location: "Sam's" };

describe("buildEmail", () => {
  it("says everything as text and as HTML, with where to stop it", () => {
    const e = nightMade({ ...night, by: "Sam" }, f);
    for (const body of [e.text, e.html]) {
      expect(body).toContain("Sam added 10/29/26 Game Night.");
      expect(body).toContain(f.url);
      expect(body).toContain(f.settingsUrl);
    }
  });

  it("escapes what people typed, and keeps the subject to a line", () => {
    const e = buildEmail({ subject: "Hi\r\nBcc: everyone@example.com", lines: ["<script>alert(1)</script> & co"], siteName: "<b>Site</b>" });
    expect(e.subject).toBe("Hi Bcc: everyone@example.com");
    expect(e.html).not.toMatch(/<script>|<b>/);
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.text).toContain("<script>");
  });

  it("doesn't offer to stop account emails", () => {
    expect(passwordReset({ name: "Sam" }, f).text).not.toContain("stop emails");
  });
});

describe("emailWhen", () => {
  it("is in the group's time zone, and says which", () => {
    expect(emailWhen("2026-10-30T00:00:00Z", "America/Chicago").replace(/ /g, " ")).toBe("Thursday, October 29 at 7:00 PM CDT");
  });
});

describe("nightChanged", () => {
  it("says what moved", () => {
    expect(nightChanged(night, { ...night, location: "Alex's", by: "Sam" }, f)?.text).toContain("Now at Alex's");
    expect(nightChanged(night, { ...night, startsAt: "2026-10-31T00:00:00Z", by: "Sam" }, f)?.text).toContain("Now Friday, October 30");
    expect(nightChanged(night, { ...night, location: null, by: "Sam" }, f)?.text).toContain("No place set now");
  });

  it("stays quiet about a new name", () => {
    expect(nightChanged(night, { ...night, title: "Dune night", by: "Sam" }, f)).toBeNull();
  });
});

describe("dateSet and reminder", () => {
  it("say what someone's down as", () => {
    expect(dateSet({ ...night, status: "maybe" }, f).text).toContain("down as a maybe");
    expect(dateSet({ ...night, status: null }, f).text).toContain("Say if you're coming");
    expect(reminder({ ...night, status: "going", bringing: ["Azul", "Skull"] }, f).text).toContain("Don't forget to bring Azul, Skull.");
  });
});
