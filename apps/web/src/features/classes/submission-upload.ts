export function uploadToPresignedUrl(
  file: File,
  uploadUrl: string,
  requiredHeaders: Record<string, string>,
  onProgress: (uploadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [name, value] of Object.entries(requiredHeaders)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(Math.min(event.loaded, file.size));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else reject(new Error("The storage service rejected the upload. Request a new upload and try again."));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));
    xhr.send(file);
  });
}

export function aggregateUploadPercentage(completedBytes: number, currentBytes: number, totalBytes: number) {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.round(((completedBytes + currentBytes) / totalBytes) * 100));
}
