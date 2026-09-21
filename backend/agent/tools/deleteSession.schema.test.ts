import { describe, it, expect } from "vitest";
import { deleteSession } from "./deleteSession";

const schema = (deleteSession as unknown as { inputSchema: any }).inputSchema;
const parse = (input: any) => schema.safeParse(input);

describe("deleteSession inputSchema", () => {
  it("accepts just a link", () => {
    expect(parse({ link: "riplect.com/a/session/9" }).success).toBe(true);
  });

  it("requires a non-empty link", () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ link: "" }).success).toBe(false);
  });
});
