import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { findGifts } from '../src/services/findGifts.js';

const findGiftsInput = {
  recipient: z.string().min(1).describe('Who the gift is for'),
  personality: z.string().min(1).describe('Recipient personality or vibe'),
  budget: z.string().min(1).describe('Budget range, for example 25-50 or under-25'),
  freeText: z.string().optional().default('').describe('Additional recipient details'),
};

export function createGiftMatchMcpServer() {
  const server = new McpServer({
    name: 'giftmatch',
    version: '0.1.0',
  });

  server.registerTool(
    'find_gifts',
    {
      title: 'Find gifts',
      description: 'Find GiftMatch recommendations from quiz answers.',
      inputSchema: findGiftsInput,
    },
    async (answers) => {
      const result = await findGifts(answers);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

async function main() {
  const server = createGiftMatchMcpServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
