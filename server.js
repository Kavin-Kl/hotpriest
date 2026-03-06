import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import MemoryClient from 'mem0ai'
import { google } from 'googleapis'
import { Client as NotionClient } from '@notionhq/client'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, '.fleabot-cache')

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// ─── Mem0 Client ───
const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY,
  projectId: process.env.MEM0_PROJECT_ID || undefined,
  organizationId: process.env.MEM0_ORG_ID || undefined,
})

// ─── Google OAuth2 Client ───
// Redirect URI must EXACTLY match what's in Google Cloud Console
const GOOGLE_REDIRECT_URI = 'http://localhost:5173/'
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
)
console.log(`[GOOGLE] Redirect URI: ${GOOGLE_REDIRECT_URI}`)

// ─── Persistent cache helpers ───
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })

function readCache(filename) {
  const fp = path.join(CACHE_DIR, filename)
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { return null }
}

function writeCache(filename, data) {
  const fp = path.join(CACHE_DIR, filename)
  fs.writeFileSync(fp, JSON.stringify(data), 'utf-8')
}

function deleteCache(filename) {
  const fp = path.join(CACHE_DIR, filename)
  try { fs.unlinkSync(fp) } catch {}
}

// Token store — persisted to disk
const userTokens = {
  googleDrive: readCache('tokens_drive.json') || {},
  notion: readCache('tokens_notion.json') || {},
}

function saveTokens() {
  writeCache('tokens_drive.json', userTokens.googleDrive)
  writeCache('tokens_notion.json', userTokens.notion)
}

console.log('─── FLEABOT SERVER STARTING ───')
console.log(`MEM0_API_KEY loaded: ${process.env.MEM0_API_KEY ? 'yes' : 'NO'}`)
console.log(`GOOGLE_CLIENT_ID loaded: ${process.env.GOOGLE_CLIENT_ID ? 'yes' : 'NO'}`)

app.use(cors())
app.use(express.json())

// ══════════════════════════════════════════
// GOOGLE DRIVE INTEGRATION (direct OAuth2)
// ══════════════════════════════════════════

// Start Google Drive OAuth flow
app.post('/connections/create', async (req, res) => {
  const { userId, provider } = req.body
  if (!userId || !provider) return res.status(400).json({ error: 'userId and provider required' })

  try {
    if (provider === 'google-drive') {
      const scopes = ['https://www.googleapis.com/auth/drive.readonly']
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: JSON.stringify({ userId, provider: 'google-drive' }),
        prompt: 'consent',
      })
      console.log(`[DRIVE] Generated OAuth URL for user: ${userId}`)
      return res.json({ authUrl })
    }

    if (provider === 'notion') {
      // For Notion, we use the public integration approach
      // User provides their Notion integration token via the frontend
      // The frontend will call /connections/notion/token directly
      const notionOAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(FRONTEND_URL + '?integration=notion&status=success')}&state=${userId}`
      console.log(`[NOTION] Generated OAuth URL for user: ${userId}`)
      return res.json({ authUrl: notionOAuthUrl })
    }

    return res.status(400).json({ error: `Unknown provider: ${provider}` })
  } catch (e) {
    console.error(`[CONNECTOR] Create error (${provider}):`, e.message)
    res.status(500).json({ error: e.message })
  }
})

// Google Drive OAuth callback - exchange code for tokens
app.post('/connections/google-drive/callback', async (req, res) => {
  const { userId, code } = req.body
  if (!userId || !code) return res.status(400).json({ error: 'userId and code required' })

  try {
    const { tokens } = await oauth2Client.getToken(code)
    userTokens.googleDrive[userId] = tokens
    saveTokens()
    console.log(`[DRIVE] Tokens stored for user: ${userId}`)

    // Trigger async document ingestion
    ingestGoogleDriveDocuments(userId, tokens).catch(e =>
      console.error(`[DRIVE] Ingestion error for ${userId}:`, e.message)
    )

    res.json({ ok: true })
  } catch (e) {
    console.error(`[DRIVE] Token exchange error:`, e.message)
    res.status(500).json({ error: e.message })
  }
})

// Notion OAuth callback - exchange code for access token
app.post('/connections/notion/callback', async (req, res) => {
  const { userId, code } = req.body
  if (!userId || !code) return res.status(400).json({ error: 'userId and code required' })

  try {
    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${FRONTEND_URL}?integration=notion&status=success`,
      }),
    })
    const data = await response.json()

    if (data.access_token) {
      userTokens.notion[userId] = {
        accessToken: data.access_token,
        workspaceName: data.workspace_name,
        workspaceId: data.workspace_id,
      }
      saveTokens()
      console.log(`[NOTION] Token stored for user: ${userId}, workspace: ${data.workspace_name}`)

      // Trigger async document ingestion
      ingestNotionDocuments(userId, data.access_token).catch(e =>
        console.error(`[NOTION] Ingestion error for ${userId}:`, e.message)
      )

      res.json({ ok: true, workspaceName: data.workspace_name })
    } else {
      console.error(`[NOTION] OAuth error:`, data)
      res.status(500).json({ error: data.error || 'Failed to get Notion token' })
    }
  } catch (e) {
    console.error(`[NOTION] Token exchange error:`, e.message)
    res.status(500).json({ error: e.message })
  }
})

