"use client";

import { useState, useCallback, useRef, DragEvent } from "react";

export interface UseDragDropOptions {
  /** Called with the accepted image files after a successful drop. */
  onDrop: (files: File[]) => void;
  /** Maximum number of additional images that may still be attached. */
  remainingSlots: number;
  /** When true the drop zone is inactive (e.g. compressing or uploading). */
  disabled?: boolean;
}

export interface UseDragDropResult {
  /** True while an acceptable drag is hovering over the registered element. */
  isDragging: boolean;
  /** Bind to the outer wrapper element that should act as the drop zone. */
  dragProps: {
    onDragEnter: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
}

/**
 * Provides drag-and-drop file handling for the post composer.
 *
 * – Filters dropped items to image/* files only.
 * – Respects `remainingSlots` so the multi-file drop never exceeds the 4-image
 *   cap enforced by useMediaUpload.
 * – Uses a `dragCounter` ref instead of a boolean flag so that entering a child
 *   element does not erroneously clear the "is-dragging" state.
 */
export function useDragDrop({
  onDrop,
  remainingSlots,
  disabled = false,
}: UseDragDropOptions): UseDragDropResult {
  const [isDragging, setIsDragging] = useState(false);
  // Counter-based approach: each DragEnter increments, each DragLeave decrements.
  // isDragging is true whenever the counter is > 0, preventing flicker when the
  // pointer moves over a child element.
  const dragCounter = useRef(0);

  const containsFiles = (e: DragEvent): boolean => {
    if (!e.dataTransfer) return false;
    return Array.from(e.dataTransfer.types).includes("Files");
  };

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || !containsFiles(e)) return;
      dragCounter.current += 1;
      if (dragCounter.current === 1) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || !containsFiles(e)) return;
      // Keep the drop-effect icon correct.
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = remainingSlots > 0 ? "copy" : "none";
      }
    },
    [disabled, remainingSlots]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounter.current -= 1;
      if (dragCounter.current === 0) setIsDragging(false);
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      if (disabled || remainingSlots <= 0) return;

      const droppedFiles = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );

      if (droppedFiles.length === 0) return;

      // Respect the remaining slot budget so the consumer does not need to
      // double-check the count limit.
      const accepted = droppedFiles.slice(0, remainingSlots);
      onDrop(accepted);
    },
    [disabled, remainingSlots, onDrop]
  );

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
