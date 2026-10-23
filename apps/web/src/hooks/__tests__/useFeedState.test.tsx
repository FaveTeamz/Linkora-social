import { act, renderHook, waitFor } from "@testing-library/react";
import { useFeedState } from "../useFeedState";

describe("useFeedState", () => {
  it("starts with the documented defaults and loads the first page", async () => {
    const { result } = renderHook(() => useFeedState());

    expect(result.current.filter).toEqual({ type: "all" });
    expect(result.current.sortOrder).toBe("newest");
    expect(result.current.cursor).toBe(0);
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });

  it("updates the filter and derives the visible posts from it", async () => {
    const { result } = renderHook(() => useFeedState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setFilter({ type: "trending", minLikes: 5 }));

    expect(result.current.filter).toEqual({ type: "trending", minLikes: 5 });
    await waitFor(() => expect(result.current.posts.map((post) => post.id)).toEqual(["3", "1"]));
  });

  it("updates the page cursor and loads the selected page", async () => {
    const { result } = renderHook(() => useFeedState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setCursor(1));

    expect(result.current.cursor).toBe(1);
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.posts).toHaveLength(3);
  });

  it("refreshes the first page and settles its loading state", async () => {
    const { result } = renderHook(() => useFeedState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.refresh());
    expect(result.current.isRefreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.isRefreshing).toBe(false);
    });
    expect(result.current.posts).toHaveLength(3);
    expect(result.current.error).toBeNull();
  });
});
