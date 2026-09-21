import { describe, it, expect } from "vitest";
import { cancelConversation } from "./cancelConversation";

const schema = (cancelConversation as unknown as { inputSchema: any })
  .inputSchema;

describe("cancelConversation inputSchema", () => {
  it("accepts an empty object", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("accepts an optional reason", () => {
    const r = schema.safeParse({ reason: "user changed their mind" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe("user changed their mind");
  });

  it("execute returns success + cancelled:true", async () => {
    const result = await cancelConversation.execute(
      { reason: "test" } as any,
      { messages: [], abortSignal: undefined as any, toolCallId: "x" } as any,
    );
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe("test");
  });
});
