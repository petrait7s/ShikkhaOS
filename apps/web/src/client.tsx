"use client";
import * as React from "react";
import { ApiClient } from "@shikkhaos/api-client";
import { App } from "@shikkhaos/screens";

function deviceId(): string {
  try { let id = localStorage.getItem("sos.deviceId"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("sos.deviceId", id); } return id; } catch { return crypto.randomUUID(); }
}

export default function Client() {
  const api = React.useMemo(() => new ApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1", platform: "web", deviceId: deviceId() }), []);
  return <App api={api} platform={{ kind: "web", version: process.env.NEXT_PUBLIC_APP_VERSION?.slice(0, 12), mode: process.env.NEXT_PUBLIC_API_MODE || "live" }} router="browser" />;
}
