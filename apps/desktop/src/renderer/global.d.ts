declare const __API_BASE_URL__: string;
declare const __API_MODE__: string;
interface UpdaterState { status: "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "none"; version?: string; percent?: number; message?: string }
interface Window {
  shikkhaos?: {
    secureStore: { get(): Promise<string | null>; set(v: string | null): Promise<void> };
    notify(title: string, body: string): void;
    version(): Promise<string>;
    onMenu(cb: (action: string) => void): () => void;
    updater: { check(): Promise<void>; install(): Promise<void>; onState(cb: (s: UpdaterState) => void): () => void };
  };
}
