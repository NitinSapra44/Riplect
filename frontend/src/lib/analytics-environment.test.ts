import { describe, expect, it } from "vitest";
import { getAnalyticsRuntime, isAnalyticsAllowed } from "./analytics-environment";

describe("analytics environment policy", () => {
  it.each([
    { hostname: "localhost", mode: "production", isDevBuild: false },
    { hostname: "127.0.0.1", mode: "production", isDevBuild: false },
    { hostname: "my-app.user.replit.dev", mode: "production", isDevBuild: false },
    { hostname: "my-app.user.repl.co", mode: "production", isDevBuild: false },
    { hostname: "riplect.example", mode: "development", isDevBuild: false },
    { hostname: "riplect.example", mode: "production", isDevBuild: true },
  ])("blocks Preview/development: $hostname ($mode)", (environment) => {
    expect(getAnalyticsRuntime(environment)).toBe("preview");
    expect(isAnalyticsAllowed(environment)).toBe(false);
  });

  it("allows a known production hostname in production mode", () => {
    const environment = {
      hostname: "riplect.com",
      mode: "production",
      isDevBuild: false,
    };

    expect(getAnalyticsRuntime(environment)).toBe("production");
    expect(isAnalyticsAllowed(environment)).toBe(true);
  });

  it.each([
    { hostname: undefined, mode: "production", isDevBuild: false },
    { hostname: "riplect.example", mode: "staging", isDevBuild: false },
  ])("fails closed for an unknown environment: $mode", (environment) => {
    expect(getAnalyticsRuntime(environment)).toBe("unknown");
    expect(isAnalyticsAllowed(environment)).toBe(false);
  });
});