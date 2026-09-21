import { describe, it, expect } from "vitest";
import { parseEditTarget } from "./linkTarget";

describe("parseEditTarget", () => {
  it("parses a clean event link", () => {
    expect(parseEditTarget("https://riplect.com/asha-yoga/event/42")).toEqual({
      kind: "event",
      id: 42,
    });
  });

  it("parses a clean session link", () => {
    expect(
      parseEditTarget("https://riplect.com/dr-rao/session/7"),
    ).toEqual({ kind: "session", id: 7 });
  });

  it("ignores host, scheme, and username — any domain works", () => {
    expect(parseEditTarget("http://localhost:5000/x/event/3")).toEqual({
      kind: "event",
      id: 3,
    });
    expect(
      parseEditTarget("riplect-staging.fly.dev/some.user/event/999"),
    ).toEqual({ kind: "event", id: 999 });
  });

  it("extracts the link from surrounding pasted text and trailing query", () => {
    const blob =
      "pls fix this 👉 https://riplect.com/asha/event/12?utm_source=wa  thanks";
    expect(parseEditTarget(blob)).toEqual({ kind: "event", id: 12 });
  });

  it("takes the last link when several are present (fresh below quoted)", () => {
    const blob =
      "you sent: riplect.com/a/event/5\nactually I mean riplect.com/a/event/8";
    expect(parseEditTarget(blob)).toEqual({ kind: "event", id: 8 });
  });

  it("returns null when there is no recognizable target", () => {
    expect(parseEditTarget("change the price to 800")).toBeNull();
    expect(parseEditTarget("")).toBeNull();
    expect(parseEditTarget(null)).toBeNull();
    expect(parseEditTarget("riplect.com/asha/event/")).toBeNull();
    expect(parseEditTarget("riplect.com/asha/blog/3")).toBeNull();
  });

  it("does not match a non-numeric id", () => {
    expect(parseEditTarget("riplect.com/a/event/abc")).toBeNull();
  });
});
