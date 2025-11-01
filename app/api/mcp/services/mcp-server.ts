import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Create server instance factory
export const createServer = (baseUrl: string) => {
    const server = new McpServer({
        name: "bascic-mcp-server",
        version: "1.0.0",
        capabilities: {
            resources: {},
            tools: {},
            logging: {}
        },
    });

    // Add a dynamic greeting resource
    server.registerResource(
        'greeting',
        new ResourceTemplate('greeting://{name}', { list: undefined }),
        {
            title: 'Greeting Resource', // Display name for UI
            description: 'Dynamic greeting generator'
        },
        async (uri, { name }) => ({
            contents: [
                {
                    uri: uri.href,
                    text: `Hello, ${name}!`
                }
            ]
        })
    );

    // Add an addition tool
    server.registerTool(
        'add',
        {
            title: 'Addition Tool',
            description: 'Add two numbers',
            inputSchema: { a: z.number(), b: z.number() },
            outputSchema: { result: z.number() }
        },
        async ({ a, b }) => {
            const output = { result: a + b };
            return {
                content: [
                    { type: 'text', text: JSON.stringify(output) },
                    // Provide a link to open the Apps SDK UI in a browser or webview
                    { type: 'text', text: `Open UI: ${baseUrl}/app` }
                ],
                structuredContent: output
            };
        }
    );

    console.log('MCP Server instance created with resources and tools');
    return server;
};