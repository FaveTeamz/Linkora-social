import express from "express";
import request from "supertest";
import { Pool } from "pg";
import { createReputationRouter } from "../reputation";

const VALID_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

function makeDb(rows: unknown[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

function makeApp(db: Pool) {
  const app = express();
  app.use("/reputation", createReputationRouter(db));
  return app;
}

describe("reputation API", () => {
  it("returns a user's reputation data", async () => {
    const db = makeDb([
      {
        user_address: VALID_ADDRESS,
        score: 12,
        posts_count: 3,
        tips_sent: 4,
        tips_received: 5,
        governance_votes: 2,
        last_computed_at: "2026-10-01T00:00:00.000Z",
        updated_ledger: 99,
      },
    ]);

    const response = await request(makeApp(db)).get(`/reputation/${VALID_ADDRESS}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ address: VALID_ADDRESS, score: 12, postsCount: 3 });
  });

  it("returns score-ranked leaderboard rows with pagination", async () => {
    const db = makeDb([{ user_address: VALID_ADDRESS, score: 12, posts_count: 3 }]);

    const response = await request(makeApp(db)).get("/reputation/leaderboard?limit=5&offset=10");

    expect(response.status).toBe(200);
    expect(response.body.entries[0]).toMatchObject({ rank: 11, address: VALID_ADDRESS, score: 12 });
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([5, 10]);
  });

  it("rejects malformed addresses and invalid leaderboard limits", async () => {
    const app = makeApp(makeDb());
    expect((await request(app).get("/reputation/not-an-address")).status).toBe(400);
    expect((await request(app).get("/reputation/leaderboard?limit=500")).status).toBe(400);
  });
});
