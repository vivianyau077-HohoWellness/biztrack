import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LARK_MCP_URL = process.env.LARK_MCP_URL ?? 'https://open.larksuite.com/mcp'
const LARK_APP_TOKEN = process.env.LARK_APP_TOKEN ?? ''

export async function POST(req: NextRequest) {
  try {
    const { nodeToken, instruction } = await req.json()
    if (!nodeToken || !instruction?.trim()) {
      return NextResponse.json({ error: 'nodeToken and instruction are required' }, { status: 400 })
    }

    const mcpServers: Anthropic.Beta.BetaRequestMCPServerURLDefinition[] = [
      {
        type: 'url',
        url: LARK_MCP_URL,
        name: 'lark',
        ...(LARK_APP_TOKEN ? { authorization_token: LARK_APP_TOKEN } : {}),
      },
    ]

    // Step 1: Fetch current page content via AI + Lark MCP
    const fetchResponse = await (client.beta.messages as any).create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are a wiki editor assistant. Use the lark MCP tools to fetch the raw text content of the specified wiki page. Return ONLY the raw page content, nothing else.',
      messages: [
        {
          role: 'user',
          content: `Fetch the full text content of the wiki page with node_token: ${nodeToken}. Use lark:docx_v1_document_rawContent or lark:wiki_v2_space_getNode to retrieve it. Return only the raw page text.`,
        },
      ],
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: mcpServers,
    })

    let originalContent = ''
    for (const block of fetchResponse.content) {
      if (block.type === 'text') originalContent += block.text
    }
    originalContent = originalContent.trim()

    // Step 2: Generate proposed edit
    const editResponse = await (client.beta.messages as any).create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are a wiki editor assistant for Hoho Wellness SOPs. Apply the requested change to the wiki content. Return ONLY the full updated content, no commentary or markdown code fences.',
      messages: [
        {
          role: 'user',
          content: `Current wiki content:\n\n${originalContent}\n\n---\n\nRequested change: ${instruction.trim()}\n\nReturn the complete updated content with the change applied.`,
        },
      ],
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: mcpServers,
    })

    let proposedContent = ''
    for (const block of editResponse.content) {
      if (block.type === 'text') proposedContent += block.text
    }
    proposedContent = proposedContent.trim()

    return NextResponse.json({ before: originalContent, after: proposedContent })
  } catch (e: any) {
    console.error('[wiki/edit-draft]', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
