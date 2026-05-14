import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LARK_MCP_URL = process.env.LARK_MCP_URL ?? 'https://open.larksuite.com/mcp'
const LARK_APP_TOKEN = process.env.LARK_APP_TOKEN ?? ''

export async function GET(_req: NextRequest) {
  try {
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
      max_tokens: 1024,
      system: 'You are a wiki assistant. Use the lark MCP tools to list all available wiki pages/nodes. Return a JSON array of objects with node_token and title fields only. Return only valid JSON, no other text.',
      messages: [
        {
          role: 'user',
          content: 'List all wiki nodes/pages available using lark:wiki_v1_node_search or similar tools. Return a JSON array: [{"node_token": "...", "title": "..."}]',
        },
      ],
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: mcpServers,
    })

    let raw = ''
    for (const block of response.content) {
      if (block.type === 'text') raw += block.text
    }

    let nodes: { node_token: string; title: string }[] = []
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonMatch) nodes = JSON.parse(jsonMatch[0])
    } catch {
      nodes = []
    }

    return NextResponse.json({ nodes })
  } catch (e: any) {
    console.error('[wiki/nodes]', e)
    return NextResponse.json({ nodes: [] })
  }
}
