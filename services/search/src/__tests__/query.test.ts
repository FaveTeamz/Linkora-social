import { parseQuery } from "../query";

describe("parseQuery", () => {
  it("parses ordinary text into terms", () => {
    expect(parseQuery("hello decentralized world")).toEqual({
      terms: ["hello", "decentralized", "world"],
      hashtags: [],
      mentions: [],
    });
  });

  it("extracts hashtags and mentions while preserving ordinary terms", () => {
    expect(parseQuery("hello #Stellar @alice_42 news")).toEqual({
      terms: ["hello", "news"],
      hashtags: ["Stellar"],
      mentions: ["alice_42"],
    });
  });

  it("removes SQL metacharacters before returning search terms", () => {
    expect(parseQuery("safe; DROP TABLE posts -- 'quoted' (term)")).toEqual({
      terms: ["safe", "DROP", "TABLE", "posts", "quoted", "term"],
      hashtags: [],
      mentions: [],
    });
  });

  it("truncates input to 200 characters before parsing", () => {
    const result = parseQuery(`${"a".repeat(200)} trailing`);
    expect(result.terms).toEqual(["a".repeat(200)]);
  });
});
