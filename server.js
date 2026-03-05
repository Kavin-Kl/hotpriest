import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Supermemory from 'supermemory'

const app = express()
const PORT = process.env.PORT || 3001
const SM_KEY = process.env.SUPERMEMORY_API_KEY
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// ─── Initialize Supermemory SDK ───
const client = new Supermemory({ apiKey: SM_KEY })

console.log('─── FLEABOT SERVER STARTING ───')
console.log(`SUPERMEMORY_API_KEY loaded: ${SM_KEY ? `yes (${SM_KEY.slice(0, 8)}...${SM_KEY.slice(-4)})` : 'NO — THIS WILL CAUSE ERRORS'}`)

app.use(cors())
app.use(express.json())

// ══════════════════════════════════════════
// SUPERMEMORY CONNECTORS (Google Drive, Notion)
// ══════════════════════════════════════════

// Create a connection (start OAuth flow)
app.post('/connections/create', async (req, res) => {
  const { userId, provider } = req.body
  if (!userId || !provider) return res.status(400).json({ error: 'userId and provider required' })

  try {
    const connection = await client.connections.create(provider, {
      redirectUrl: `${FRONTEND_URL}?integration=${provider}&status=success`,
      containerTags: [userId],
    })

    console.log(`[CONNECTOR] Created ${provider} connection for user: ${userId}`)
    res.json({ authUrl: connection.authLink, connectionId: connection.id })
  } catch (e) {
    console.error(`[CONNECTOR] Create error (${provider}):`, e.message)
    res.status(500).json({ error: e.message })
  }
})

// List connections for a user
app.post('/connections/list', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const connections = await client.connections.list({
      containerTags: [userId],
    })

    // Normalize to array
    const list = Array.isArray(connections) ? connections : []
    const result = {
      googleDrive: list.some(c => c.provider === 'google-drive'),
      notion: list.some(c => c.provider === 'notion'),
      connections: list.map(c => ({
        id: c.id,
        provider: c.provider,
        email: c.email,
        createdAt: c.createdAt,
      })),
    }
    res.json(result)
  } catch (e) {
    console.error(`[CONNECTOR] List error:`, e.message)
    res.json({ googleDrive: false, notion: false, connections: [] })
  }
})

// Delete a connection by provider for a given user
app.post('/connections/delete', async (req, res) => {
  const { userId, provider } = req.body
  if (!userId || !provider) return res.status(400).json({ error: 'userId and provider required' })

  try {
    // First list connections for this user
    const connections = await client.connections.list({
      containerTags: [userId],
    })

    const list = Array.isArray(connections) ? connections : []
    const target = list.find(c => c.provider === provider)

    if (!target) {
      console.log(`[CONNECTOR] No ${provider} connection found for user: ${userId}`)
      return res.json({ ok: false, error: 'not_found' })
    }

    await client.connections.delete(target.id)
    console.log(`[CONNECTOR] Deleted ${provider} connection for user: ${userId}, id: ${target.id}`)
    res.json({ ok: true, id: target.id })
  } catch (e) {
    console.error(`[CONNECTOR] Delete error (${provider}):`, e.message)
    res.json({ ok: false, error: e.message })
  }
})