// List connections for a user
app.post('/connections/list', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const result = {
    googleDrive: !!userTokens.googleDrive[userId],
    notion: !!userTokens.notion[userId],
    notionWorkspace: userTokens.notion[userId]?.workspaceName || null,
  }
  res.json(result)
})

// Delete a connection
app.post('/connections/delete', async (req, res) => {
  const { userId, provider } = req.body
  if (!userId || !provider) return res.status(400).json({ error: 'userId and provider required' })

  if (provider === 'google-drive') {
    delete userTokens.googleDrive[userId]
    saveTokens()
    delete userDocumentStore[`${userId}:google-drive`]
    deleteCache(docCacheKey(userId, 'google-drive'))
    console.log(`[DRIVE] Disconnected for user: ${userId}`)
  } else if (provider === 'notion') {
    delete userTokens.notion[userId]
    saveTokens()
    delete userDocumentStore[`${userId}:notion`]
    deleteCache(docCacheKey(userId, 'notion'))
    console.log(`[NOTION] Disconnected for user: ${userId}`)
  }

  res.json({ ok: true })
})

// ══════════════════════════════════════════
// DOCUMENT INGESTION & STORAGE (Knowledge Layer)
// ══════════════════════════════════════════

// Document store — cached to disk per user:provider
// Each entry: { title, content, source, chunks: string[] }
const userDocumentStore = {}

function docCacheKey(userId, provider) {
  // Sanitize userId for filename
  return `docs_${userId.replace(/[^a-zA-Z0-9]/g, '_')}_${provider}.json`
}

function loadDocCache(userId, provider) {
  const key = `${userId}:${provider}`
  if (userDocumentStore[key]) return userDocumentStore[key]
  const cached = readCache(docCacheKey(userId, provider))
  if (cached) {
    userDocumentStore[key] = cached.docs
    console.log(`[CACHE] Loaded ${cached.docs.length} docs from disk for ${key} (cached at ${new Date(cached.timestamp).toLocaleString()})`)
    return cached.docs
  }
  return null
}

function saveDocCache(userId, provider, docs) {
  const key = `${userId}:${provider}`
  userDocumentStore[key] = docs
  writeCache(docCacheKey(userId, provider), { docs, timestamp: Date.now() })
}

function getDocCacheAge(userId, provider) {
  const cached = readCache(docCacheKey(userId, provider))
  if (!cached?.timestamp) return Infinity
  return Date.now() - cached.timestamp
}

const ONE_HOUR = 60 * 60 * 1000

