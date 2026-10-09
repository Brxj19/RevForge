/**
 * F8: downloads go through a Blob with an explicit type, and the object URL is revoked only after a
 * delay — revoking right after click() can cancel the download in some browsers.
 */
export const REVOKE_DELAY_MS = 30_000;

export function downloadBlob(
  data: BlobPart,
  filename: string,
  type: string,
): void {
  // Re-wrap so the declared type is ours, never one sniffed from the content.
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export const TEXT_TYPE = "text/plain;charset=utf-8";
export const BINARY_TYPE = "application/octet-stream";
