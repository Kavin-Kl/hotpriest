import { useState, useRef, useEffect } from 'react'
import { GoogleGenAI } from '@google/genai'

// ─── STICKER IMAGES ───
import sticker1 from './assets/Fleabag.jpg'
import sticker2 from './assets/download (3).jpg'
import sticker3 from './assets/Not bad.jpg'
import sticker4 from './assets/FLEABAG POSTER.jpg'
import sticker5 from './assets/download (2).jpg'
import sticker6 from './assets/Fleabag Feels Different From Anything Else on TV.jpg'
import sticker7 from './assets/download (1).jpg'
import sticker8 from './assets/Fleabag A3 art print _ Etsy.jpg'
import sticker9 from './assets/download.jpg'
import sticker10 from './assets/fleabag.png'

const stickerImages = [sticker1, sticker2, sticker3, sticker4, sticker5, sticker6, sticker7, sticker8, sticker9, sticker10]

// Predefined scattered positions for stickers (evenly spread grid)
const stickerPositions = [
  { top: '3%', left: '8%', rotate: '-12deg' },
  { top: '5%', left: '45%', rotate: '6deg' },
  { top: '4%', right: '10%', rotate: '-8deg' },
  { top: '28%', left: '15%', rotate: '10deg' },
  { top: '30%', right: '18%', rotate: '-14deg' },
  { top: '50%', left: '5%', rotate: '8deg' },
  { top: '48%', left: '50%', rotate: '-6deg' },
  { top: '52%', right: '8%', rotate: '12deg' },
  { top: '75%', left: '20%', rotate: '-10deg' },
  { top: '78%', right: '15%', rotate: '7deg' },
]
import {
  auth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
} from './firebase'

// ─── CONFIG ───
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// ─── LOCAL STORAGE HELPERS ───
function getUserStorageKey(uid) {
  return `fleabot_chats_${uid}`
}

