import express from "express";
import request from "supertest";
import { Database } from "../db";
import { createProfilesRouter } from "../api/routes/profiles";

describe("profile username search", () => {
  function appFor(db: Partial<Database>) {
    const app = express();
    app.use("/api/profiles", createProfilesRouter(db as Database));
    return app;
  }

  it("resolves an exact username through a case-insensitive database lookup", async () => {
    const db = {
      getProfileByUsername: jest.fn().mockResolvedValue({ address: "GADDRESS" }),
    };

    const response = await request(appFor(db)).get("/api/profiles/search?username=Alice");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ address: "GADDRESS" });
    expect(db.getProfileByUsername).toHaveBeenCalledWith("Alice");
  });

  it("returns null for an unknown exact username", async () => {
    const db = { getProfileByUsername: jest.fn().mockResolvedValue(null) };

    const response = await request(appFor(db)).get("/api/profiles/search?username=unknown");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ address: null });
  });

  it("keeps the existing prefix search contract for web search", async () => {
    const profiles = [{ address: "GADDRESS", username: "alice" }];
    const db = { searchProfiles: jest.fn().mockResolvedValue(profiles) };

    const response = await request(appFor(db)).get("/api/profiles/search?q=ali&limit=5");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ profiles });
    expect(db.searchProfiles).toHaveBeenCalledWith("ali", 5);
  });
});
