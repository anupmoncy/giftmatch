import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createGiftMatchMcpServer } from '../mcp/index';

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  headersSent?: boolean;
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string | string[]): void;
  json(body: unknown): void;
  end(body?: string): void;
};

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', [
    'Content-Type',
    'Authorization',
    'mcp-session-id',
    'mcp-protocol-version',
  ]);
  res.setHeader('Access-Control-Expose-Headers', ['mcp-session-id', 'mcp-protocol-version']);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
    return;
  }

  const server = createGiftMatchMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req as never, res as never, req.body);
  } catch (error) {
    console.error('MCP request failed', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
