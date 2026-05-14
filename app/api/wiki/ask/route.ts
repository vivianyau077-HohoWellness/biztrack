import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LARK_MCP_URL = process.env.LARK_MCP_URL ?? 'https://open.larksuite.com/mcp'
const LARK_APP_TOKEN = process.env.LARK_APP_TOKEN ?? ''

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json()
    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
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
      max_tokens: 1024,
      system: 'You are a BizOS SOP assistant for Hoho Wellness. Answer based only on the Lark Wiki content provided. If the answer is not in the wiki, say so clearly. When citing information, mention the wiki page title.',
      messages: [{ role: 'user', content: question.trim() }],
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: mcpServers,
    })

    // Extract text content from response
    let answer = ''
    let source: string | undefined

    for (const block of response.content) {
      if (block.type === 'text') {
        answer += block.text
      } else if (block.type === 'tool_result') {
        // Extract source page title from MCP tool results if available
        const resultContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
        const titleMatch = resultContent.match(/"title"\s*:\s*"([^"]+)"/)
        if (titleMatch) source = titleMatch[1]
      }
    }

    if (!answer) answer = 'I could not find relevant information in the wiki for your question.'

    return NextResponse.json({ answer, source })
  } catch (e: any) {
    console.error('[wiki/ask]', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