// Simple text chunker
function chunkText(text, maxChunkSize = 1000) {
  if (!text || text.length <= maxChunkSize) return [text || '']
  const chunks = []
  const sentences = text.split(/(?<=[.!?])\s+/)
  let current = ''
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > maxChunkSize && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? current + ' ' + sentence : sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [text.slice(0, maxChunkSize)]
}

// Extract content from a single Drive file
async function extractDriveFileContent(drive, file) {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const exported = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' })
    return exported.data || ''
  }
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exported = await drive.files.export({ fileId: file.id, mimeType: 'text/csv' })
    return exported.data || ''
  }
  if (file.mimeType === 'application/vnd.google-apps.presentation') {
    const exported = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' })
    return exported.data || ''
  }
  if (file.mimeType === 'application/pdf') {
    const downloaded = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' })
    const pdfData = await pdf(Buffer.from(downloaded.data))
    return pdfData.text || ''
  }
  if (['text/plain', 'text/csv', 'text/html'].includes(file.mimeType)) {
    const downloaded = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' })
    return typeof downloaded.data === 'string' ? downloaded.data : ''
  }
  return '' // Skip binary files (images, audio, video)
}

// Ingest Google Drive documents (with disk cache + parallel downloads)
async function ingestGoogleDriveDocuments(userId, tokens, force = false) {
  // Check disk cache first — skip if fresh (< 1 hour old)
  if (!force) {
    const age = getDocCacheAge(userId, 'google-drive')
    if (age < ONE_HOUR) {
      const cached = loadDocCache(userId, 'google-drive')
      if (cached) {
        console.log(`[DRIVE-INGEST] Using cached docs (${Math.round(age / 60000)}m old, ${cached.length} docs)`)
        return
      }
    }
  }

  console.log(`[DRIVE-INGEST] Starting fresh ingestion for user: ${userId}`)
  const authClient = new google.auth.OAuth2()
  authClient.setCredentials(tokens)
  const drive = google.drive({ version: 'v3', auth: authClient })

  try {
    // Paginate to list ALL files across all folders
    let files = []
    let pageToken = null
    do {
      const response = await drive.files.list({
        pageSize: 200,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)',
        orderBy: 'modifiedTime desc',
        q: 'trashed = false',
        ...(pageToken ? { pageToken } : {}),
      })
      files = files.concat(response.data.files || [])
      pageToken = response.data.nextPageToken
    } while (pageToken)

    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    files = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
    console.log(`[DRIVE-INGEST] Found ${files.length} files across ${folders.length} folders`)

    // Build file index
    const fileIndex = files.map(f => `- ${f.name} (${f.mimeType}, modified: ${f.modifiedTime || 'unknown'})`).join('\n')
    const docs = [{
      title: 'Google Drive File Index',
      content: `Here are all the files in the user's Google Drive:\n${fileIndex}`,
      source: 'google-drive',
      chunks: [`Here are all the files in the user's Google Drive:\n${fileIndex}`],
    }]

    // Download files in parallel batches of 5
    const BATCH_SIZE = 5
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const content = await extractDriveFileContent(drive, file)
          return { file, content }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.content?.trim()) {
          const { file, content } = result.value
          docs.push({
            title: file.name,
            content: content.slice(0, 50000),
            source: 'google-drive',
            chunks: chunkText(content.slice(0, 50000)),
          })
          console.log(`[DRIVE-INGEST] OK: ${file.name} (${content.length} chars)`)
        } else if (result.status === 'rejected') {
          console.error(`[DRIVE-INGEST] Failed:`, result.reason?.message)
        }
      }
    }

    saveDocCache(userId, 'google-drive', docs)
    console.log(`[DRIVE-INGEST] Done! ${docs.length} documents cached for user: ${userId}`)
  } catch (e) {
    console.error(`[DRIVE-INGEST] Error:`, e.message)
  }
}

