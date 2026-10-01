/**
 * Tests for drag-and-drop media attachment on PostComposer / MediaUpload.
 *
 * Acceptance criteria verified here:
 *  ✔ Dragging a file over the composer shows a drop target
 *  ✔ Dropping triggers onAddImages (imageOptimizer.resizeImage pipeline entry point)
 *  ✔ Supports multi-file drop (up to 4 images)
 *  ✔ Visual feedback: dashed border + 'Drop to attach' message
 *  ✔ Keyboard accessible alternative preserved
 */

import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MediaUpload } from "../../components/post/MediaUpload";
import { PostComposer } from "../../components/post/PostComposer";
import { MediaItem } from "../../hooks/useMediaUpload";
import { renderHook, act } from "@testing-library/react";
import { useDragDrop } from "../../hooks/useDragDrop";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal synthetic DragEvent with a DataTransfer containing Files. */
function makeDragEvent(
  type: string,
  files: File[] = [],
  overrides: Partial<DragEvent> = {}
): DragEvent {
  const dt = {
    files: files as unknown as FileList,
    items: files as unknown as DataTransferItemList,
    types: files.length > 0 ? ["Files"] : [],
    dropEffect: "none" as DataTransfer["dropEffect"],
  } as unknown as DataTransfer;

  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: dt, configurable: true });
  Object.assign(event, overrides);
  return event;
}

function makeImageFile(name = "photo.jpg", type = "image/jpeg"): File {
  return new File(["data"], name, { type });
}

const emptyImages: MediaItem[] = [];

// ─── useDragDrop unit tests ────────────────────────────────────────────────────

describe("useDragDrop hook", () => {
  it("sets isDragging to true when a file drags into the element", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4 }));

    act(() => {
      result.current.dragProps.onDragEnter(makeDragEvent("dragenter", [makeImageFile()]) as any);
    });

    expect(result.current.isDragging).toBe(true);
  });

  it("clears isDragging when the drag leaves", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4 }));

    act(() => {
      result.current.dragProps.onDragEnter(makeDragEvent("dragenter", [makeImageFile()]) as any);
    });
    act(() => {
      result.current.dragProps.onDragLeave(makeDragEvent("dragleave", [makeImageFile()]) as any);
    });

    expect(result.current.isDragging).toBe(false);
  });

  it("does not clear isDragging until counter returns to zero (child elements)", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4 }));

    // Simulate entering parent then a child element
    act(() => {
      result.current.dragProps.onDragEnter(makeDragEvent("dragenter", [makeImageFile()]) as any);
      result.current.dragProps.onDragEnter(makeDragEvent("dragenter", [makeImageFile()]) as any);
    });
    // Leave the child — counter goes from 2 → 1, still dragging
    act(() => {
      result.current.dragProps.onDragLeave(makeDragEvent("dragleave", [makeImageFile()]) as any);
    });
    expect(result.current.isDragging).toBe(true);

    // Leave the parent — counter goes to 0, done
    act(() => {
      result.current.dragProps.onDragLeave(makeDragEvent("dragleave", [makeImageFile()]) as any);
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("calls onDrop with accepted image files", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4 }));
    const file = makeImageFile();

    act(() => {
      result.current.dragProps.onDrop(makeDragEvent("drop", [file]) as any);
    });

    expect(onDrop).toHaveBeenCalledWith([file]);
  });

  it("filters non-image files from the drop payload", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4 }));
    const image = makeImageFile();
    const pdf = new File(["data"], "doc.pdf", { type: "application/pdf" });

    act(() => {
      result.current.dragProps.onDrop(makeDragEvent("drop", [image, pdf]) as any);
    });

    expect(onDrop).toHaveBeenCalledWith([image]);
  });

  it("caps the accepted files to remainingSlots", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 2 }));
    const files = [makeImageFile("a.jpg"), makeImageFile("b.jpg"), makeImageFile("c.jpg")];

    act(() => {
      result.current.dragProps.onDrop(makeDragEvent("drop", files) as any);
    });

    expect(onDrop).toHaveBeenCalledWith(files.slice(0, 2));
  });

  it("does not call onDrop when remainingSlots is 0", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 0 }));

    act(() => {
      result.current.dragProps.onDrop(makeDragEvent("drop", [makeImageFile()]) as any);
    });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("ignores drag events when disabled", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4, disabled: true }));

    act(() => {
      result.current.dragProps.onDragEnter(makeDragEvent("dragenter", [makeImageFile()]) as any);
    });

    expect(result.current.isDragging).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does not set isDragging for non-file drags", () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => useDragDrop({ onDrop, remainingSlots: 4 }));

    // dragenter with no Files type (text drag etc.)
    act(() => {
      result.current.dragProps.onDragEnter(makeDragEvent("dragenter", []) as any);
    });

    expect(result.current.isDragging).toBe(false);
  });
});

