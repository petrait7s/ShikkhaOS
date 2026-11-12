import { writeFileSync } from "node:fs";
import { buildSpec, extractRoutes } from "./openapi-lib.mjs";
const routes = extractRoutes();
writeFileSync("docs/api/openapi.yaml", buildSpec(routes));
console.log(`docs/api/openapi.yaml written: ${routes.length} operations`);