// Ingest Notion documents (with disk cache)
async function ingestNotionDocuments(userId, accessToken, force = false) {
  if (!force) {
    const age = getDocCacheAge(userId, 'notion')
    if (age < ONE_HOUR) {
      const cached = loadDocCache(userId, 'notion')
      if (cached) {
        console.log(`[NOTION-INGEST] Using cached docs (${Math.round(age / 60000)}m old, ${cached.length} docs)`)
        return
      }
    }
  }

  console.log(`[NOTION-INGEST] Starting fresh ingestion for user: ${userId}`)
  const notion = new NotionClient({ auth: accessToken })

  try {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' },
      page_size: 100,
    })

    const pages = response.results || []
    console.log(`[NOTION-INGEST] Found ${pages.length} pages`)

    const docs = []
    for (const page of pages) {
      try {
        let title = 'Untitled'
        for (const [, prop] of Object.entries(page.properties || {})) {
          if (prop.type === 'title' && prop.title?.[0]?.plain_text) {
            title = prop.title[0].plain_text
            break
          }
        }

        const blocks = await notion.blocks.children.list({ block_id: page.id, page_size: 100 })
        let content = ''
        for (const block of blocks.results || []) {
          const texts = block[block.type]?.rich_text || []
          for (const t of texts) content += (t.plain_text || '') + ' '
          content += '\n'
        }

        if (content.trim()) {
          docs.push({
            title,
            content: content.slice(0, 50000),
            source: 'notion',
            chunks: chunkText(content.slice(0, 50000)),
          })
        }
      } catch (pageErr) {
        console.error(`[NOTION-INGEST] Error reading page:`, pageErr.message)
      }
    }

    saveDocCache(userId, 'notion', docs)
    console.log(`[NOTION-INGEST] Done! ${docs.length} documents cached for user: ${userId}`)
  } catch (e) {
    console.error(`[NOTION-INGEST] Error:`, e.message)
  }
}

// ─── POST /search-docs ───
// Searches ingested documents from Drive/Notion using simple keyword matching
app.post('/search-docs', async (req, res) => {
  const { userId, query } = req.body
  console.log(`\n[DOCS] userId: ${userId}, query: "${query}"`)

  if (!userId || !query) {
    return res.status(400).json({ error: 'userId and query required' })
  }

  try {
    const driveDocs = loadDocCache(userId, 'google-drive') || []
    const notionDocs = loadDocCache(userId, 'notion') || []
    const allDocs = [...driveDocs, ...notionDocs]

    if (!allDocs.length) {
      console.log(`[DOCS] No documents available for user: ${userId}`)
      return res.json({ docs: [] })
    }

    // Simple relevance scoring: count query term occurrences in chunks
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)

    const scored = []
    for (const doc of allDocs) {
      for (const chunk of doc.chunks) {
        const lower = chunk.toLowerCase()
        let score = 0
        for (const term of queryTerms) {
          if (lower.includes(term)) score++
        }
        if (score > 0) {
          scored.push({
            title: doc.title,
            content: chunk,
            source: doc.source,
            score,
          })
        }
      }
    }

    // Sort by score descending, take top 5
    scored.sort((a, b) => b.score - a.score)
    const topDocs = scored.slice(0, 5)

    // Always include the file index if user is asking about files/drive
    const qLower = query.toLowerCase()
    if (qLower.includes('drive') || qLower.includes('file') || qLower.includes('document') || qLower.includes('list') || qLower.includes('what')) {
      const fileIndex = allDocs.find(d => d.title.includes('File Index'))
      if (fileIndex && !topDocs.some(d => d.title.includes('File Index'))) {
        topDocs.unshift({
          title: fileIndex.title,
          content: fileIndex.chunks[0] || fileIndex.content.slice(0, 3000),
          source: fileIndex.source,
          score: 100,
        })
      }
    }

    // If no keyword matches, return first chunks of each doc as general context
    if (!topDocs.length && allDocs.length) {
      const fallback = allDocs.slice(0, 5).map(d => ({
        title: d.title,
        content: d.chunks[0] || d.content.slice(0, 500),
        source: d.source,
        score: 0,
      }))
      console.log(`[DOCS] No keyword matches, returning ${fallback.length} fallback docs`)
      return res.json({ docs: fallback })
    }

    console.log(`[DOCS] Returning ${topDocs.length} relevant chunks`)
    res.json({ docs: topDocs })
  } catch (e) {
    console.error(`[DOCS] ERROR: ${e.message}`)
    res.json({ docs: [] })
  }
})

