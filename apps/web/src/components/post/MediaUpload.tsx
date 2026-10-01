"use client";

import React, { useRef } from "react";
import { MediaItem } from "@/hooks/useMediaUpload";
import { useDragDrop } from "@/hooks/useDragDrop";
import { Image as ImageIcon, X, Loader2, UploadCloud } from "lucide-react";

export interface MediaUploadProps {
  images: MediaItem[];
  onAddImages: (files: FileList | File[]) => void;
  onRemoveImage: (id: string) => void;
  isCompressing?: boolean;
  maxCount?: number;
  error?: string | null;
  maxUploadBytes?: number;
  /**
   * When the parent (e.g. PostComposer) already tracks a drag that started
   * outside this component, pass `true` here to force the drop-zone overlay
   * to be visible without this component needing its own drag events.
   */
  externalIsDragging?: boolean;
}

export function MediaUpload({
  images,
  onAddImages,
  onRemoveImage,
  isCompressing = false,
  maxCount = 4,
  error = null,
  maxUploadBytes,
  externalIsDragging = false,
}: MediaUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMaxReached = images.length >= maxCount;
  const remainingSlots = maxCount - images.length;

  const { isDragging: localIsDragging, dragProps } = useDragDrop({
    onDrop: onAddImages,
    remainingSlots,
    disabled: isCompressing,
  });

  // Show the overlay when either the component itself or the outer wrapper is
  // being dragged over.
  const isDragging = localIsDragging || externalIsDragging;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const sizeLabel =
    maxUploadBytes != null ? ` (max ${(maxUploadBytes / (1024 * 1024)).toFixed(1)}MB)` : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[14px] text-gray-500 font-medium">Optional</label>
        <span className="text-xs text-gray-400">
          {images.length}/{maxCount}
        </span>
      </div>

      {/* Hidden file input — the keyboard-accessible path */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden="true"
      />

      {/* Drop zone — wraps both the button and the preview grid */}
      <div
        {...dragProps}
        data-testid="media-drop-zone"
        aria-label="Image drop zone"
        className={[
          "relative rounded-lg transition-colors",
          isDragging
            ? "border-2 border-dashed border-blue-400 bg-blue-50/60"
            : "border-2 border-dashed border-transparent",
        ].join(" ")}
      >
        {/* "Drop to attach" overlay — visible only while dragging */}
        {isDragging && (
          <div
            aria-live="polite"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-blue-50/80 pointer-events-none"
          >
            <UploadCloud className="h-8 w-8 text-blue-400 mb-1" aria-hidden="true" />
            <span className="text-sm font-medium text-blue-600">Drop to attach</span>
            {remainingSlots < maxCount && (
              <span className="text-xs text-blue-400 mt-0.5">
                {remainingSlots} slot{remainingSlots !== 1 ? "s" : ""} remaining
              </span>
            )}
          </div>
        )}

        {/* Click-to-upload button — keyboard-accessible alternative */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isMaxReached || isCompressing}
          aria-label={isMaxReached ? "Image limit reached" : `Add image${sizeLabel}`}
          className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isCompressing ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-4 w-4 text-gray-500" aria-hidden="true" />
          )}
          <span>Add image{sizeLabel}</span>
        </button>

        {/* Server-reported size limit note */}
        {maxUploadBytes != null && (
          <p className="text-xs text-gray-400 mt-1">
            Files above {(maxUploadBytes / (1024 * 1024)).toFixed(1)}MB are rejected before upload.
            Drag &amp; drop up to {maxCount} images here or use the button above.
          </p>
        )}

        {/* Upload / validation errors */}
        {error && (
          <div
            role="alert"
            className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-200"
          >
            {error}
          </div>
        )}

        {/* Image preview grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt="Upload preview"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                {/* Pending upload overlay */}
                {img.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden="true" />
                  </div>
                )}
                {/* Per-file upload error */}
                {img.error && (
                  <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-1.5 py-1 text-[10px] leading-tight text-white">
                    Upload failed
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveImage(img.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black transition-colors"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
