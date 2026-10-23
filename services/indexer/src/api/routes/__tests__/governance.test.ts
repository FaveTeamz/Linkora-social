import { createGovernanceRouter } from "../governance";
import { Database } from "../../../db";

function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

async function invokeRoute(
  router: ReturnType<typeof createGovernanceRouter>,
  path: string,
  req: Record<string, unknown>
) {
  const layer = router.stack.find((item: any) => item.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);

  const res = createMockResponse();
  const stack = layer.route.stack;

  let i = 0;
  const next = () => {
    if (i < stack.length) {
      const handler = stack[i++].handle;
      handler(req, res, next);
    }
  };
  next();
  return res;
}

async function getProposals(query: Record<string, unknown>, db: Database) {
  const router = createGovernanceRouter(db);
  return invokeRoute(router, "/proposals", { query });
}

describe("governance API", () => {
  let db: jest.Mocked<Database>;

  beforeEach(() => {
    db = {
      listGovernanceProposals: jest.fn().mockResolvedValue({
        proposals: [
          {
            proposal_id: 1n,
            proposer: "GPROPOSER123",
            parameter: "FeeBps",
            new_value: 500n,
            votes_for: 100n,
            votes_against: 50n,
            status: "Active",
            created_ledger: 100,
            updated_ledger: 100,
          },
        ],
        total: 1,
      }),
      getGovernanceProposal: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<Database>;
  });

  it("lists proposals with default limit and offset", async () => {
    const res = await getProposals({}, db);

    expect(db.listGovernanceProposals).toHaveBeenCalledWith({ limit: 20, offset: 0, status: undefined });
    expect(res.json).toHaveBeenCalledWith({
      proposals: [
        {
          proposal_id: "1",
          proposer: "GPROPOSER123",
          parameter: "FeeBps",
          new_value: "500",
          votes_for: "100",
          votes_against: "50",
          status: "Active",
          created_ledger: 100,
          updated_ledger: 100,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
      has_more: false,
      next_cursor: null,
    });
  });

  it("lists proposals with custom limit and offset", async () => {
    const res = await getProposals({ limit: "5", offset: "10" }, db);

    expect(db.listGovernanceProposals).toHaveBeenCalledWith({
      limit: 5,
      offset: 10,
      status: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
        offset: 10,
      })
    );
  });

  it("rejects invalid limit or offset", async () => {
    const res1 = await getProposals({ limit: "-1" }, db);
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = await getProposals({ offset: "abc" }, db);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  it("supports status filtering and numeric cursor pagination", async () => {
    const res = await getProposals({ limit: "5", cursor: "10", status: "Active" }, db);
    expect(db.listGovernanceProposals).toHaveBeenCalledWith({
      limit: 5,
      offset: 10,
      status: "Active",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ next_cursor: null, offset: 10 })
    );
  });

  it("rejects malformed proposal IDs and returns 404 for unknown IDs", async () => {
    const router = createGovernanceRouter(db);
    const malformed = await invokeRoute(router, "/proposals/:id", { params: { id: "0" } });
    expect(malformed.status).toHaveBeenCalledWith(400);

    const missing = await invokeRoute(router, "/proposals/:id", { params: { id: "99" } });
    expect(db.getGovernanceProposal).toHaveBeenCalledWith(99n);
    expect(missing.status).toHaveBeenCalledWith(404);
  });
});
