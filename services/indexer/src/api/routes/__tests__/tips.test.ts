import express from "express";
import request from "supertest";
import { createTipsRouter } from "../tips";
import { Database, TipRecord } from "../../../db";

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

function makeTip(overrides: Partial<TipRecord> = {}): TipRecord {
  return {
    id: 7,
    tipper: ADDRESS,
    post_id: 12n,
    amount: 1_000n,
    fee: 50n,
    created_at: new Date("2025-01-01T00:00:00.000Z"),
    tx_hash: "tx-hash",
    ...overrides,
  };
}

function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    listTipsByPost: jest.fn().mockResolvedValue({ tips: [makeTip()], total: 5 }),
    listTipsReceived: jest.fn().mockResolvedValue({ tips: [makeTip()], total: 1 }),
    listTipsSent: jest.fn().mockResolvedValue({ tips: [makeTip()], total: 1 }),
    getTipTotals: jest.fn().mockResolvedValue({
      sent_count: 2,
      sent_amount: 2000n,
      sent_fee: 100n,
      received_count: 3,
      received_amount: 2850n,
      received_fee: 150n,
    }),
    ...overrides,
  } as unknown as Database;
}

function buildApp(db: Database) {
  const app = express();
  app.use("/tips", createTipsRouter(db));
  return app;
}

describe("tip history API", () => {
  it("paginates per-post tip history with a numeric cursor", async () => {
    const db = makeDb();
    const response = await request(buildApp(db)).get("/tips/by-post/12?limit=2&cursor=2");

    expect(response.status).toBe(200);
    expect(db.listTipsByPost).toHaveBeenCalledWith(12n, 2, 2);
    expect(response.body.tips[0]).toMatchObject({ post_id: "12", amount: "1000", fee: "50" });
    expect(response.body.next_cursor).toBe("3");
  });

  it("queries received and sent histories by address", async () => {
    const db = makeDb();
    const app = buildApp(db);

    expect((await request(app).get(`/tips/received/${ADDRESS}`)).status).toBe(200);
    expect((await request(app).get(`/tips/sent/${ADDRESS}`)).status).toBe(200);
    expect(db.listTipsReceived).toHaveBeenCalledWith(ADDRESS, 20, 0);
    expect(db.listTipsSent).toHaveBeenCalledWith(ADDRESS, 20, 0);
  });

  it("aggregates sent and net received totals over a time range", async () => {
    const db = makeDb();
    const response = await request(buildApp(db)).get(
      `/tips/totals/${ADDRESS}?from=2025-01-01T00:00:00.000Z&to=2025-02-01T00:00:00.000Z`
    );

    expect(response.status).toBe(200);
    expect(db.getTipTotals).toHaveBeenCalledWith(
      ADDRESS,
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-02-01T00:00:00.000Z")
    );
    expect(response.body).toMatchObject({ sent_amount: "2000", received_amount: "2850" });
  });

  it("rejects invalid or reversed time ranges", async () => {
    const app = buildApp(makeDb());
    expect(
      (await request(app).get(`/tips/totals/${ADDRESS}?from=2025-02-01T00:00:00.000Z&to=2025-01-01T00:00:00.000Z`)).status
    ).toBe(400);
    expect((await request(app).get("/tips/by-post/0")).status).toBe(400);
  });
});
