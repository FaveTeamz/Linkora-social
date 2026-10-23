import { act, renderHook, waitFor } from "@testing-library/react";
import { LinkoraClient } from "../../../../../packages/sdk/src/client";
import { useCreatorToken } from "../useCreatorToken";

jest.mock("../../../../../packages/sdk/src/client", () => ({
  LinkoraClient: jest.fn().mockImplementation(() => ({ getProfile: jest.fn() })),
}));

const mockGetProfile = () =>
  (LinkoraClient as jest.MockedClass<typeof LinkoraClient>).mock.results[0].value
    .getProfile as jest.Mock;

describe("useCreatorToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a null token when no wallet address is supplied", async () => {
    const { result } = renderHook(() => useCreatorToken(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.token).toBeNull();
    expect(mockGetProfile()).not.toHaveBeenCalled();
  });

  it("exposes profile lookup failures as an error state", async () => {
    mockGetProfile().mockRejectedValue(new Error("Indexer unavailable"));
    const { result } = renderHook(() => useCreatorToken("GUSER"));

    await waitFor(() => expect(result.current.error?.message).toBe("Indexer unavailable"));
    expect(result.current.token).toBeNull();
  });

  it("rejects minting while creator-token mint support is unavailable", async () => {
    mockGetProfile().mockResolvedValue({ creator_token: "GTOKEN" });
    const { result } = renderHook(() => useCreatorToken("GUSER"));
    await waitFor(() => expect(result.current.token).toBe("GTOKEN"));

    await expect(result.current.mint()).rejects.toThrow("not implemented yet");
  });

  it("updates the balance on a matching token Transfer event", async () => {
    mockGetProfile().mockResolvedValue({ creator_token: "GTOKEN" });
    const { result } = renderHook(() => useCreatorToken("GUSER"));
    await waitFor(() => expect(result.current.token).toBe("GTOKEN"));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("linkora:creator-token-transfer", {
          detail: { tokenAddress: "GTOKEN", recipient: "GUSER", amount: "3" },
        })
      );
    });

    expect(result.current.balance).toBe("3");
  });
});
