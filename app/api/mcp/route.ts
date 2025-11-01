import { NextRequest } from 'next/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './services/mcp-server';

// Ensure Node.js runtime and dynamic responses for streaming
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Singleton transport and server across requests (per process)
let transport: StreamableHTTPServerTransport | undefined;
let connected = false;
let baseUrlForServer: string | undefined;
let serverInitialized = false;

// Simple event emitter for our ServerResponse shim
type Handler = (...args: any[]) => void;
class TinyEmitter {
	private listeners = new Map<string, Handler[]>();
	on(event: string, handler: Handler) {
		const list = this.listeners.get(event) ?? [];
		list.push(handler);
		this.listeners.set(event, list);
	}
	emit(event: string, ...args: any[]) {
		const list = this.listeners.get(event) ?? [];
		for (const h of list) h(...args);
	}
}

// Bridge: minimal Node-like ServerResponse over a Web ReadableStream
function createResponseBridge() {
	const encoder = new TextEncoder();
	const stream = new TransformStream<Uint8Array, Uint8Array>();
	const writer = stream.writable.getWriter();
	const emitter = new TinyEmitter();

	let status = 200;
	const headers = new Headers();
	let headCommitted = false;
	let headResolve: ((value: { status: number; headers: Headers }) => void) | null = null;
	const headPromise = new Promise<{ status: number; headers: Headers }>((resolve) => {
		headResolve = resolve;
	});

	const res = {
		// writeHead(statusCode, headers)
		writeHead: (code: number, hdrs?: Record<string, string>) => {
			if (!headCommitted) {
				status = code;
				if (hdrs) {
					for (const [k, v] of Object.entries(hdrs)) headers.set(k, v);
				}
				headCommitted = true;
				headResolve?.({ status, headers });
			}
			return res; // allow chaining .flushHeaders()
		},
		flushHeaders: () => {
			if (!headCommitted) {
				headCommitted = true;
				headResolve?.({ status, headers });
			}
		},
		write: (chunk: string | Uint8Array) => {
			const data = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
			writer.write(data);
			return true;
		},
		end: (chunk?: string | Uint8Array) => {
			if (chunk) {
				const data = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
				writer.write(data);
			}
			writer.close();
			emitter.emit('close');
		},
		on: (event: 'close' | 'error', handler: Handler) => {
			emitter.on(event, handler);
		},
		// For compatibility with transport expectations
		get readable() {
			return stream.readable;
		},
	} as unknown as {
		writeHead: (code: number, headers?: Record<string, string>) => any;
		flushHeaders: () => void;
		write: (chunk: string | Uint8Array) => boolean;
		end: (chunk?: string | Uint8Array) => void;
		on: (event: 'close' | 'error', handler: Handler) => void;
		readable: ReadableStream<Uint8Array>;
	};

	return { res, headPromise } as const;
}

// Bridge: minimal Node-like IncomingMessage from NextRequest
function createRequestBridge(req: NextRequest) {
	// Convert Fetch Headers to plain object with lower-cased keys
	const plainHeaders: Record<string, string> = {};
	req.headers.forEach((value, key) => {
		// Node lowercases header names
		plainHeaders[key.toLowerCase()] = value;
	});

	const { method } = req;
	return {
		method,
		headers: plainHeaders,
	} as unknown as {
		method: string;
		headers: Record<string, string | string[]>;
	};
}

async function ensureServer(req: NextRequest) {
	if (!transport) {
		transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => crypto.randomUUID(),
		});
	}
	if (!connected) {
		// Base URL from request origin
		const url = new URL(req.url);
		baseUrlForServer = `${url.protocol}//${url.host}`;
		const server = createServer(baseUrlForServer);
		await server.connect(transport);
		connected = true;
		serverInitialized = true;
	}
}

function parseBodySafe(req: NextRequest): Promise<any | undefined> {
	if (req.method !== 'POST') return Promise.resolve(undefined);
	const ct = req.headers.get('content-type') || '';
	if (!ct.includes('application/json')) return Promise.resolve(undefined);
	return req
		.json()
		.catch(() => undefined);
}

export async function GET(req: NextRequest) {
	await ensureServer(req);
	const nodeReq = createRequestBridge(req);
	const { res, headPromise } = createResponseBridge();

	// Call transport with our shims
	// We intentionally don't await handleRequest; we only await headers to return a Response
	transport!.handleRequest(nodeReq as any, res as any).catch((err) => {
		// Best-effort error: send 500 if headers not yet committed
		try {
			(res as any).writeHead?.(500, { 'Content-Type': 'application/json' });
			(res as any).end?.(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Internal Server Error', data: String(err) }, id: null }));
		} catch { /* noop */ }
	});

	const { status, headers } = await headPromise;
	// Basic CORS for browser-based MCP clients/Inspector
	const origin = req.headers.get('origin') ?? '*';
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Vary', 'Origin');
	headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
	return new Response((res as any).readable, { status, headers });
}

export async function POST(req: NextRequest) {
	await ensureServer(req);
	const nodeReq = createRequestBridge(req);
	const parsedBody = await parseBodySafe(req);
	const { res, headPromise } = createResponseBridge();

	transport!.handleRequest(nodeReq as any, res as any, parsedBody).catch((err) => {
		try {
			(res as any).writeHead?.(500, { 'Content-Type': 'application/json' });
			(res as any).end?.(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Internal Server Error', data: String(err) }, id: null }));
		} catch { /* noop */ }
	});

	const { status, headers } = await headPromise;
	// Basic CORS for browser-based MCP clients/Inspector
	const origin = req.headers.get('origin') ?? '*';
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Vary', 'Origin');
	headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
	return new Response((res as any).readable, { status, headers });
}

export async function DELETE(req: NextRequest) {
	await ensureServer(req);
	const nodeReq = createRequestBridge(req);
	const { res, headPromise } = createResponseBridge();

	transport!.handleRequest(nodeReq as any, res as any).catch((err) => {
		try {
			(res as any).writeHead?.(500, { 'Content-Type': 'application/json' });
			(res as any).end?.(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Internal Server Error', data: String(err) }, id: null }));
		} catch { /* noop */ }
	});

	const { status, headers } = await headPromise;
	// Basic CORS for browser-based MCP clients/Inspector
	const origin = req.headers.get('origin') ?? '*';
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Vary', 'Origin');
	headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
	return new Response((res as any).readable, { status, headers });
}

// Respond to CORS preflight
export async function OPTIONS(req: NextRequest) {
	const headers = new Headers();
	const origin = req.headers.get('origin') ?? '*';
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Vary', 'Origin');
	headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
	const requested = req.headers.get('access-control-request-headers');
	const allow = requested && requested.trim().length > 0
		? requested
		: 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version';
	headers.set('Access-Control-Allow-Headers', allow);
	headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
	return new Response(null, { status: 204, headers });
}

