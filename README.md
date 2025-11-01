This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## MCP Streamable HTTP Endpoint (SSE)

This template exposes a Model Context Protocol (MCP) server via Streamable HTTP at `POST/GET/DELETE /api/mcp` using Server‑Sent Events (SSE).

- Server implementation: `app/api/mcp/services/mcp-server.ts`
- Route handler (bridge to SSE): `app/api/mcp/route.ts`

### How it works

The route uses the MCP SDK's `StreamableHTTPServerTransport` behind a small bridge that adapts Next.js Fetch Request/Response to the Node HTTP API expected by the transport. The transport manages sessions and SSE streams; the MCP server is connected once and persists across requests.

### Try it locally

1) Start dev server

```bash
npm run dev
```

2) Initialize a session (returns an SSE stream and `mcp-session-id` header):

```bash
curl -N \
	-X POST http://localhost:3000/api/mcp \
	-H 'Accept: application/json, text/event-stream' \
	-H 'Content-Type: application/json' \
	-d '{
		"jsonrpc": "2.0",
		"id": "1",
		"method": "initialize",
		"params": { "clientInfo": { "name": "curl", "version": "0.0.1" }, "protocolVersion": "2025-03-26" }
	}'
```

Save the `mcp-session-id` response header. Subsequent requests should include it and `Mcp-Protocol-Version`.

3) Open a dedicated SSE stream (optional, for notifications):

```bash
curl -N \
	-H 'Accept: text/event-stream' \
	-H 'Mcp-Session-Id: <your-session-id>' \
	-H 'Mcp-Protocol-Version: 2025-03-26' \
	http://localhost:3000/api/mcp
```

4) Call the built-in `add` tool:

```bash
curl -N \
	-X POST http://localhost:3000/api/mcp \
	-H 'Accept: application/json, text/event-stream' \
	-H 'Content-Type: application/json' \
	-H 'Mcp-Session-Id: <your-session-id>' \
	-H 'Mcp-Protocol-Version: 2025-03-26' \
	-d '{
		"jsonrpc": "2.0",
		"id": 2,
		"method": "tools/call",
		"params": { "name": "add", "arguments": { "a": 2, "b": 3 } }
	}'
```

You should receive an SSE event with the JSON‑RPC result containing `{ "result": 5 }`.

5) Close the session (optional):

```bash
curl -X DELETE \
	-H 'Mcp-Session-Id: <your-session-id>' \
	-H 'Mcp-Protocol-Version: 2025-03-26' \
	http://localhost:3000/api/mcp
```

Notes:
- Content negotiation is enforced. POST must accept both `application/json` and `text/event-stream` and send `Content-Type: application/json`.
- The server may also send messages on a standalone SSE GET stream if opened.

### Connecting with MCP Inspector

If you're using the MCP Inspector app (browser/Electron):

- Transport: HTTP (streaming) — not WebSocket
- Server URL: `http://localhost:3000/api/mcp`
- The first request from a browser may show `204 No Content` in the network panel — that's the CORS preflight and is expected.
- Make sure the app is allowed to read the `Mcp-Session-Id` header. This template exposes it via `Access-Control-Expose-Headers` so Inspector can use it for subsequent requests.
- If you see a `400 Bad Request` complaining about a missing `Mcp-Session-Id`, it usually means the session header wasn't forwarded on the next request. Ensure the Inspector is set to HTTP (streaming) and re‑connect.
