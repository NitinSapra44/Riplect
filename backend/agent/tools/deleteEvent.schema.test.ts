import { describe, it, expect } from "vitest";
import { deleteEvent } from "./deleteEvent";

const schema = (deleteEvent as unknown as { inputSchema: any }).inputSchema;
const parse = (input: any) => schema.safeParse(input);

describe("deleteEvent inputSchema", () => {
  it("accepts just a link", () => {
    expect(parse({ link: "riplect.com/a/event/3" }).success).toBe(true);
  });

  it("requires a non-empty link", () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ link: "" }).success).toBe(false);
  });

  it("ignores unrelated fields (delete takes only a link)", () => {
    const r = parse({ link: "riplect.com/a/event/3", price: "800" });
    expect(r.success).toBe(true);
  });
});
