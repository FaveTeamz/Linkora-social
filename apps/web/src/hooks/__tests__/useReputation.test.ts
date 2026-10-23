import { act, renderHook, waitFor } from "@testing-library/react";
import { ReputationData, useReputation } from "../useReputation";

const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const reputation: ReputationData = {
  user_address: address,
  score: 725,
  posts_count: 12,
  tips_sent: 3,
  tips_received: 9,
  governance_votes: 4,
  last_computed_at: "2026-10-21T00:00:00.000Z",
  updated_ledger: 120,
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("useReputation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns null and does not fetch when the address is null", async () => {
    const { result } = renderHook(() => useReputation(null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reputation).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sets isLoading while the request is pending", async () => {
    let resolveRequest!: (value: Response) => void;
    mockFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { result } = renderHook(() => useReputation(address));
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveRequest({ ok: true, json: async () => reputation } as Response);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("populates reputation when the request succeeds", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => reputation } as Response);

    const { result } = renderHook(() => useReputation(address));

    await waitFor(() => expect(result.current.reputation).toEqual(reputation));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/profiles/${address}/reputation`),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("sets an error and clears reputation when the request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

    const { result } = renderHook(() => useReputation(address));

    await waitFor(() => expect(result.current.error).toBe("Unable to load reputation (503)"));
    expect(result.current.reputation).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
