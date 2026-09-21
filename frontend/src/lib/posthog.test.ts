import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = {
  __loaded: false,
  capture: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
  reset: vi.fn(),
  setPersonProperties: vi.fn(),
};

vi.mock("posthog-js", () => ({
  default: sdk,
}));

describe("PostHog Preview guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not initialize or forward analytics calls in the test Preview environment", async () => {
    const { initPostHog, isPostHogEnabled, posthog } = await import("./posthog");

    expect(isPostHogEnabled).toBe(false);

    initPostHog();
    posthog.capture("preview_event");
    posthog.identify("preview-user");
    posthog.setPersonProperties({ preview: true });
    posthog.reset();

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
    expect(sdk.setPersonProperties).not.toHaveBeenCalled();
    expect(sdk.reset).not.toHaveBeenCalled();
  });
});