// ─── POST /search-docs ───
// Searches connected documents (Drive, Notion, etc.) for relevant content
app.post('/search-docs', async (req, res) => {
  const { userId, query } = req.body
  console.log(`\n[DOCS] userId: ${userId}, query: "${query}"`)

  if (!userId || !query) {
    return res.status(400).json({ error: 'userId and query required' })
  }

  try {
    // Strategy 1: search.documents (searches indexed document chunks)
    console.log(`[DOCS] Trying search.documents...`)
    let results = await client.search.documents({
      q: query,
      includeSummary: true,
      limit: 5,
      // Only search inside this user's space (Drive/Notion, etc.)
      containerTags: [userId],
    })

    console.log(`[DOCS] search.documents — results: ${results.results?.length || 0}, total: ${results.total}`)
    if (results.results?.length) {
      console.log(`[DOCS] First result keys:`, Object.keys(results.results[0]))
      console.log(`[DOCS] First result:`, JSON.stringify(results.results[0]).slice(0, 500))
    }

    // Filter out chat transcripts that we stored as "conversation" metadata
    const filteredDocResults = (results.results || []).filter(r => r.metadata?.type !== 'conversation')

    // If the user explicitly mentions a provider, scope strictly to that provider
    const qLower = (query || '').toLowerCase()
    let providerHint = null
    if (qLower.includes('notion')) providerHint = 'notion'
    else if (qLower.includes('drive')) providerHint = 'drive'

    const providerMatch = (r) => {
      if (!providerHint) return true
      const t = (r.type || '').toString().toLowerCase()
      const ms = (r.metadata?.source || '').toString().toLowerCase()
      const mp = (r.metadata?.provider || '').toString().toLowerCase()

      if (providerHint === 'notion') {
        return t.includes('notion') || ms.includes('notion') || mp.includes('notion')
      }
      if (providerHint === 'drive') {
        return (
          t.includes('drive') || t.includes('google') ||
          ms.includes('drive') || ms.includes('google') ||
          mp.includes('drive') || mp.includes('google')
        )
      }
      return true
    }

    let providerScopedDocs = filteredDocResults
    if (providerHint) {
      providerScopedDocs = filteredDocResults.filter(providerMatch)
    }

    let docs = providerScopedDocs.map(r => {
      const chunkText = (r.chunks || [])
        .filter(c => c.isRelevant !== false)
        .map(c => c.content)
        .join('\n')

      const title = r.title || r.metadata?.title || r.metadata?.fileName || 'untitled'
      let content = chunkText || r.summary || r.content || ''

      // If Supermemory hasn't extracted any text yet, keep the doc so the model at least sees the title
      if (!content || !content.trim()) {
        content = `(document "${title}" has no extracted text yet, but is connected to this user)`
      }

      return {
        content,
        title,
        source: r.type || r.metadata?.source || r.metadata?.provider || 'unknown',
        score: r.score,
      }
    }).filter(d => {
      const lower = d.content.toLowerCase()
      // Heuristic: drop obvious chat logs so we keep real docs
      if (lower.includes('user:') && lower.includes('assistant:')) return false
      return true
    })

    // Strategy 2: if no docs found, try search.memories with chunks+documents
    if (!docs.length) {
      console.log(`[DOCS] No document results, trying search.memories with hybrid mode...`)
      const memResults = await client.search.memories({
        q: query,
        containerTag: userId,
        limit: 10,
        searchMode: 'hybrid',
        include: { chunks: true, documents: true },
      })

      console.log(`[DOCS] search.memories — results: ${memResults.results?.length || 0}`)
      if (memResults.results?.length) {
        console.log(`[DOCS] First memory result keys:`, Object.keys(memResults.results[0]))
        console.log(`[DOCS] First memory result:`, JSON.stringify(memResults.results[0]).slice(0, 500))
      }

      let filteredMemResults = (memResults.results || []).filter(r => r.metadata?.type !== 'conversation')

      if (providerHint) {
        filteredMemResults = filteredMemResults.filter(providerMatch)
      }

      docs = filteredMemResults.flatMap(r => {
        // Extract from chunks (hybrid mode returns chunk results)
        if (r.chunk) {
          return [{ content: r.chunk, title: r.metadata?.title || 'memory chunk', source: 'memory', score: r.similarity }]
        }
        // Extract from associated documents
        if (r.documents?.length) {
          return r.documents.map(d => ({
            content: d.summary || '',
            title: d.title || 'document',
            source: d.type || 'connected',
            score: r.similarity,
          }))
        }
        // Extract from chunks array inside memory results
        if (r.chunks?.length) {
          return r.chunks.map(c => ({
            content: c.content,
            title: r.metadata?.title || 'document',
            source: 'memory-chunk',
            score: c.score,
          }))
        }
        return []
      }).filter(d => {
        if (!d.content) return false
        const lower = d.content.toLowerCase()
        if (lower.includes('user:') && lower.includes('assistant:')) return false
        return true
      })
    }

    // Strategy 3: still nothing? List documents and return high-level overview
    if (!docs.length) {
      console.log(`[DOCS] Still no docs — falling back to documents.list for overview...`)
      try {
        const listed = await client.documents.list({
          containerTags: [userId],
          limit: 20,
        })

        const list = Array.isArray(listed.results) ? listed.results : []

        // Apply the same provider scoping if user mentioned "notion" or "drive"
        const listedScoped = providerHint ? list.filter(providerMatch) : list

        docs = listedScoped.map(d => ({
          title: d.title || d.metadata?.title || d.metadata?.fileName || 'untitled',
          content: d.summary || d.chunks?.[0]?.content || `(document "${d.title || 'untitled'}" is connected to this user)`,
          source: d.type || d.metadata?.source || d.metadata?.provider || 'connected',
          score: d.score ?? 0,
        }))

        console.log(`[DOCS] documents.list fallback — found ${docs.length} docs`)
      } catch (e) {
        console.error(`[DOCS] documents.list fallback error:`, e.message)
      }
    }

    console.log(`[DOCS] Final: ${docs.length} documents with content`)
    res.json({ docs })
  } catch (e) {
    console.error(`[DOCS] ERROR: ${e.message}`)
    res.json({ docs: [] })
  }
})