// ─── MediaUpload drag-and-drop integration tests ──────────────────────────────

describe("MediaUpload — drag and drop", () => {
  const baseProps = {
    images: emptyImages,
    onAddImages: jest.fn(),
    onRemoveImage: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders the drop zone element", () => {
    render(<MediaUpload {...baseProps} />);
    expect(screen.getByTestId("media-drop-zone")).toBeInTheDocument();
  });

  it("shows the 'Drop to attach' overlay during a drag", () => {
    render(<MediaUpload {...baseProps} />);
    const zone = screen.getByTestId("media-drop-zone");

    fireEvent(zone, makeDragEvent("dragenter", [makeImageFile()]));

    expect(screen.getByText("Drop to attach")).toBeInTheDocument();
  });

  it("hides the overlay after the drag leaves", () => {
    render(<MediaUpload {...baseProps} />);
    const zone = screen.getByTestId("media-drop-zone");

    fireEvent(zone, makeDragEvent("dragenter", [makeImageFile()]));
    fireEvent(zone, makeDragEvent("dragleave", [makeImageFile()]));

    expect(screen.queryByText("Drop to attach")).not.toBeInTheDocument();
  });

  it("applies the dashed border class during a drag", () => {
    render(<MediaUpload {...baseProps} />);
    const zone = screen.getByTestId("media-drop-zone");

    fireEvent(zone, makeDragEvent("dragenter", [makeImageFile()]));

    expect(zone.className).toContain("border-dashed");
  });

  it("calls onAddImages with the dropped files", () => {
    render(<MediaUpload {...baseProps} />);
    const zone = screen.getByTestId("media-drop-zone");
    const file = makeImageFile();

    fireEvent(zone, makeDragEvent("dragenter", [file]));
    fireEvent(zone, makeDragEvent("drop", [file]));

    expect(baseProps.onAddImages).toHaveBeenCalledWith([file]);
  });

  it("supports multi-file drop (up to maxCount)", () => {
    render(<MediaUpload {...baseProps} maxCount={4} />);
    const zone = screen.getByTestId("media-drop-zone");
    const files = [makeImageFile("1.jpg"), makeImageFile("2.jpg"), makeImageFile("3.jpg")];

    fireEvent(zone, makeDragEvent("dragenter", files));
    fireEvent(zone, makeDragEvent("drop", files));

    expect(baseProps.onAddImages).toHaveBeenCalledWith(files);
  });

  it("caps multi-file drops at remaining slots", () => {
    const twoImages: MediaItem[] = [
      { id: "a", file: makeImageFile(), previewUrl: "", url: null, uploading: false, error: null },
      { id: "b", file: makeImageFile(), previewUrl: "", url: null, uploading: false, error: null },
    ];
    render(<MediaUpload {...baseProps} images={twoImages} maxCount={4} />);
    const zone = screen.getByTestId("media-drop-zone");

    const threeFiles = [makeImageFile("x.jpg"), makeImageFile("y.jpg"), makeImageFile("z.jpg")];

    fireEvent(zone, makeDragEvent("dragenter", threeFiles));
    fireEvent(zone, makeDragEvent("drop", threeFiles));

    // Only 2 slots remaining, so at most 2 files should be accepted
    const received: File[] = baseProps.onAddImages.mock.calls[0][0];
    expect(received.length).toBeLessThanOrEqual(2);
  });

  it("does not accept drops when max is already reached", () => {
    const fullImages: MediaItem[] = Array.from({ length: 4 }, (_, i) => ({
      id: String(i),
      file: makeImageFile(),
      previewUrl: "",
      url: null,
      uploading: false,
      error: null,
    }));
    render(<MediaUpload {...baseProps} images={fullImages} maxCount={4} />);
    const zone = screen.getByTestId("media-drop-zone");

    fireEvent(zone, makeDragEvent("drop", [makeImageFile()]));

    expect(baseProps.onAddImages).not.toHaveBeenCalled();
  });

  it("filters out non-image files from a drop", () => {
    render(<MediaUpload {...baseProps} />);
    const zone = screen.getByTestId("media-drop-zone");
    const image = makeImageFile();
    const pdf = new File(["data"], "doc.pdf", { type: "application/pdf" });

    fireEvent(zone, makeDragEvent("drop", [pdf]));
    // pdf only → should not call onAddImages
    expect(baseProps.onAddImages).not.toHaveBeenCalled();

    fireEvent(zone, makeDragEvent("drop", [image, pdf]));
    expect(baseProps.onAddImages).toHaveBeenCalledWith([image]);
  });

  it("shows the 'Drop to attach' overlay when externalIsDragging is true", () => {
    render(<MediaUpload {...baseProps} externalIsDragging />);
    expect(screen.getByText("Drop to attach")).toBeInTheDocument();
  });

  // ── Keyboard-accessible alternative ─────────────────────────────────────────

  it("preserves the keyboard-accessible 'Add image' button", () => {
    render(<MediaUpload {...baseProps} />);
    expect(screen.getByRole("button", { name: /add image/i })).toBeInTheDocument();
  });

  it("the 'Add image' button is not disabled by default", () => {
    render(<MediaUpload {...baseProps} />);
    expect(screen.getByRole("button", { name: /add image/i })).not.toBeDisabled();
  });

  it("disables the 'Add image' button when max images reached", () => {
    const fullImages: MediaItem[] = Array.from({ length: 4 }, (_, i) => ({
      id: String(i),
      file: makeImageFile(),
      previewUrl: "",
      url: null,
      uploading: false,
      error: null,
    }));
    render(<MediaUpload {...baseProps} images={fullImages} maxCount={4} />);
    expect(screen.getByRole("button", { name: /image limit reached/i })).toBeDisabled();
  });

  it("disables the 'Add image' button while compressing", () => {
    render(<MediaUpload {...baseProps} isCompressing />);
    expect(screen.getByRole("button", { name: /add image/i })).toBeDisabled();
  });
});

