/**
 * Upload to Supabase Storage using a signed upload URL so we can track bytes sent (ideas §5.2).
 * Matches Storage API: PUT + multipart body with `cacheControl` and file field (empty name).
 */
export function uploadFileViaSignedPut(
  signedUrl: string,
  file: File,
  onProgress: (loadedOfTotalPercent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        reject(
          new Error(
            xhr.responseText?.slice(0, 200) || `Upload failed (${xhr.status})`,
          ),
        );
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", file);

    xhr.open("PUT", signedUrl);
    xhr.send(fd);
  });
}