// ══════════════════════════════════════════
// MEM0 — USER MEMORY (long-term memory layer)
// ══════════════════════════════════════════

// ─── POST /search-memory ───
app.post('/search-memory', async (req, res) => {
  const { userId, query } = req.body
  console.log(`\n[MEMORY] userId: ${userId}, query: "${query}"`)

  if (!userId) {
    return res.status(400).json({ error: 'userId required' })
  }

  try {
    // Search Mem0 for relevant memories
    const results = await mem0.search(query || '', {
      user_id: userId,
    })

    const memories = (results.results || results || [])
    const context = memories
      .map(m => m.memory || m.content || '')
      .filter(Boolean)
      .join('\n')

    console.log(`[MEMORY] Found ${memories.length} memories, context length: ${context.length}`)
    res.json({ context })
  } catch (e) {
    console.error(`[MEMORY] Search error: ${e.message}`)
    res.json({ context: '' })
  }
})

// ─── POST /store-memory ───
app.post('/store-memory', async (req, res) => {
  const { userId, conversationId, content } = req.body
  console.log(`\n[STORE] userId: ${userId}, convId: ${conversationId}, content length: ${content?.length || 0}`)

  if (!userId || !content) {
    return res.status(400).json({ error: 'userId and content required' })
  }

  try {
    // Store conversation as messages for Mem0 to extract memories from
    const messages = content.split('\n').map(line => {
      const match = line.match(/^(user|assistant):\s*(.+)$/i)
      if (match) {
        return { role: match[1].toLowerCase(), content: match[2] }
      }
      return null
    }).filter(Boolean)

    if (messages.length === 0) {
      // Fallback: store as a single user message
      messages.push({ role: 'user', content })
    }

    const result = await mem0.add(messages, {
      user_id: userId,
      metadata: { conversationId, type: 'conversation' },
    })

    console.log(`[STORE] OK — stored memories for user: ${userId}`)
    res.json({ ok: true, result })
  } catch (e) {
    console.error(`[STORE] ERROR: ${e.message}`)
    res.json({ ok: false, reason: e.message })
  }
})

// ─── POST /refresh-docs ───
// Manually trigger re-ingestion of connected documents
app.post('/refresh-docs', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const promises = []

  if (userTokens.googleDrive[userId]) {
    promises.push(ingestGoogleDriveDocuments(userId, userTokens.googleDrive[userId]))
  }
  if (userTokens.notion[userId]) {
    promises.push(ingestNotionDocuments(userId, userTokens.notion[userId].accessToken))
  }

  await Promise.allSettled(promises)
  res.json({ ok: true })
})

// ══════════════════════════════════════════

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err)
})

const server = app.listen(PORT, () => {
  console.log(`\nfleabot backend running on http://localhost:${PORT}`)

  // On startup: load cached docs for known users, refresh stale ones in background
  const driveUsers = Object.keys(userTokens.googleDrive)
  const notionUsers = Object.keys(userTokens.notion)
  console.log(`[STARTUP] Found ${driveUsers.length} saved Drive connections, ${notionUsers.length} Notion connections`)

  for (const uid of driveUsers) {
    loadDocCache(uid, 'google-drive') // Load from disk into memory
    // Refresh in background if stale (> 1 hour)
    ingestGoogleDriveDocuments(uid, userTokens.googleDrive[uid]).catch(() => {})
  }
  for (const uid of notionUsers) {
    loadDocCache(uid, 'notion')
    ingestNotionDocuments(uid, userTokens.notion[uid].accessToken).catch(() => {})
  }

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
