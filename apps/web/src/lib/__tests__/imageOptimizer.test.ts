import { generateLQIP, resizeImage } from "../imageOptimizer";

describe("imageOptimizer", () => {
  const context = { drawImage: jest.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => context),
    toBlob: jest.fn((callback: BlobCallback, type = "image/png") => {
      callback(new Blob(["optimized"], { type }));
    }),
    toDataURL: jest.fn(() => "data:image/webp;base64,placeholder"),
  } as unknown as HTMLCanvasElement;
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    context.drawImage.mockClear();
    canvas.getContext = jest.fn(() => context) as typeof canvas.getContext;
    canvas.toBlob = jest.fn((callback: BlobCallback, type = "image/png") => {
      callback(new Blob(["optimized"], { type }));
    }) as typeof canvas.toBlob;
    canvas.toDataURL = jest.fn(() => "data:image/webp;base64,placeholder");

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: class MockImage {
        naturalWidth = 4_000;
        naturalHeight = 2_000;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          this.onload?.();
        }
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:mock-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      return tagName === "canvas" ? canvas : originalCreateElement(tagName);
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => {
    Object.defineProperty(globalThis, "Image", { configurable: true, value: originalImage });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("resizes within the maximum dimension while preserving aspect ratio", async () => {
    const file = new File(["source"], "photo.png", { type: "image/png" });

    const resized = await resizeImage(file, { maxDimension: 1_000 });

    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1_000, 500);
    expect(resized).not.toBe(file);
    expect(resized.type).toBe("image/png");
  });

  it("returns a data URI for the low-quality placeholder", async () => {
    const file = new File(["source"], "photo.png", { type: "image/png" });

    await expect(generateLQIP(file)).resolves.toMatch(/^data:image\/webp;base64,/);
    expect(canvas.width).toBe(20);
    expect(canvas.height).toBe(10);
  });
});
