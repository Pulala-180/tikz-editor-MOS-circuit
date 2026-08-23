import { describe, expect, it } from "vitest";
import {
  attachmentFileNameFor,
  blobToBase64,
  chooseAttachmentMimeType,
  extensionForMimeType,
  fitImageSize,
  normalizePastedImageForAssistant
} from "../packages/app/src/ui/assistant-image-attachments";

describe("assistant-image-attachments", () => {
  it("scales oversized images by max edge while preserving aspect ratio", () => {
    expect(fitImageSize(4096, 1024, 2048)).toEqual({ width: 2048, height: 512 });
    expect(fitImageSize(1024, 4096, 2048)).toEqual({ width: 512, height: 2048 });
    expect(fitImageSize(100, 50, 2048)).toEqual({ width: 100, height: 50 });
  });

  it("always uses PNG for assistant attachments", () => {
    expect(chooseAttachmentMimeType()).toBe("image/png");
  });

  it("maps known mime types to file extensions", () => {
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/webp")).toBe("webp");
    expect(extensionForMimeType("application/octet-stream")).toBe("img");
  });

  it("sanitizes filenames for pasted attachments", () => {
    expect(attachmentFileNameFor(" My Sketch (1).PNG ", "image/png", 0)).toBe("my-sketch-1.png");
    expect(attachmentFileNameFor("", "image/jpeg", 2)).toBe("pasted-image-3.jpg");
  });

  it("encodes blob bytes as base64", async () => {
    const encoded = await blobToBase64(new Blob([Uint8Array.from([102, 111, 111])]));
    expect(encoded).toBe("Zm9v");
  });

  it("falls back safely when DOM image APIs are unavailable", async () => {
    const blob = new Blob(["abc"], { type: "image/png" });
    const file = new File([blob], "Clipboard Sample.png", { type: "image/png" });
    const originalDocument = (globalThis as typeof globalThis & { document?: Document }).document;
    try {
      Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
      const normalized = await normalizePastedImageForAssistant(file, 0);
      expect(normalized.blob).toBe(file);
      expect(normalized.mimeType).toBe("image/png");
      expect(normalized.fileName).toBe("clipboard-sample.png");
    } finally {
      Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
    }
  });
});