// ─── GET /debug-docs — test doc search directly ───
app.get('/debug-docs', async (req, res) => {
  const query = req.query.q || 'madiha'
  console.log(`\n[DEBUG] Testing doc search for: "${query}"`)
  try {
    const docResults = await client.search.documents({ q: query, limit: 10, includeSummary: true })
    
    const allDocs = (docResults.results || []).map(r => ({
      title: r.title,
      type: r.type,
      documentId: r.documentId,
      score: r.score,
      metadata: r.metadata,
      chunkPreview: r.chunks?.[0]?.content?.slice(0, 200) || '',
      summaryPreview: r.summary?.slice(0, 200) || '',
    }))

    res.json({ total: docResults.total, count: allDocs.length, results: allDocs })
  } catch (e) {
    console.error(`[DEBUG] ERROR:`, e.message)
    res.json({ error: e.message })
  }
})

// ─── POST /search-memory ───
app.post('/search-memory', async (req, res) => {
  const { userId, query } = req.body
  console.log(`\n[SEARCH] userId: ${userId}, query: "${query}"`)

  if (!userId) {
    console.log('[SEARCH] ERROR: no userId')
    return res.status(400).json({ error: 'userId required' })
  }

  try {
    const data = await client.profile({
      containerTag: userId,
      q: query || '',
    })

    const staticFacts = (data.profile?.static || []).join('\n')
    const dynamicFacts = (data.profile?.dynamic || []).join('\n')

    const parts = []
    if (staticFacts) parts.push(`what i know about you:\n${staticFacts}`)
    if (dynamicFacts) parts.push(`recent context:\n${dynamicFacts}`)

    const context = parts.join('\n\n')
    console.log(`[SEARCH] OK — context length: ${context.length}`)
    res.json({ context })
  } catch (e) {
    console.error(`[SEARCH] ERROR: ${e.message}`)
    res.json({ context: '' })
  }
})

// ─── POST /store-memory ───
app.post('/store-memory', async (req, res) => {
  const { userId, conversationId, content } = req.body
  console.log(`\n[STORE] userId: ${userId}, convId: ${conversationId}, content length: ${content?.length || 0}`)

  if (!userId || !content) {
    console.log('[STORE] ERROR: missing userId or content')
    return res.status(400).json({ error: 'userId and content required' })
  }

  try {
    const data = await client.add({
      content,
      containerTag: userId,
      customId: conversationId || undefined,
      metadata: { type: 'conversation' },
    })

    console.log(`[STORE] OK — doc id: ${data.id}, status: ${data.status}`)
    res.json({ ok: true, id: data.id })
  } catch (e) {
    console.error(`[STORE] ERROR: ${e.message}`)
    res.json({ ok: false, reason: e.message })
  }
})

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err)
})

const server = app.listen(PORT, () => {
  console.log(`\nfleabot backend running on http://localhost:${PORT}`)
  console.log('─── READY ───\n')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use!`)
    console.error('Kill the old process first, or use a different port.')
  } else {
    console.error('Server error:', err)
  }
})

process.stdin.resume()