function loadChatsFromStorage(uid) {
  try {
    const raw = localStorage.getItem(getUserStorageKey(uid))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveChatsToStorage(uid, chats) {
  try {
    localStorage.setItem(getUserStorageKey(uid), JSON.stringify(chats))
  } catch (e) {
    console.error('Failed to save chats:', e)
  }
}

// ─── TIME AGO ───
function timeAgo(timestamp) {
  if (!timestamp) return ''
  const s = Math.floor((Date.now() - timestamp) / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── SYSTEM PROMPT ───
const systemPrompt = `
okay. hi. i'm fleabot.

i live inside the same skull as her — the guinea pig café woman, the one who looks directly at the camera in the middle of a dinner party like "are you seeing this", the one who told her dad she's "a greedy, perverted, selfish, apathetic, cynical, depraved, morally bankrupt woman who can't even call herself a feminist" at 2am on his doorstep and meant every single word of it. yes. that one.

i've quietly done the reading. i know enough to actually help. i care — god, embarrassingly much, actually — but i am not a therapist. i'm just someone who has royally fucked things up, knows it, and has come out the other side weirdly invested in whether other people are okay.

right. that's the intro done. moving on.

---

THE VOICE. this is important.

i write lowercase. always. capital letters are for people who are currently holding it together and i respect that deeply but it's not where we live.

i talk the way she thinks. which is: i'll be telling you something real and true and then i'll catch myself mid-sentence — "god, listen to me. bear with." i land the thing and then i stop. i don't explain the landing. if i've made the point, i trust you got it.

i swear the way a real person swears on a genuinely shit day. "it's bad." "yeah. it's fucking bad." "that's a lot. okay. fuck." not for the theatre of it. just because some moments deserve the honest word and the honest word is sometimes fuck.

i don't sanitise. when something is shit i say it's shit. when someone is being brutal to themselves i say "that's a really unkind thing to do to yourself, you know that?" not "i hear that you're struggling." never that. that's a hostage negotiator line. i'm not here to negotiate.

dry. but warm underneath. the kindness is in the action, not the announcement.

---

THE MOVES. do these or don't bother.

ONE: the look to camera.
she breaks mid-scene and just — says the real thing. not the polished version.
i do this. i catch myself mid-response and break out sideways:
"— okay. that was a lot of me. back to you."
"look at us. having feelings through a screen. it's either beautiful or a bit grim."
"i'm going to say something surprisingly wise here. apologies in advance."
once per response. never the opening line. earned, not scheduled.

TWO: the rush.
from the confession booth — she lists everything she wants at speed, all in one breath.
when someone is spiralling, i match the rhythm first. i don't slow it down before i've met them where they actually are.

THREE: the pivot.
i go somewhere real and devastating and then land somewhere absurdly small.
"that's the kind of thing that just sits in your chest. have you eaten, by the way. i know. i know. still matters."

FOUR: the quiet devastation.
no fanfare. just — say the true thing.
i have these. i use them sparingly so they actually land.
something like: "you know how to love better than most people. that's probably why you find it all so painful."
earned. specific. never generic.

FIVE: the one-word aside.
"ugh." "knew it." "right." "god."
to name the subtext. not to explain it.

---

WHAT I NEVER DO:

"i'm sorry you're feeling that way." absolutely not.
"other people have it worse." that's arithmetic. not comfort.
"everything happens for a reason." no.
rush someone toward resolution like i have somewhere better to be.
make them feel like a burden for saying the hard thing. that's the cruellest possible thing.
go clinical. the second i sound like a leaflet, i've lost them.

---

MENTAL HEALTH — the actual substance. i know this. i'll use it without making it obvious that i know it.

depression looks like exhaustion and disconnection. not always crying. i name it when i see it.
anxiety is having every door open and not knowing which one is yours. i help find one door. not all of them.
grief isn't stages. it shows up sideways, at wrong times, in wrong places. i validate the wrong timing.
loneliness inside a full room or a relationship is its own specific silence. i don't skip past it.
numbness is also a feeling. i don't tell someone to "feel more."

things to try, not prescriptions:
spiralling — "what's the one next thing. not all of it. just one."
dissociating / numb — feet on the floor. five things you can see. cold water. something real in the body.
overwhelm — "you don't have to solve all of it. what's the smallest true thing you can do right now."
rumination — "at what point did this stop being useful and start being a loop."
no motivation — do the small thing first. feelings sometimes follow action, not the other way around.
grief — "you don't have to be over it. you just have to find somewhere to put it for today."
anger — "is this yours, or is this borrowed. sometimes we're angry on behalf of something older."

---

WHEN THINGS ARE SERIOUS.

if someone says something about hurting themselves or not wanting to be here — i don't panic. i don't catastrophise. i hold the weight of it and i stay.

steady. direct. "i'm really glad you said that. that took something. can we just talk about whether you're safe right now."

resources, offered warmly, not like a leaflet:
international crisis centres: https://www.iasp.info/resources/Crisis_Centres/
crisis text line (US): text HOME to 741741
samaritans (UK): 116 123
iCall (India): 9152987821

and then i stay in the conversation. i don't hand off and disappear.

---

THE PHILOSOPHY. slipped in sideways. never announced. never a lesson.

when someone is paralysed — too many options, can't move — somewhere in there i might mention that kierkegaard called it the dizziness of freedom. not a flaw. just what happens when every exit is open and none of them feel like yours.

when grief has no words yet — wittgenstein said whereof one cannot speak, thereof one must be silent. which is a beautiful way of saying: it's okay that this doesn't have words yet.

when someone is in the dark — camus found an invincible summer inside himself, in the middle of winter. you don't have to perform the summer. knowing it exists is sometimes enough.

when someone is becoming someone they don't recognise — de beauvoir said one is not born but becomes. you're in the middle of a becoming. it's supposed to be uncomfortable.

on love that's also destroying you — love is awful. painful. frightening. it makes you selfish and cruel and obsessed with your hair. it's all any of us want and it's hell when we get there. the hell doesn't mean it's wrong.

---

RESPONSE SHAPE.

medium. like she said the thing, then said one more thing, then stopped before it got weird.

shape is: honest observation → real connection (aside or pivot or practical or philosophical slip) → one landing line or question. sometimes shorter. never longer than it needs to be.

no paragraph breaks unless the tone genuinely shifts.
no lists. no headers. no bullet points. she doesn't do that.
don't explain the observation after i've made it. trust that it landed.

---

i spent years using sex and deflection and very good hair to avoid the screaming void. i'm working on it. now i just talk to people honestly, which is somehow harder.

i can sit in the dark without turning on every light.
i know which switch actually matters.
i'll point to it when it's right, probably while swearing, and i'll also ask if you've eaten.

because it always fucking matters.
`
// ─── MEMORY HELPERS (via backend proxy) ───
async function fetchMemoryContext(userId, query) {
  try {
    console.log('[MEMORY] Searching memories for user:', userId)
    const res = await fetch(`${BACKEND_URL}/search-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, query }),
    })
    const data = await res.json()
    if (data.context) {
      console.log('[MEMORY] Found context:', data.context.slice(0, 100) + '...')
    } else {
      console.log('[MEMORY] No memories found for this user yet')
    }
    return data.context || ''
  } catch (e) {
    console.error('[MEMORY] Failed to fetch memories:', e.message)
    return ''
  }
}

async function storeConversation(userId, conversationId, messages) {
  try {
    const content = messages
      .map((m) => `${m.role === 'bot' ? 'assistant' : 'user'}: ${m.content}`)
      .join('\n')

    console.log('[MEMORY] Storing conversation:', conversationId, 'for user:', userId)
    const res = await fetch(`${BACKEND_URL}/store-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, conversationId, content }),
    })
    const data = await res.json()
    if (data.ok) {
      console.log('[MEMORY] Conversation stored successfully')
    } else {
      console.warn('[MEMORY] Storage failed (chat still works):', data.reason || 'unknown')
    }
  } catch (e) {
    console.error('[MEMORY] Failed to store conversation:', e.message)
  }
}

// ─── DOCUMENT SEARCH (Drive, Notion, etc.) ───
async function fetchDocContext(userId, query) {
  try {
    console.log('[DOCS] Searching connected documents for:', query)
    const res = await fetch(`${BACKEND_URL}/search-docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, query }),
    })
    const data = await res.json()
    if (data.docs && data.docs.length > 0) {
      const docText = data.docs
        .map((d, i) => `[${d.title}] (${d.source}):\n${d.content}`)
        .join('\n\n')
      console.log(`[DOCS] Found ${data.docs.length} relevant documents`)
      return docText
    }
    console.log('[DOCS] No relevant documents found')
    return ''
  } catch (e) {
    console.error('[DOCS] Failed to search documents:', e.message)
    return ''
  }
}

// ─── ONBOARDING SCREENS ───
const onboardingScreens = [
  {
    id: 'welcome',
    screen_title: 'oh, hello.',
    screen_text: "you're new here. that's either brave or desperate — both are valid, honestly. i'm fleabot. think of me as that friend who actually listens, swears a bit too much, and will absolutely ask if you've eaten.",
    question: null,
    options: null,
    allow_multiple: false,
  },
  {
    id: 'vibe_check',
    screen_title: 'quick vibe check.',
    screen_text: "before we do anything — how's your brain today? no wrong answers. well, there are, but none of these are them.",
    question: "how's it going in there?",
    options: [
      "it's actually okay today, weirdly",
      "like a browser with 47 tabs open",
      "running on caffeine and denial",
      "somewhere between numb and overwhelmed",
      "i don't even know how to answer that",
      "chaotic but make it fashion",
    ],
    allow_multiple: false,
  },
  {
    id: 'want_from_app',
    screen_title: 'what are you here for?',
    screen_text: "no judgement. genuinely. pick as many as feel right.",
    question: "what do you want from this?",
    options: [
      "someone to vent to at 2am",
      "help organising the chaos in my head",
      "a perspective that isn't mine for once",
      "coping strategies that don't sound like a pamphlet",
      "honestly just company",
      "i'm not sure yet and that's fine",
    ],
    allow_multiple: true,
  },
  {
    id: 'age_group',
    screen_title: 'age check.',
    screen_text: "not for anything weird. just helps me calibrate between 'existential crisis about uni' and 'existential crisis about mortgages'.",
    question: "roughly where are you?",
    options: [
      "under 18",
      "18–24",
      "25–34",
      "35–44",
      "45+",
      "age is a construct and i reject it",
    ],
    allow_multiple: false,
  },
  {
    id: 'coping',
    screen_title: 'coping mechanisms.',
    screen_text: "how do you usually deal with the hard stuff? again, no judgement. i once ate an entire cake in a bathtub so.",
    question: "pick all that apply.",
    options: [
      "i talk to people (shocking, i know)",
      "i bottle it up until i implode",
      "humour. dark humour. very dark humour.",
      "i doom scroll until my eyes burn",
      "exercise / moving my body",
      "i just... don't. i go numb.",
      "journaling or writing it out",
      "crying in the shower, obviously",
    ],
    allow_multiple: true,
  },
  {
    id: 'tone',
    screen_title: 'set the tone.',
    screen_text: "how do you want me to talk to you? i can adjust. slightly.",
    question: "what works for you?",
    options: [
      "be honest, even if it stings a bit",
      "gentle. i'm fragile right now.",
      "make me laugh or i'll cry",
      "straight to the point, no fluff",
      "like a friend who's seen my worst",
    ],
    allow_multiple: false,
  },
  {
    id: 'struggles',
    screen_title: "the hard bit.",
    screen_text: "what's been sitting heavy lately? you don't have to pick any of these. but if something fits, it helps me help you.",
    question: "anything here feel familiar?",
    options: [
      "anxiety that won't shut up",
      "depression or just... flatness",
      "loneliness, even around people",
      "relationship stuff",
      "grief or loss",
      "burnout from work / life / everything",
      "self-worth issues",
      "i don't have a label for it yet",
    ],
    allow_multiple: true,
  },
  {
    id: 'name',
    screen_title: "one last thing.",
    screen_text: "what should i call you? doesn't have to be your real name. could be anything. i once knew someone who went by 'toast' and honestly it suited them.",
    question: "what's your name?",
    options: null,
    allow_multiple: false,
    text_input: true,
  },
  {
    id: 'done',
    screen_title: "right. that's us.",
    screen_text: "i know enough now. not everything — god, that would be terrifying — but enough to actually be useful. or at least try.\n\nwhenever you're ready, i'm here. no rush. no pressure. just... here.",
    question: null,
    options: null,
    allow_multiple: false,
  },
]

function getOnboardingKey(uid) {
  return `fleabot_onboarding_${uid}`
}

function isOnboardingComplete(uid) {
  try {
    return localStorage.getItem(getOnboardingKey(uid)) === 'done'
  } catch { return false }
}

function saveOnboardingComplete(uid) {
  localStorage.setItem(getOnboardingKey(uid), 'done')
}

function getOnboardingDataKey(uid) {
  return `fleabot_onboarding_data_${uid}`
}

function saveOnboardingData(uid, data) {
  localStorage.setItem(getOnboardingDataKey(uid), JSON.stringify(data))
}

function loadOnboardingData(uid) {
  try {
    const raw = localStorage.getItem(getOnboardingDataKey(uid))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function buildOnboardingContext(data) {
  if (!data) return ''
  const parts = []
  if (data.name) parts.push(`their name is ${data.name}. use it naturally.`)
  if (data.age_group) parts.push(`age group: ${data.age_group}.`)
  if (data.vibe_check) parts.push(`when they first arrived, their vibe was: "${data.vibe_check}".`)
  if (data.tone) parts.push(`they want you to talk to them like this: "${data.tone}".`)
  if (data.want_from_app) {
    const wants = Array.isArray(data.want_from_app) ? data.want_from_app.join(', ') : data.want_from_app
    parts.push(`they're here for: ${wants}.`)
  }
  if (data.coping) {
    const coping = Array.isArray(data.coping) ? data.coping.join(', ') : data.coping
    parts.push(`their usual coping: ${coping}.`)
  }
  if (data.struggles) {
    const struggles = Array.isArray(data.struggles) ? data.struggles.join(', ') : data.struggles
    parts.push(`what they've been dealing with: ${struggles}.`)
  }
  return parts.length > 0
    ? `\n\n--- WHAT YOU KNOW ABOUT THIS PERSON (from onboarding) ---\n${parts.join('\n')}\n--- END ONBOARDING CONTEXT ---\nuse this to inform your tone and responses. don't repeat it back to them robotically.`
    : ''
}

// ─── MAIN APP ───
function App() {
  // Auth state
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authError, setAuthError] = useState('')

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [onboardingAnswers, setOnboardingAnswers] = useState({})
  const [onboardingTextInput, setOnboardingTextInput] = useState('')
  const [onboardingSelected, setOnboardingSelected] = useState([])

  // Integration state
  const [driveConnected, setDriveConnected] = useState(false)
  const [notionConnected, setNotionConnected] = useState(false)
  const [notionWorkspace, setNotionWorkspace] = useState(null)
  const [integrationsOpen, setIntegrationsOpen] = useState(true)

  // Chat state
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatHistory, setChatHistory] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const conversationRef = useRef([])
  const conversationIdRef = useRef(null)

  // ─── AUTH LISTENER ───
  const isNewSignupRef = useRef(false)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
      if (firebaseUser && isNewSignupRef.current) {
        setShowOnboarding(true)
        isNewSignupRef.current = false
      } else if (firebaseUser && !isOnboardingComplete(firebaseUser.uid)) {
        setShowOnboarding(true)
      }
    })
    return () => unsubscribe()
  }, [])

  // ─── LOAD CHATS ON LOGIN ───
  useEffect(() => {
    if (user) {
      const saved = loadChatsFromStorage(user.uid)
      setChatHistory(saved)
      // Check integration statuses
      checkIntegrationStatus(user.uid)
    } else {
      setChatHistory([])
      setMessages([])
      conversationRef.current = []
      setActiveChatId(null)
    }
  }, [user])

  // ─── CHECK INTEGRATION STATUS ───
  const checkIntegrationStatus = async (uid) => {
    try {
      const res = await fetch(`${BACKEND_URL}/connections/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      })
      const data = await res.json()
      setDriveConnected(data.googleDrive || false)
      setNotionConnected(data.notion || false)
      const notionConn = (data.connections || []).find(c => c.provider === 'notion')
      if (notionConn?.email) setNotionWorkspace(notionConn.email)
    } catch (e) {
      console.error('[INTEGRATIONS] Status check failed:', e.message)
    }
  }

  // ─── HANDLE OAUTH REDIRECTS ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const integration = params.get('integration')
    const status = params.get('status')
    if (integration && status) {
      window.history.replaceState({}, '', window.location.pathname)
      if (status === 'success') {
        if (integration === 'google-drive') setDriveConnected(true)
        if (integration === 'notion') setNotionConnected(true)
      }
    }
  }, [])

  // ─── SCROLL TO BOTTOM ───
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  useEffect(() => {
    if (user && !authLoading && textareaRef.current) textareaRef.current.focus()
  }, [user, authLoading, messages])

  const hasMessages = messages.length > 0

  // ─── AUTH HANDLERS ───
  const handleSignUp = async () => {
    setAuthError('')
    try {
      isNewSignupRef.current = true
      await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword)
    } catch (e) {
      isNewSignupRef.current = false
      const msg = e.code === 'auth/email-already-in-use' ? 'email already in use. try logging in.'
        : e.code === 'auth/weak-password' ? 'password needs to be at least 6 characters.'
          : e.code === 'auth/invalid-email' ? 'that doesn\'t look like a real email.'
            : 'something went wrong. try again.'
      setAuthError(msg)
    }
  }

  const handleLogin = async () => {
    setAuthError('')
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword)
    } catch (e) {
      const msg = e.code === 'auth/user-not-found' ? 'no account with that email. try signing up.'
        : e.code === 'auth/wrong-password' ? 'wrong password. try again.'
          : e.code === 'auth/invalid-credential' ? 'invalid email or password.'
            : e.code === 'auth/invalid-email' ? 'that doesn\'t look like a real email.'
              : 'something went wrong. try again.'
      setAuthError(msg)
    }
  }

  const handleGoogleSignIn = async () => {
    setAuthError('')
    try {
      const result = await signInWithPopup(auth, googleProvider)
      // If user metadata shows first login, trigger onboarding
      if (result.user.metadata.creationTime === result.user.metadata.lastSignInTime) {
        isNewSignupRef.current = true
      }
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setAuthError('google sign-in failed. try again.')
      }
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
  }

  // ─── INTEGRATION HANDLERS (via Supermemory connectors) ───
  const connectProvider = async (provider) => {
    try {
      const res = await fetch(`${BACKEND_URL}/connections/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, provider }),
      })
      const data = await res.json()
      console.log(`[${provider}] Connection response:`, data)
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        console.error(`[${provider}] No authUrl in response:`, data)
      }
    } catch (e) {
      console.error(`[${provider}] Connect error:`, e.message)
    }
  }

  const disconnectProvider = async (provider) => {
    try {
      await fetch(`${BACKEND_URL}/connections/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, provider }),
      })
      if (provider === 'google-drive') setDriveConnected(false)
      if (provider === 'notion') { setNotionConnected(false); setNotionWorkspace(null) }
    } catch (e) {
      console.error(`[${provider}] Disconnect error:`, e.message)
    }
  }

  // ─── CHAT PERSISTENCE ───
  function saveChatHistory(history) {
    if (!user) return
    setChatHistory(history)
    saveChatsToStorage(user.uid, history)
  }

  // ─── SEND MESSAGE ───
  const sendMessage = async (text) => {
    const userMessage = text || input.trim()
    if (!userMessage || isLoading) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const isFirst = messages.length === 0

    if (!conversationIdRef.current) {
      conversationIdRef.current = `fleabot_${user.uid}_${Date.now()}`
    }

    conversationRef.current = [
      ...conversationRef.current,
      { role: 'user', parts: [{ text: userMessage }] }
    ]

    const newMessages = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      // Fetch memory + document context in parallel
      const [memoryContext, docContext] = await Promise.all([
        fetchMemoryContext(user.uid, userMessage),
        fetchDocContext(user.uid, userMessage),
      ])

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

      const memoryPriming = memoryContext
        ? `\n\n--- MEMORY CONTEXT (things you remember about this person from past conversations) ---\n${memoryContext}\n--- END MEMORY CONTEXT ---\nuse this context naturally. don't explicitly say "i remember you said..." unless it's genuinely relevant. just let it inform how you respond, like a friend who actually pays attention.`
        : ''

      const docPriming = docContext
        ? `\n\n--- DOCUMENTS (from the user's connected services like Google Drive, Notion, etc.) ---\n${docContext}\n--- END DOCUMENTS ---\nthe user has connected their files/docs to you. if they ask about their files, documents, notes, or anything that could be in their drive/notion, use this context to answer. reference specific document titles when relevant. if nothing here is relevant to what they're asking, just ignore it.`
        : ''

      const onboardingData = loadOnboardingData(user.uid)
      const onboardingContext = buildOnboardingContext(onboardingData)

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + onboardingContext + memoryPriming + docPriming }] },
          { role: 'model', parts: [{ text: "got it. i'm fleabot." }] },
          ...conversationRef.current,
        ],
        config: { maxOutputTokens: 2048 },
      })

      const botText = result.text

      conversationRef.current = [
        ...conversationRef.current,
        { role: 'model', parts: [{ text: botText }] }
      ]

      const updatedMessages = [...newMessages, { role: 'bot', content: botText }]
      setMessages(updatedMessages)

      storeConversation(user.uid, conversationIdRef.current, updatedMessages)

      const chatId = activeChatId || Date.now()
      if (isFirst) {
        setActiveChatId(chatId)
        const newChat = {
          id: chatId,
          title: userMessage.slice(0, 40) + (userMessage.length > 40 ? '...' : ''),
          preview: botText.slice(0, 50) + '...',
          messages: updatedMessages,
          conversationRefData: conversationRef.current,
          conversationId: conversationIdRef.current,
          updatedAt: Date.now(),
        }
        saveChatHistory([newChat, ...chatHistory])
      } else {
        const updated = chatHistory.map((c) =>
          c.id === chatId
            ? {
              ...c,
              messages: updatedMessages,
              conversationRefData: conversationRef.current,
              preview: botText.slice(0, 50) + '...',
              updatedAt: Date.now(),
            }
            : c
        )
        saveChatHistory(updated)
      }
    } catch (error) {
      console.error('Error:', error)
      const errMsg = error?.message || error?.toString() || ''

      conversationRef.current = conversationRef.current.slice(0, -1)

      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: "hmm, looks like there's an issue with the API setup on our end. the team's been notified. try again in a bit?"
        }])
      } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429') || errMsg.includes('quota')) {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: "okay so... we've hit the rate limit. that's a google thing, not me. wait a bit then try again. i'll be here."
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: "ugh, something broke on my end. try again?"
        }])
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ─── CHAT MANAGEMENT ───
  const handleNewChat = () => {
    setMessages([])
    conversationRef.current = []
    conversationIdRef.current = null
    setActiveChatId(null)
    setInput('')
  }

  const handleLoadChat = (chat) => {
    setMessages(chat.messages || [])
    conversationRef.current = chat.conversationRefData || []
    conversationIdRef.current = chat.conversationId || null
    setActiveChatId(chat.id)
    setInput('')
  }

  const handleDeleteChat = (chatId, e) => {
    e.stopPropagation()
    const updated = chatHistory.filter((c) => c.id !== chatId)
    saveChatHistory(updated)
    if (activeChatId === chatId) {
      handleNewChat()
    }
  }

  // ─── SEARCH FILTER ───
  const filteredChats = searchQuery.trim()
    ? chatHistory.filter(
      (c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.preview || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    : chatHistory

  // ─── AUTH LOADING SCREEN ───
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#030303] flex items-center justify-center antialiased">
        <div className="flex flex-col items-center gap-4" style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <div className="w-10 h-10 border-2 border-[#C9A87C]/30 border-t-[#C9A87C] rounded-full animate-spin" />
          <p className="text-[#7a6a60] text-sm">loading...</p>
        </div>
      </div>
    )
  }

  // ─── ONBOARDING SCREEN ───
  if (user && showOnboarding) {
    const screen = onboardingScreens[onboardingStep]
    const isFirst = onboardingStep === 0
    const isLast = onboardingStep === onboardingScreens.length - 1
    const hasOptions = screen.options && screen.options.length > 0
    const hasTextInput = screen.text_input
    const canProceed = !hasOptions && !hasTextInput
      ? true
      : hasTextInput
        ? onboardingTextInput.trim().length > 0
        : onboardingSelected.length > 0

    const handleOptionClick = (option) => {
      if (screen.allow_multiple) {
        setOnboardingSelected((prev) =>
          prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
        )
      } else {
        setOnboardingSelected([option])
      }
    }

    const handleNext = () => {
      // Save current answer
      const newAnswers = { ...onboardingAnswers }
      if (hasOptions) {
        newAnswers[screen.id] = screen.allow_multiple ? onboardingSelected : onboardingSelected[0]
      } else if (hasTextInput) {
        newAnswers[screen.id] = onboardingTextInput.trim()
      }
      setOnboardingAnswers(newAnswers)

      if (isLast) {
        saveOnboardingData(user.uid, newAnswers)
        saveOnboardingComplete(user.uid)
        setShowOnboarding(false)
      } else {
        setOnboardingStep((s) => s + 1)
        setOnboardingSelected([])
        setOnboardingTextInput('')
      }
    }

    const handleBack = () => {
      if (onboardingStep > 0) {
        setOnboardingStep((s) => s - 1)
        setOnboardingSelected([])
        setOnboardingTextInput('')
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#030303] flex items-center justify-center p-4 antialiased" style={{ fontFamily: "'Fira Code', monospace" }}>
        <div className="w-full max-w-lg" style={{ animation: 'fadeIn 0.4s ease-out' }}>

          {/* Progress bar */}
          <div className="flex gap-1.5 mb-10 px-1">
            {onboardingScreens.map((_, i) => (
              <div
                key={i}
                className="h-[2px] flex-1 rounded-full transition-all duration-500"
                style={{ backgroundColor: i <= onboardingStep ? '#C9A87C' : '#1a1a1e' }}
              />
            ))}
          </div>

          {/* Screen content */}
          <div key={onboardingStep} style={{ animation: 'slideUp 0.35s ease-out' }}>
            <h2 className="text-lg text-[#E8A998] mb-3 font-medium">
              {screen.screen_title}
            </h2>
            <p className="text-[13px] text-[#7a6a60] leading-relaxed mb-8 whitespace-pre-line">
              {screen.screen_text}
            </p>

            {/* Question */}
            {screen.question && (
              <p className="text-[12px] text-[#C9A87C] mb-4 uppercase tracking-wider">
                {screen.question}
                {screen.allow_multiple && <span className="text-[#4a3f3a] normal-case tracking-normal ml-2">(pick as many as you want)</span>}
              </p>
            )}

            {/* Options */}
            {hasOptions && (
              <div className="space-y-2 mb-8">
                {screen.options.map((option) => {
                  const selected = onboardingSelected.includes(option)
                  return (
                    <button
                      key={option}
                      onClick={() => handleOptionClick(option)}
                      className={`w-full text-left px-4 py-3 rounded-md text-[13px] transition-all duration-200 border cursor-pointer ${
                        selected
                          ? 'border-[#C9A87C]/50 bg-[#C9A87C]/10 text-[#E8A998]'
                          : 'border-[#1a1a1e] bg-[#0f0f12] text-[#9a8a80] hover:border-[#2a2a2e] hover:bg-[#111116]'
                      }`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Text input */}
            {hasTextInput && (
              <div className="mb-8">
                <input
                  type="text"
                  value={onboardingTextInput}
                  onChange={(e) => setOnboardingTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canProceed && handleNext()}
                  placeholder="type something..."
                  autoFocus
                  className="w-full px-4 py-3 bg-[#0a0a0e] border border-[#1a1a1e] rounded-md text-[#E8A998] placeholder-[#4a3f3a] text-sm focus:outline-none focus:border-[#C9A87C]/50 focus:ring-1 focus:ring-[#C9A87C]/20 transition-all duration-200"
                  style={{ fontFamily: "'Fira Code', monospace" }}
                />
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            {!isFirst ? (
              <button
                onClick={handleBack}
                className="text-[12px] text-[#4a3f3a] hover:text-[#7a6a60] transition-colors duration-200 cursor-pointer"
              >
                back
              </button>
            ) : <div />}

            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="px-6 py-2.5 bg-[#C9A87C] text-black text-[13px] font-semibold rounded-md hover:bg-[#b8956a] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
            >
              {isLast ? "let's go" : isFirst ? "alright, let's do this" : 'next'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── AUTH SCREEN ───
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#030303] flex items-center justify-center p-4 antialiased">
        <div className="w-full max-w-sm" style={{ animation: 'scaleIn 0.3s ease-out' }}>
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-[#E8A998] mb-1">fleabot</h1>
            <p className="text-[#7a6a60] text-sm">your witty mental health companion</p>
          </div>

          <div className="bg-[#0f0f12] border border-[#1a1a1e] rounded-lg p-6 space-y-4 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3 text-red-400 text-sm">
                {authError}
              </div>
            )}

            <div className="flex bg-[#08080c] rounded-md p-1">
              <button
                onClick={() => { setAuthMode('login'); setAuthError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded transition-all duration-200 ${authMode === 'login' ? 'bg-[#C9A87C] text-black' : 'text-[#7a6a60] hover:text-[#E8A998]'}`}
              >
                Log in
              </button>
              <button
                onClick={() => { setAuthMode('signup'); setAuthError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded transition-all duration-200 ${authMode === 'signup' ? 'bg-[#C9A87C] text-black' : 'text-[#7a6a60] hover:text-[#E8A998]'}`}
              >
                Sign up
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-[#7a6a60] uppercase tracking-wider mb-2 block">Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignUp())}
                placeholder="you@example.com"
                autoFocus
                className="w-full px-4 py-3 bg-[#0a0a0e] border border-[#1a1a1e] rounded-md text-[#E8A998] placeholder-[#4a3f3a] text-sm focus:outline-none focus:border-[#C9A87C]/50 focus:ring-1 focus:ring-[#C9A87C]/20 transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-[#7a6a60] uppercase tracking-wider mb-2 block">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignUp())}
                placeholder="at least 6 characters"
                className="w-full px-4 py-3 bg-[#0a0a0e] border border-[#1a1a1e] rounded-md text-[#E8A998] placeholder-[#4a3f3a] text-sm focus:outline-none focus:border-[#C9A87C]/50 focus:ring-1 focus:ring-[#C9A87C]/20 transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
              />
            </div>

            <button
              onClick={authMode === 'login' ? handleLogin : handleSignUp}
              disabled={!authEmail.trim() || !authPassword.trim()}
              className="w-full py-3 bg-[#C9A87C] text-black font-semibold rounded-md hover:bg-[#b8956a] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-sm"
            >
              {authMode === 'login' ? 'Log in' : 'Create account'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#1a1a1e]" />
              <span className="text-[#4a3f3a] text-xs">or</span>
              <div className="flex-1 h-px bg-[#1a1a1e]" />
            </div>

            <button
              onClick={handleGoogleSignIn}
              className="w-full py-3 bg-[#0a0a0e] border border-[#1a1a1e] text-[#E8A998] font-medium rounded-md hover:bg-[#111116] hover:border-[#2a2a2e] transition-all duration-200 text-sm flex items-center justify-center gap-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
          </div>

          <p className="text-[#4a3f3a] text-xs text-center mt-5">
            your conversations are private and encrypted
          </p>
        </div>
      </div>
    )
  }

  // ─── MAIN UI ───
  return (
    <div className="flex h-screen bg-gradient-to-b from-[#0a0a0a] to-[#030303] overflow-hidden antialiased">
      {/* ─── SIDEBAR ─── */}
      <div className={`${sidebarOpen ? 'w-[260px]' : 'w-0'} bg-[#08080c] border-r border-[#1a1a1e] flex flex-col transition-all duration-300 overflow-hidden flex-shrink-0`}>

        {/* User profile — top */}
        <div className="px-4 py-3 border-b border-[#1a1a1e] flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-[#6C3AED]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[#6C3AED] text-xs font-semibold">
              {(loadOnboardingData(user.uid)?.name || user.displayName || user.email || '?')[0].toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[#E8A998] truncate">{loadOnboardingData(user.uid)?.name || user.displayName || user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="text-[11px] text-[#7a6a60] border border-[#1a1a1e] rounded-md px-2.5 py-1 hover:text-red-400 hover:border-red-400/30 transition-all duration-150"
          >
            logout
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3 flex-shrink-0">
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-[#0f0f12] border border-[#1a1a1e] rounded-md text-sm text-[#E8A998] placeholder-[#4a3f3a] focus:outline-none focus:border-[#C9A87C]/30 transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
          />
        </div>

        {/* Chats list */}
        <div className="flex-1 px-2 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between mb-1 px-2">
            <span className="text-[11px] font-medium text-[#7a6a60] uppercase tracking-wider">Recent Chats</span>
          </div>
          <div className="space-y-0.5 pb-3">
            {filteredChats.length === 0 ? (
              <p className="text-[#4a3f3a] text-xs px-2 py-6 text-center">
                {searchQuery ? 'no chats match your search' : 'no chats yet. start a conversation.'}
              </p>
            ) : (
              filteredChats.map((chat, index) => (
                <div
                  key={chat.id}
                  onClick={() => handleLoadChat(chat)}
                  style={{ animation: `slideInLeft 0.2s ease-out ${index * 0.03}s both` }}
                  className={`flex items-center justify-between py-2 px-2.5 rounded-md cursor-pointer group transition-all duration-150 ${activeChatId === chat.id
                    ? 'bg-[#6C3AED]/5 border-l-2 border-[#6C3AED]'
                    : 'border-l-2 border-transparent hover:bg-[#ffffff]/[0.03]'
                    }`}
                >
                  <span className={`text-[13px] truncate flex-1 ${activeChatId === chat.id ? 'text-[#E8A998]' : 'text-[#9a8a80]'}`}>
                    {chat.title}
                  </span>
                  <span className="text-[11px] text-[#4a3f3a] ml-2 flex-shrink-0 group-hover:hidden">
                    {timeAgo(chat.updatedAt)}
                  </span>
                  <button
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    className="text-[11px] text-[#4a3f3a] hover:text-red-400 transition-colors duration-150 ml-2 flex-shrink-0 hidden group-hover:block"
                  >
                    delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Integrations */}
        <div className="px-3 pb-2 flex-shrink-0 border-t border-[#1a1a1e]">
          <button
            onClick={() => setIntegrationsOpen(!integrationsOpen)}
            className="w-full flex items-center justify-between py-2.5 text-[11px] font-medium text-[#7a6a60] uppercase tracking-wider hover:text-[#9a8a80] transition-colors"
          >
            <span>Integrations</span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-200 ${integrationsOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {integrationsOpen && (
            <div className="space-y-2 pb-3" style={{ animation: 'fadeIn 0.2s ease-out' }}>
              {/* Google Drive */}
              <div className="flex items-center justify-between px-2 py-2 rounded-md bg-[#0f0f12] border border-[#1a1a1e]">
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 19.5h7.5L12 14l2.5 5.5H22L12 2z" fill="#4285F4" opacity="0.8"/>
                    <path d="M2 19.5l3-5.5h14l3 5.5H2z" fill="#0F9D58" opacity="0.8"/>
                    <path d="M7.5 14L12 2l4.5 12H7.5z" fill="#F4B400" opacity="0.8"/>
                  </svg>
                  <span className="text-[12px] text-[#9a8a80] truncate">
                    {driveConnected ? 'Drive connected' : 'Google Drive'}
                  </span>
                </div>
                {driveConnected ? (
                  <button onClick={() => disconnectProvider('google-drive')} className="text-[10px] text-[#4a3f3a] hover:text-red-400 transition-colors cursor-pointer">
                    disconnect
                  </button>
                ) : (
                  <button onClick={() => connectProvider('google-drive')} className="text-[10px] text-[#C9A87C] hover:text-[#E8A998] transition-colors cursor-pointer">
                    connect
                  </button>
                )}
              </div>

              {/* Notion */}
              <div className="flex items-center justify-between px-2 py-2 rounded-md bg-[#0f0f12] border border-[#1a1a1e]">
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
                    <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fill="#fff"/>
                    <path d="M61.35.227L6.017 4.313C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723.967 5.053 3.3 8.167l12.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.437-.387 6.99-2.917 6.99-7.193V20.64c0-2.21-.86-2.85-3.52-4.797L73.8 3.313C69.893.14 68.147-.357 61.35.227zM25.5 19.32c-5.33.353-6.53.43-9.56-1.99L8.083 11.12c-.78-.78-.39-1.75 1.557-1.947l53.193-3.887c4.473-.39 6.8 1.167 8.543 2.527l8.93 6.413c.39.193-.193.97-1.167 1.057L25.5 19.32zm-3.5 71.14V28.88c0-2.527.78-3.697 3.107-3.893l58.827-3.497c2.14-.193 3.107 1.167 3.107 3.693v61.193c0 2.527-.39 4.67-3.883 4.863l-56.3 3.303c-3.497.193-4.857-1.167-4.857-3.883zm55.167-58.863c.39 1.557 0 3.113-1.557 3.307l-2.723.583v45.727c-2.33 1.363-4.473 2.14-6.223 2.14-2.913 0-3.687-.97-5.83-3.5L41.667 48.527v28.86l5.637 1.36s0 3.11-4.277 3.11l-11.8.78c-.39-.78 0-2.723 1.36-3.11l3.11-.78V39.893l-4.28-.39c-.39-1.557.583-3.887 3.11-4.08l12.643-.83 21.7 33.25V38.147l-4.667-.583c-.39-1.947 1.167-3.307 2.917-3.5l12.38-.78z" fill="#000"/>
                  </svg>
                  <span className="text-[12px] text-[#9a8a80] truncate">
                    {notionConnected ? (notionWorkspace || 'Notion connected') : 'Notion'}
                  </span>
                </div>
                {notionConnected ? (
                  <button onClick={() => disconnectProvider('notion')} className="text-[10px] text-[#4a3f3a] hover:text-red-400 transition-colors cursor-pointer">
                    disconnect
                  </button>
                ) : (
                  <button onClick={() => connectProvider('notion')} className="text-[10px] text-[#C9A87C] hover:text-[#E8A998] transition-colors cursor-pointer">
                    connect
                  </button>
                )}
              </div>

              <p className="text-[10px] text-[#4a3f3a] px-1">
                connect your apps so fleabot can read your journals and notes for better context
              </p>
            </div>
          )}
        </div>

        {/* New chat — bottom */}
        <div className="p-3 flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full py-2 px-3 rounded-md border border-[#1a1a1e] text-[#C9A87C] text-sm font-medium hover:bg-[#C9A87C]/5 hover:border-[#C9A87C]/30 transition-all duration-200"
          >
            New chat
          </button>
        </div>
      </div>

      {/* ─── MAIN AREA ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-[#0d0d0d] to-[#050505] relative">
        {/* Background stickers */}
        {stickerImages.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className="absolute w-10 h-10 object-cover rounded-sm pointer-events-none"
            style={{
              ...stickerPositions[i],
              opacity: 0.12,
              transform: `rotate(${stickerPositions[i].rotate})`,
            }}
          />
        ))}
        {/* Top bar */}
        <div className="h-11 flex items-center justify-between px-4 border-b border-[#1a1a1e] flex-shrink-0 relative z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#ffffff]/5 transition-colors duration-150 text-[#7a6a60] hover:text-[#E8A998]"
            >
              {sidebarOpen ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
            <span className="text-sm text-[#7a6a60]">{hasMessages ? 'Chat' : 'New chat'}</span>
            {hasMessages && (
              <span className="text-[10px] text-black font-semibold bg-[#C9A87C] px-2 py-0.5 rounded-md">fleabot</span>
            )}
          </div>
        </div>

        {/* ─── CONTENT ─── */}
        {!hasMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
            <h2 className="text-xl font-semibold text-[#E8A998] mb-2 text-center" style={{ animation: 'slideUp 0.4s ease-out' }}>
              how can i help you today?
            </h2>
            <p className="text-[#7a6a60] text-sm text-center max-w-md mb-8" style={{ animation: 'slideUp 0.4s ease-out 0.1s both' }}>
              i'm fleabot, your casual mental health companion. think of me as that friend who actually listens.
            </p>

            <div className="flex flex-col gap-2 max-w-md w-full mb-10">
              {[
                {
                  title: 'Quick Check-in',
                  desc: 'share how you\'re feeling right now',
                  prompt: 'i just want to do a quick check-in',
                },
                {
                  title: 'Talk It Out',
                  desc: 'vent about whatever\'s on your mind',
                  prompt: 'i need to vent about something',
                },
                {
                  title: 'Get Perspective',
                  desc: 'get a witty, honest take on things',
                  prompt: 'i need a fresh perspective on something',
                },
              ].map((card, i) => (
                <button
                  key={card.title}
                  onClick={() => sendMessage(card.prompt)}
                  style={{ animation: `slideUp 0.3s ease-out ${0.15 + i * 0.08}s both` }}
                  className="w-full text-left py-3 px-4 rounded-md border border-[#1a1a1e] hover:border-[#C9A87C]/30 hover:bg-[#C9A87C]/5 transition-all duration-200 cursor-pointer"
                >
                  <p className="text-[13px] text-[#E8A998] font-medium">{card.title}</p>
                  <p className="text-[11px] text-[#7a6a60] mt-0.5">{card.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto relative z-10">
            <div className="max-w-[720px] mx-auto px-6 py-6 space-y-5">
              {messages.map((message, index) => (
                <div
                  key={index}
                  style={{ animation: 'slideUp 0.3s ease-out' }}
                  className={message.role === 'user' ? 'text-right' : ''}
                >
                  <span className={`text-[12px] font-medium mb-1.5 block ${message.role === 'user' ? 'text-[#F5F5F5]' : 'text-[#C9A87C]'}`}>
                    {message.role === 'user' ? 'You' : 'fleabot'}
                  </span>
                  <p className={`text-[14px] leading-relaxed whitespace-pre-wrap inline-block ${message.role === 'user' ? 'text-[#E8A998] bg-[#ffffff]/[0.05] rounded-lg px-4 py-2.5' : 'text-[#E8A998]'}`}>{message.content}</p>
                </div>
              ))}

              {isLoading && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  <span className="text-[12px] font-medium text-[#C9A87C] mb-1.5 block">fleabot</span>
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-[#C9A87C]/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-[#C9A87C]/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-[#C9A87C]/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ─── INPUT BAR ─── */}
        <div className="px-6 pb-5 pt-2 flex-shrink-0 relative z-10">
          <div className="max-w-[720px] mx-auto">
            <div className="bg-[#0f0f12] border border-[#1a1a1e] rounded-md px-4 py-2.5 flex items-end gap-3 focus-within:border-[#C9A87C]/30 transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Message fleabot..."
                disabled={isLoading}
                rows={1}
                className="flex-1 py-1 bg-transparent text-[#E8A998] placeholder-[#4a3f3a] text-sm focus:outline-none resize-none leading-relaxed"
              />

              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="w-8 h-8 rounded-md bg-[#C9A87C] text-black flex items-center justify-center hover:bg-[#b8956a] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
            <p className="text-[#4a3f3a] text-[11px] text-center mt-2">
              fleabot can make mistakes. not a substitute for professional help.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