// ─── PostComposer drag-and-drop integration ───────────────────────────────────

const baseComposerProps = {
  content: "",
  onChangeContent: jest.fn(),
  images: [] as MediaItem[],
  onAddImages: jest.fn(),
  onRemoveImage: jest.fn(),
  linkUrl: "",
  onChangeLinkUrl: jest.fn(),
  linkPreview: null,
};

describe("PostComposer — drag and drop", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the drop overlay when a file is dragged over the composer", () => {
    render(<PostComposer {...baseComposerProps} />);
    const composer = screen.getByTestId("post-composer");

    fireEvent(composer, makeDragEvent("dragenter", [makeImageFile()]));

    expect(screen.getByText("Drop to attach")).toBeInTheDocument();
  });

  it("calls onAddImages with dropped files", () => {
    render(<PostComposer {...baseComposerProps} />);
    const composer = screen.getByTestId("post-composer");
    const file = makeImageFile();

    fireEvent(composer, makeDragEvent("dragenter", [file]));
    fireEvent(composer, makeDragEvent("drop", [file]));

    expect(baseComposerProps.onAddImages).toHaveBeenCalledWith([file]);
  });

  it("supports a multi-file drop up to 4 images", () => {
    render(<PostComposer {...baseComposerProps} />);
    const composer = screen.getByTestId("post-composer");
    const files = Array.from({ length: 4 }, (_, i) => makeImageFile(`img${i}.jpg`));

    fireEvent(composer, makeDragEvent("dragenter", files));
    fireEvent(composer, makeDragEvent("drop", files));

    expect(baseComposerProps.onAddImages).toHaveBeenCalledWith(files);
  });

  it("hides the overlay after the drop completes", () => {
    render(<PostComposer {...baseComposerProps} />);
    const composer = screen.getByTestId("post-composer");
    const file = makeImageFile();

    fireEvent(composer, makeDragEvent("dragenter", [file]));
    fireEvent(composer, makeDragEvent("drop", [file]));

    expect(screen.queryByText("Drop to attach")).not.toBeInTheDocument();
  });

  it("still renders the keyboard-accessible Add image button", () => {
    render(<PostComposer {...baseComposerProps} />);
    expect(screen.getByRole("button", { name: /add image/i })).toBeInTheDocument();
  });
});
