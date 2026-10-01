import request from "supertest";
import { createApp } from "../app";

// Mock the db module so unit tests never need a real PostgreSQL connection
jest.mock("../db", () => ({
  getPool: jest.fn(),
}));

// Mock search functions
jest.mock("../search", () => ({
  searchAll: jest.fn(),
  searchProfiles: jest.fn(),
  searchPosts: jest.fn(),
}));

import { searchAll, searchProfiles, searchPosts } from "../search";

const mockSearchAll = searchAll as jest.MockedFunction<typeof searchAll>;
const mockSearchProfiles = searchProfiles as jest.MockedFunction<typeof searchProfiles>;
const mockSearchPosts = searchPosts as jest.MockedFunction<typeof searchPosts>;

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", service: "search" });
  });
});

describe("GET /search", () => {
  it("returns 400 when query param q is missing", async () => {
    const res = await request(app).get("/search");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when q is empty string", async () => {
    const res = await request(app).get("/search?q=");
    expect(res.status).toBe(400);
  });

  it("returns 400 when limit exceeds 100", async () => {
    const res = await request(app).get("/search?q=hello&limit=200");
    expect(res.status).toBe(400);
  });

  it("returns 200 with results from searchAll", async () => {
    mockSearchAll.mockResolvedValueOnce([
      { id: "1", type: "profile", ref: "GABC", title: "Alice", snippet: "bio text", rank: 0.9 },
    ]);
    const res = await request(app).get("/search?q=alice");
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].title).toBe("Alice");
    expect(mockSearchAll).toHaveBeenCalledWith(expect.anything(), "alice", undefined);
  });

  it("passes limit to searchAll", async () => {
    mockSearchAll.mockResolvedValueOnce([]);
    await request(app).get("/search?q=test&limit=5");
    expect(mockSearchAll).toHaveBeenCalledWith(expect.anything(), "test", 5);
  });

  it("returns 500 when searchAll throws", async () => {
    mockSearchAll.mockRejectedValueOnce(new Error("db error"));
    const res = await request(app).get("/search?q=fail");
    expect(res.status).toBe(500);
  });
});

describe("GET /search/profiles", () => {
  it("returns 200 with profile results", async () => {
    mockSearchProfiles.mockResolvedValueOnce([
      { id: "2", type: "profile", ref: "GXYZ", title: "Bob", snippet: null, rank: 0.7 },
    ]);
    const res = await request(app).get("/search/profiles?q=bob");
    expect(res.status).toBe(200);
    expect(res.body.results[0].type).toBe("profile");
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/search/profiles");
    expect(res.status).toBe(400);
  });
});

describe("GET /search/posts", () => {
  it("returns 200 with post results", async () => {
    mockSearchPosts.mockResolvedValueOnce([
      { id: "3", type: "post", ref: "post-id-1", title: "Hello world", snippet: "Hello world...", rank: 0.6 },
    ]);
    const res = await request(app).get("/search/posts?q=hello");
    expect(res.status).toBe(200);
    expect(res.body.results[0].type).toBe("post");
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/search/posts");
    expect(res.status).toBe(400);
  });
});
