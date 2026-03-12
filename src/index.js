// src/index.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const SessionManager = require('./session-manager');
const createMcpTools = require('./mcp-server');

const manager = new SessionManager({
  timeoutMs: 30 * 60 * 1000, // 30 min inactivity timeout
  maxSessions: 5,
});
const tools = createMcpTools(manager);

const server = new McpServer({
  name: 'visualizer',
  version: '0.1.0',
});

server.tool(
  'launch_session',
  'Start a visualization session. Opens an HTTP server and returns a URL for the browser. Sessions are ephemeral — they live only as long as this MCP server process.',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.launch_session()) }]
  })
);

server.tool(
  'push_screen',
  'Push HTML content to the browser. Fragments are auto-wrapped in a themed frame. Full documents (starting with <!DOCTYPE or <html) are served as-is. Clears previous user events.',
  {
    session_id: z.string().describe('Session ID from launch_session'),
    html: z.string().describe('HTML content — fragment or full document')
  },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.push_screen(args)) }]
  })
);

server.tool(
  'get_events',
  'Read user interactions from the browser (clicks on [data-choice] elements). Returns events since last screen push, or since a given timestamp. Use clear=true to consume events so they are not returned again.',
  {
    session_id: z.string().describe('Session ID'),
    since: z.number().optional().describe('Only return events after this Unix timestamp (ms)'),
    clear: z.boolean().optional().describe('Clear returned events after reading (default: false)')
  },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.get_events(args)) }]
  })
);

server.tool(
  'list_sessions',
  'List all active visualization sessions with their URLs and status.',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.list_sessions()) }]
  })
);

server.tool(
  'close_session',
  'Stop a visualization session and clean up its HTTP server.',
  { session_id: z.string().describe('Session ID to close') },
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await tools.close_session(args)) }]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
