import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LARK_MCP_URL = process.env.LARK_MCP_URL ?? 'https://open.larksuite.com/mcp'
const LARK_APP_TOKEN = process.env.LARK_APP_TOKEN ?? ''

export async function POST(req: NextRequest) {
  try {
    const { nodeToken, content } = await req.json()
    if (!nodeToken || !content?.trim()) {
      return NextResponse.json({ error: 'nodeToken and content are required' }, { status: 400 })
    }

    const mcpServers: Anthropic.Beta.BetaRequestMCPServerURLDefinition[] = [
      {
        type: 'url',
        url: LARK_MCP_URL,
        name: 'lark',
        ...(LARK_APP_TOKEN ? { authorization_token: LARK_APP_TOKEN } : {}),
      },
    ]

    const response = await (client.beta.messages as any).create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: 'You are a wiki editor assistant. Use the lark MCP tools to update the specified wiki page with the provided content.',
      messages: [
        {
          role: 'user',
          content: `Update the Lark Wiki page with node_token: ${nodeToken} with the following content:\n\n${content.trim()}\n\nUse the appropriate Lark MCP write/update tool to save this content.`,
        },
      ],
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: mcpServers,
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[wiki/edit-apply]', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
