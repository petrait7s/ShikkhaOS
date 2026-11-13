import type { Repos } from "./repositories";
import { mockRepos } from "./mock/repos";
import { httpRepos } from "./http/repos";

export function getRepos(): Repos {
  const mode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
  if (mode === "mock") return mockRepos;
  if (mode === "http") return httpRepos;
  throw new Error(`Unknown NEXT_PUBLIC_API_MODE "${mode}" (use "mock" or "http").`);
}

export const repos: Repos = getRepos();
