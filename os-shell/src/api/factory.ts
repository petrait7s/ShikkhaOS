import type { Repos } from "./repositories";
import { mockRepos } from "./mock/repos";

export function getRepos(): Repos {
  const mode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
  if (mode === "mock") return mockRepos;
  throw new Error("NEXT_PUBLIC_API_MODE=http is not implemented in Phase 1. See docs/PHASE2-BACKEND-MAP.md.");
}

export const repos: Repos = getRepos();
