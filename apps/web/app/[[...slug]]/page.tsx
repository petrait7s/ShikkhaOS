"use client";
import dynamic from "next/dynamic";

// The authenticated app is a client-side SPA (routes are handled by react-router); no private data is rendered on the server.
const Client = dynamic(() => import("../../src/client"), { ssr: false });
export default function Page() { return <Client />; }
