// docs/architecture.md §5 — local filesystem for the POC, swappable for
// cloud storage later without touching any caller.
export interface StorageProvider {
  save(blob: Blob, contentType: string): Promise<string /* ref */>;
  load(ref: string): Promise<Blob>;
  delete(ref: string): Promise<void>;
}
