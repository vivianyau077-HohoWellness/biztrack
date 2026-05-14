'use client'

import { useState, useRef, useEffect } from 'react'
import { BookOpen, Send, Loader2, FileEdit, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Mode = 'ask' | 'edit'

interface Message {
  role: 'user' | 'assistant'
  content: string
  source?: string
}

interface WikiNode {
  node_token: string
  title: string
}

function DiffView({ before, after }: { before: string; after: string }) {
  const beforeLines = before.split('\n')
  const afterLines  = after.split('\n')
  const maxLen = Math.max(beforeLines.length, afterLines.length)

  return (
    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
      <div>
        <p className="text-xs font-semibold text-red-600 mb-1 uppercase tracking-wide">Before</p>
        <div className="rounded-lg border border-red-200 bg-red-50 overflow-auto max-h-64 p-3 space-y-0.5">
          {beforeLines.map((line, i) => (
            <div key={i} className={line !== (afterLines[i] ?? '') ? 'bg-red-200/60 rounded px-1' : 'px-1'}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-green-600 mb-1 uppercase tracking-wide">After</p>
        <div className="rounded-lg border border-green-200 bg-green-50 overflow-auto max-h-64 p-3 space-y-0.5">
          {afterLines.map((line, i) => (
            <div key={i} className={line !== (beforeLines[i] ?? '') ? 'bg-green-200/60 rounded px-1' : 'px-1'}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function WikiPage() {
  const [mode, setMode] = useState<Mode>('ask')

  // Ask mode state
  const [messages, setMessages]       = useState<Message[]>([])
  const [question, setQuestion]       = useState('')
  const [askLoading, setAskLoading]   = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Edit mode state
  const [wikiNodes, setWikiNodes]         = useState<WikiNode[]>([])
  const [nodesLoading, setNodesLoading]   = useState(false)
  const [selectedNode, setSelectedNode]   = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [editLoading, setEditLoading]     = useState(false)
  const [draft, setDraft] = useState<{ before: string; after: string; nodeToken: string } | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (mode !== 'edit' || wikiNodes.length > 0) return
    setNodesLoading(true)
    fetch('/api/wiki/nodes')
      .then(r => r.json())
      .then(d => setWikiNodes(d.nodes ?? []))
      .catch(() => toast.error('Failed to load wiki pages'))
      .finally(() => setNodesLoading(false))
  }, [mode, wikiNodes.length])

  async function handleAsk() {
    const q = question.trim()
    if (!q || askLoading) return
    setQuestion('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setAskLoading(true)
    try {
      const res = await fetch('/api/wiki/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, source: data.source }])
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to get answer')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setAskLoading(false)
    }
  }

  async function handleGenerateDraft() {
    if (!selectedNode || !editInstruction.trim() || editLoading) return
    setEditLoading(true)
    setDraft(null)
    try {
      const res = await fetch('/api/wiki/edit-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeToken: selectedNode, instruction: editInstruction.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setDraft({ before: data.before, after: data.after, nodeToken: selectedNode })
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate draft')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleApply() {
    if (!draft || applying) return
    setApplying(true)
    try {
      const res = await fetch('/api/wiki/edit-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeToken: draft.nodeToken, content: draft.after }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      toast.success('Wiki updated ✅')
      setDraft(null)
      setEditInstruction('')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to apply edit')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Wiki / SOP Assistant</h1>
          <p className="text-xs text-muted-foreground">Ask questions or edit your Lark Wiki SOPs with AI</p>
        </div>
      </div>

      {/* Mode tabs + panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">

        {/* Left: Mode toggle */}
        <div className="lg:col-span-1 bg-white rounded-xl border p-2 space-y-1">
          <button
            onClick={() => setMode('ask')}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              mode === 'ask' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/60 text-muted-foreground'
            }`}
          >
            <span>🔍</span> Ask SOP
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              mode === 'edit' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/60 text-muted-foreground'
            }`}
          >
            <span>✏️</span> Edit Wiki
          </button>
        </div>

        {/* Right: Content area */}
        <div className="lg:col-span-3 bg-white rounded-xl border flex flex-col" style={{ minHeight: '520px' }}>

          {/* ── Ask SOP mode ── */}
          {mode === 'ask' && (
            <>
              {/* Message history */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '420px' }}>
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Ask anything about your SOPs</p>
                    <p className="text-xs mt-1 opacity-70">e.g. "What is the order packing process?" or "How do we handle returns?"</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.source && (
                        <p className="mt-1.5 text-xs opacity-60 border-t border-current/20 pt-1">
                          Source: {msg.source}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {askLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching wiki…
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-3 flex gap-2">
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                  placeholder="Ask anything about your SOPs…"
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={askLoading}
                />
                <Button size="sm" onClick={handleAsk} disabled={askLoading || !question.trim()} className="gap-1.5">
                  {askLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
              </div>
            </>
          )}

          {/* ── Edit Wiki mode ── */}
          {mode === 'edit' && (
            <div className="flex-1 p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Wiki Page</label>
                {nodesLoading ? (
                  <div className="h-9 rounded-lg border bg-muted/30 animate-pulse" />
                ) : (
                  <div className="relative">
                    <select
                      value={selectedNode}
                      onChange={e => setSelectedNode(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring pr-8"
                    >
                      <option value="">— Select a wiki page —</option>
                      {wikiNodes.map(n => (
                        <option key={n.node_token} value={n.node_token}>{n.title}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Describe the change</label>
                <textarea
                  value={editInstruction}
                  onChange={e => setEditInstruction(e.target.value)}
                  placeholder="e.g. Add a step about double-checking the customer's address before packing…"
                  rows={4}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <Button
                onClick={handleGenerateDraft}
                disabled={editLoading || !selectedNode || !editInstruction.trim()}
                className="gap-2"
              >
                {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileEdit className="h-4 w-4" />}
                {editLoading ? 'Generating…' : 'Generate Edit'}
              </Button>

              {/* Diff view */}
              {draft && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proposed Changes</p>
                  <DiffView before={draft.before} after={draft.after} />
                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleApply} disabled={applying} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                      {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : '✅'}
                      {applying ? 'Saving…' : 'Confirm & Save'}
                    </Button>
                    <Button variant="outline" onClick={() => setDraft(null)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                      ❌ Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
