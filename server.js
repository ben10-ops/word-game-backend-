import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { Server } from 'socket.io'
import pg from 'pg'

const { Pool } = pg

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 4000)
const DATABASE_URL = process.env.DATABASE_URL || ''
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const ROOM_ID = 'main'
const GAME_SECONDS = 120
const QUESTION_DURATION_MS = 7000
const WORLD_WIDTH = 1200
const WORLD_HEIGHT = 760
const MAX_PLAYERS = 20

const PERFORMANCE_PROFILES = {
  standard: {
    maxWords: 34,
    spawnBase: 2.2,
    spawnRamp: 4.1,
    size: { correct: [24, 36], wrong: [19, 30] },
    speed: { min: 30, max: 74, progressMult: 0.58 },
    life: { min: 15000, max: 24000, progressDrop: 3200 },
    drift: { min: 8, max: 24 },
  },
  smooth: {
    maxWords: 26,
    spawnBase: 1.8,
    spawnRamp: 3.2,
    size: { correct: [23, 34], wrong: [18, 28] },
    speed: { min: 26, max: 60, progressMult: 0.5 },
    life: { min: 16500, max: 26000, progressDrop: 2600 },
    drift: { min: 6, max: 18 },
  },
}

const CHAOS_EVENTS = [
  { id: 'automation-surge', name: 'Queue Surge', durationMs: 7000 },
  { id: 'signal-freeze', name: 'Approval Hold', durationMs: 6500 },
  { id: 'visibility-drop', name: 'Monitoring Blur', durationMs: 6500 },
  { id: 'data-breach', name: 'Incident Spillover', durationMs: 5000 },
]

const OPS_NOTIFICATIONS = [
  'New intake batch arrived from field operations',
  'Visitor checkpoint volume increased at main gate',
  'Asset telemetry flagged abnormal vibration trend',
  'Contract review window opened for priority vendors',
  'Facilities team published urgent maintenance advisory',
  'Compliance desk requested evidence pack refresh',
  'Service route was re-prioritized by control center',
  'Journey milestone completed by regional unit',
  'Pulse signal indicates rising request backlog',
  'Compass engine suggested workflow reroute',
]

const PLAYER_COLORS = ['#52b788', '#f4a261', '#6ea8ff', '#ffd166', '#f08ae8', '#8adf9f']
const COLOR_VARIANT_COUNT = 8

const QUIZ_ITEMS = [
  {
    prompt: 'Need company updates and quick links. Which app do you open?',
    answer: 'OneConnect',
  },
  {
    prompt: 'New joiner onboarding tasks are pending. Which app helps most?',
    answer: 'eMbark',
  },
  {
    prompt: 'You need to check assigned devices and ownership. Which app is correct?',
    answer: 'MyAssets',
  },
  {
    prompt: 'Contract renewals and approvals must be tracked. Which app should you use?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'Guest entry and visitor logs are needed. Which app fits?',
    answer: 'VisitorManagementSystem',
  },
  {
    prompt: 'Career growth and pathway planning should be guided. Which app supports this?',
    answer: 'CAF',
  },
  {
    prompt: 'Leaders need planning and governance visibility. Which app is used?',
    answer: 'Pulse',
  },
  {
    prompt: 'Delivery maturity and execution scores are required. Which app provides this?',
    answer: 'Compass',
  },
  {
    prompt: 'Employees want to submit innovation ideas. Which app should be used?',
    answer: 'HouseOfIdeas',
  },
  {
    prompt: 'An employee changes team and needs device reassignment. Which app handles it?',
    answer: 'MyAssets',
  },
  {
    prompt: 'Reception needs daily visitor check-in records. Which app is correct?',
    answer: 'VisitorManagementSystem',
  },
  {
    prompt: 'Manager wants contract ownership and accountability tracking. Which app fits?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'Need governance and workforce insight dashboards. Which app should leaders use?',
    answer: 'Pulse',
  },
  {
    prompt: 'Execution must align with delivery goals and KPIs. Which app helps?',
    answer: 'Compass',
  },
  {
    prompt: 'Where should new joiners complete onboarding and compliance steps?',
    answer: 'eMbark',
  },
  {
    prompt: 'Which app is the central front door for enterprise communication?',
    answer: 'OneConnect',
  },
  {
    prompt: 'Which app should employees use to submit and track ideas?',
    answer: 'HouseOfIdeas',
  },
  {
    prompt: 'Approvals and reminders are needed for contracts. Which app is best?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'Facility team wants a digital guest experience. Which app supports it?',
    answer: 'VisitorManagementSystem',
  },
  {
    prompt: 'Which platform helps employees discover structured career opportunities?',
    answer: 'CAF',
  },
  {
    prompt: 'Which app provides governance-linked planning visibility for leadership reviews?',
    answer: 'Pulse',
  },
  {
    prompt: 'Which app gives teams a measurable view of delivery maturity and outcomes?',
    answer: 'Compass',
  },
  {
    prompt: 'Where should an employee check assigned devices and ownership trail?',
    answer: 'MyAssets',
  },
  {
    prompt: 'Which app acts as the front-door experience for updates and employee navigation?',
    answer: 'OneConnect',
  },
  {
    prompt: 'Which app is best for collecting strategic ideas before they get lost in meetings?',
    answer: 'HouseOfIdeas',
  },
  {
    prompt: 'Which platform ensures onboarding readiness without manual cross-team follow-ups?',
    answer: 'eMbark',
  },
  {
    prompt: 'Which app should procurement teams use to avoid contract renewal slippage?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'Which app supports employee career pathway clarity and guided development milestones?',
    answer: 'CAF',
  },
]

function normalizeOrigin(origin) {
  if (!origin) return ''
  return origin.trim().replace(/\/$/, '').toLowerCase()
}

function matchWildcardOrigin(origin, pattern) {
  try {
    const originUrl = new URL(origin)
    const patternUrl = new URL(pattern.replace('*.', ''))
    const patternHost = patternUrl.hostname
    return originUrl.protocol === patternUrl.protocol && originUrl.hostname.endsWith(`.${patternHost}`)
  } catch {
    return false
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes('*')) return true

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return true
  }

  const normalizedOrigin = normalizeOrigin(origin)

  // Allow all localhost / 127.0.0.1 origins regardless of port
  try {
    const parsed = new URL(origin)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true
  } catch { /* ignore invalid origin */ }

  return ALLOWED_ORIGINS.some((allowed) => {
    const normalizedAllowed = normalizeOrigin(allowed)
    if (normalizedAllowed === normalizedOrigin) return true
    if (normalizedAllowed.includes('*.') && normalizedAllowed.startsWith('http')) {
      return matchWildcardOrigin(normalizedOrigin, normalizedAllowed)
    }
    return false
  })
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`))
  },
}

const app = express()
app.use(cors(corsOptions))
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin ${origin} is not allowed by Socket.IO CORS`))
    },
  },
})

const rand = (min, max) => Math.random() * (max - min) + min
const pick = (items) => items[Math.floor(Math.random() * items.length)]
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const randInt = (min, max) => Math.floor(rand(min, max + 1))

const ANSWER_POOL = [...new Set(QUIZ_ITEMS.map((item) => item.answer))]
const TECH_DISTRACTORS = [
  'Microservice',
  'Webhook',
  'ZeroTrust',
  'Telemetry',
  'Observability',
  'Kubernetes',
  'Datapipeline',
  'Tokenization',
  'GraphQL',
  'EdgeCache',
  'LoadBalancer',
  'Sandbox',
  'FeatureFlag',
  'Container',
  'Serverless',
  'Encryption',
  'Throughput',
  'Scalability',
]
const OPTION_POOL = [...new Set([...ANSWER_POOL, ...TECH_DISTRACTORS])]
const QUESTION_OPTION_COUNT = 8
const MIN_CORRECT_WORDS = 2
const QUALIFICATION_RATIO = 0.6

const dbPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
      max: 10,
    })
  : null

let DB_READY = false

function getDatabaseName(connectionString) {
  if (!connectionString) return ''
  try {
    const url = new URL(connectionString)
    return url.pathname.replace(/^\//, '')
  } catch {
    return ''
  }
}

const ACTIVE_DB_NAME = getDatabaseName(DATABASE_URL)

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 64)
}

function sanitizeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength)
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`
}

async function ensureLegacyFeedbackColumnDefaults() {
  if (!dbPool) return

  const requiredInsertColumns = new Set([
    'room_id',
    'session_id',
    'player_name',
    'score_entry_id',
    'apps_used',
    'aspects_well',
    'aspects_well_other',
    'improvements_needed',
    'improvements_other',
    'additional_suggestions',
    'submitted_at',
  ])

  const schemaResult = await dbPool.query(
    `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'survey_feedback'
    `,
  )

  for (const column of schemaResult.rows) {
    const name = String(column.column_name || '')
    const isNotNull = String(column.is_nullable || '').toUpperCase() === 'NO'
    const hasDefault = column.column_default != null

    if (!name || !isNotNull || hasDefault || name === 'id' || requiredInsertColumns.has(name)) {
      continue
    }

    const dataType = String(column.data_type || '').toLowerCase()
    const udtName = String(column.udt_name || '')
    const columnId = quoteIdentifier(name)

    let defaultSql = `''`
    if (dataType === 'boolean') {
      defaultSql = 'FALSE'
    } else if (
      dataType.includes('int') ||
      dataType.includes('numeric') ||
      dataType.includes('real') ||
      dataType.includes('double')
    ) {
      defaultSql = '0'
    } else if (dataType.includes('timestamp') || dataType === 'date') {
      defaultSql = 'NOW()'
    } else if (udtName.startsWith('_')) {
      defaultSql = `ARRAY[]::${udtName.slice(1)}[]`
    }

    await dbPool.query(
      `ALTER TABLE survey_feedback ALTER COLUMN ${columnId} SET DEFAULT ${defaultSql}`,
    )
  }
}

async function initializeDatabase() {
  if (!dbPool) {
    console.warn('DATABASE_URL not configured. Feedback submissions will not persist.')
    return
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS player_scores (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT 'session-legacy',
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_hits INTEGER NOT NULL,
      wrong_hits INTEGER NOT NULL,
      attempted BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (room_id, session_id, player_name)
    )
  `)

  await dbPool.query(`
    ALTER TABLE player_scores
    ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL DEFAULT 'session-legacy'
  `)

  await dbPool.query(`
    ALTER TABLE player_scores
    DROP CONSTRAINT IF EXISTS player_scores_room_id_player_name_key
  `)

  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS player_scores_room_session_player_uq
    ON player_scores (room_id, session_id, player_name)
  `)

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS survey_feedback (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      score_entry_id BIGINT REFERENCES player_scores(id),
      apps_used TEXT[] NOT NULL,
      aspects_well TEXT[] NOT NULL,
      aspects_well_other TEXT,
      improvements_needed TEXT[] NOT NULL,
      improvements_other TEXT,
      additional_suggestions TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS room_id TEXT
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS session_id TEXT
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS player_name TEXT
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS score_entry_id BIGINT REFERENCES player_scores(id)
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS apps_used TEXT[]
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS aspects_well TEXT[]
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS aspects_well_other TEXT
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS improvements_needed TEXT[]
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS improvements_other TEXT
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS additional_suggestions TEXT
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN submitted_at SET DEFAULT NOW()
  `)

  await dbPool.query(`
    UPDATE survey_feedback SET submitted_at = NOW() WHERE submitted_at IS NULL
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN submitted_at SET NOT NULL
  `)

  await dbPool.query(
    `UPDATE survey_feedback SET room_id = COALESCE(room_id, $1) WHERE room_id IS NULL`,
    [ROOM_ID],
  )
  await dbPool.query(
    `UPDATE survey_feedback SET session_id = COALESCE(session_id, $1) WHERE session_id IS NULL`,
    ['session-legacy'],
  )
  await dbPool.query(`UPDATE survey_feedback SET player_name = COALESCE(player_name, 'Unknown') WHERE player_name IS NULL`)
  await dbPool.query(`UPDATE survey_feedback SET apps_used = COALESCE(apps_used, ARRAY[]::text[]) WHERE apps_used IS NULL`)
  await dbPool.query(
    `UPDATE survey_feedback SET aspects_well = COALESCE(aspects_well, ARRAY[]::text[]) WHERE aspects_well IS NULL`,
  )
  await dbPool.query(
    `UPDATE survey_feedback SET improvements_needed = COALESCE(improvements_needed, ARRAY[]::text[]) WHERE improvements_needed IS NULL`,
  )

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN room_id SET NOT NULL
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN session_id SET NOT NULL
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN player_name SET NOT NULL
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN apps_used SET NOT NULL
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN aspects_well SET NOT NULL
  `)

  await dbPool.query(`
    ALTER TABLE survey_feedback
    ALTER COLUMN improvements_needed SET NOT NULL
  `)

  await ensureLegacyFeedbackColumnDefaults()

  DB_READY = true
  console.log('PostgreSQL feedback storage initialized')
}

function sampleN(items, n) {
  const pool = [...items]
  const out = []
  while (pool.length > 0 && out.length < n) {
    const index = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(index, 1)[0])
  }
  return out
}

function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function createQuestionRound(previousId = null) {
  const candidates = QUIZ_ITEMS.filter((item) => item.prompt !== previousId)
  const base = pick(candidates.length > 0 ? candidates : QUIZ_ITEMS)
  const distractorCount = Math.max(1, Math.min(QUESTION_OPTION_COUNT - 1, OPTION_POOL.length - 1))
  const distractors = sampleN(
    OPTION_POOL.filter((answer) => answer !== base.answer),
    distractorCount,
  )
  return {
    id: base.prompt,
    prompt: base.prompt,
    answer: base.answer,
    options: shuffle([base.answer, ...distractors]),
  }
}

function createSessionId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function computeTopFive(players) {
  return [...players]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (right.correctHits !== left.correctHits) return right.correctHits - left.correctHits
      if (left.wrongHits !== right.wrongHits) return left.wrongHits - right.wrongHits
      return left.name.localeCompare(right.name)
    })
    .slice(0, 5)
    .map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      score: player.score,
      attempted: player.correctHits + player.wrongHits > 0,
    }))
}

const room = createRoomState()

function createRoomState() {
  const currentQuestion = createQuestionRound()
  return {
    id: ROOM_ID,
    sessionId: createSessionId(),
    performanceMode: 'smooth',
    startedAtMs: Date.now(),
    running: true,
    timeLeft: GAME_SECONDS,
    currentQuestion,
    words: primeWordsForQuestion(currentQuestion, 'smooth', 0),
    players: [],
    feed: ['Live multiplayer simulation started'],
    event: { id: null, name: '', endsAtMs: 0 },
    nextEventAtMs: Date.now() + 9000,
    nextQuestionAtMs: Date.now() + QUESTION_DURATION_MS,
    spawnBudget: 0,
    lastTickMs: Date.now(),
    touchedWords: new Set(),
    questionStats: { correct: 0, wrong: 0 },
    questionsAppeared: 1,
    sessionTopFive: [],
  }
}

function updateSessionTopFive() {
  room.sessionTopFive = computeTopFive(room.players)
}

function requiredCorrectHits() {
  return Math.max(1, Math.ceil(room.questionsAppeared * QUALIFICATION_RATIO))
}

function addFeed(message) {
  room.feed = [message, ...room.feed].slice(0, 8)
}

function activeProfile() {
  return PERFORMANCE_PROFILES[room.performanceMode] || PERFORMANCE_PROFILES.smooth
}

function randomColorVariant(excluded = new Set()) {
  const candidates = []
  for (let i = 1; i <= COLOR_VARIANT_COUNT; i += 1) {
    if (!excluded.has(i)) candidates.push(i)
  }

  return pick(
    candidates.length > 0 ? candidates : Array.from({ length: COLOR_VARIANT_COUNT }, (_, i) => i + 1),
  )
}

function createOptionWord(progress, profile, question, forcedText = null, forcedColorVariant = null) {
  const text = forcedText || pick(question.options)
  const isCorrect = text === question.answer
  const type = isCorrect ? 'target' : 'decoy'

  const size = isCorrect
    ? rand(profile.size.correct[0], profile.size.correct[1])
    : rand(profile.size.wrong[0], profile.size.wrong[1])

  const halfW = Math.max(52, text.length * size * 0.27)
  const halfH = Math.max(18, size * 0.74)
  const x = rand(halfW + 24, WORLD_WIDTH - halfW - 24)
  const y = rand(halfH + 24, WORLD_HEIGHT - halfH - 24)
  const angle = rand(0, Math.PI * 2)
  const speed = rand(profile.speed.min, profile.speed.max) * (1 + progress * profile.speed.progressMult)

  return {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text,
    type,
    tier: isCorrect ? 'high' : 'mid',
    isCorrect,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    halfW,
    halfH,
    lifeMs: rand(profile.life.min, profile.life.max) - progress * profile.life.progressDrop,
    ageMs: 0,
    driftAmp: rand(profile.drift.min, profile.drift.max),
    driftFreq: rand(0.8, 2.1),
    phase: rand(0, Math.PI * 2),
    colorVariant: forcedColorVariant || randInt(1, COLOR_VARIANT_COUNT),
    frozen: false,
  }
}

function primeWordsForQuestion(question, mode = 'smooth', progress = 0) {
  const profile = PERFORMANCE_PROFILES[mode] || PERFORMANCE_PROFILES.smooth
  const initialCount = Math.min(profile.maxWords, mode === 'smooth' ? 14 : 18)
  const firstCorrectColor = randomColorVariant()
  const secondCorrectColor = randomColorVariant(new Set([firstCorrectColor]))
  const words = [
    createOptionWord(progress, profile, question, question.answer, firstCorrectColor),
    createOptionWord(progress, profile, question, question.answer, secondCorrectColor),
  ]
  const decoyPool = shuffle(question.options.filter((option) => option !== question.answer))
  let decoyIndex = 0

  while (words.length < initialCount) {
    const nextDecoy = decoyPool.length > 0 ? decoyPool[decoyIndex % decoyPool.length] : null
    words.push(createOptionWord(progress, profile, question, nextDecoy))
    decoyIndex += 1
  }

  return words
}

function retargetWordsForQuestion(question, profile, progress) {
  if (room.words.length === 0) {
    room.words = primeWordsForQuestion(question, room.performanceMode, progress)
    return
  }

  const totalWords = room.words.length
  const desiredCorrect = Math.min(MIN_CORRECT_WORDS, totalWords)
  const correctSlots = new Set()

  while (correctSlots.size < desiredCorrect) {
    correctSlots.add(randInt(0, totalWords - 1))
  }

  const decoyPool = shuffle(question.options.filter((option) => option !== question.answer))
  const correctColorPool = shuffle(Array.from({ length: COLOR_VARIANT_COUNT }, (_, index) => index + 1))
  let decoyIndex = 0
  let correctColorIndex = 0

  room.words = room.words.map((word, index) => {
    const isCorrect = correctSlots.has(index)
    const text = isCorrect
      ? question.answer
      : decoyPool.length > 0
        ? decoyPool[decoyIndex++ % decoyPool.length]
        : pick(question.options)

    const size = isCorrect
      ? rand(profile.size.correct[0], profile.size.correct[1])
      : rand(profile.size.wrong[0], profile.size.wrong[1])

    return {
      ...word,
      text,
      type: isCorrect ? 'target' : 'decoy',
      tier: isCorrect ? 'high' : 'mid',
      isCorrect,
      size,
      halfW: Math.max(52, text.length * size * 0.27),
      halfH: Math.max(18, size * 0.74),
      colorVariant: isCorrect
        ? correctColorPool[correctColorIndex++ % correctColorPool.length]
        : randInt(1, COLOR_VARIANT_COUNT),
      ageMs: 0,
      lifeMs: rand(profile.life.min, profile.life.max) - progress * profile.life.progressDrop,
    }
  })
}

function countCorrectOptionWords() {
  return room.words.reduce((count, word) => (word.isCorrect ? count + 1 : count), 0)
}

function ensureCorrectOptionWords(progress, profile) {
  let correctWords = countCorrectOptionWords()

  while (correctWords < MIN_CORRECT_WORDS) {
    const usedCorrectColors = new Set(
      room.words.filter((word) => word.isCorrect).map((word) => word.colorVariant),
    )
    const nextCorrectColor = randomColorVariant(usedCorrectColors)

    if (room.words.length < profile.maxWords) {
      room.words.push(
        createOptionWord(
          progress,
          profile,
          room.currentQuestion,
          room.currentQuestion.answer,
          nextCorrectColor,
        ),
      )
      correctWords += 1
      continue
    }

    const replaceIndex = room.words.findIndex((word) => !word.isCorrect)
    if (replaceIndex === -1) break

    room.words[replaceIndex] = createOptionWord(
      progress,
      profile,
      room.currentQuestion,
      room.currentQuestion.answer,
      nextCorrectColor,
    )
    correctWords += 1
  }
}

function rotateQuestion(reason = 'timeout') {
  const nowMs = Date.now()
  const progress = clamp((nowMs - room.startedAtMs) / (GAME_SECONDS * 1000), 0, 1)
  const profile = activeProfile()
  room.currentQuestion = createQuestionRound(room.currentQuestion.id)
  room.questionsAppeared += 1
  room.touchedWords.clear()
  retargetWordsForQuestion(room.currentQuestion, profile, progress)
  ensureCorrectOptionWords(progress, profile)
  room.spawnBudget = 1.2
  room.nextQuestionAtMs = nowMs + QUESTION_DURATION_MS
  if (reason === 'answered') {
    addFeed('New question loaded after correct answer')
  } else {
    addFeed('Question rotated by control system')
  }
  addFeed(`Ops Notice: ${pick(OPS_NOTIFICATIONS)}`)
}

function triggerEvent(nowMs) {
  const event = pick(CHAOS_EVENTS)
  room.event = { id: event.id, name: event.name, endsAtMs: nowMs + event.durationMs }
  addFeed(`Operational Event: ${event.name}`)
  addFeed(`Ops Notice: ${pick(OPS_NOTIFICATIONS)}`)

  if (event.id === 'signal-freeze') {
    room.words.forEach((word) => {
      word.frozen = Math.random() < 0.38
    })
  }

  if (event.id === 'data-breach' && room.players.length > 1) {
    const sorted = [...room.players].sort((a, b) => b.score - a.score)
    const leader = sorted[0]
    if (leader.score <= 0) return
    const candidates = room.players.filter((player) => player.id !== leader.id)
    const receiver = pick(candidates)
    const transfer = Math.max(1, Math.floor(Math.abs(leader.score) * 0.15))
    const safeTransfer = Math.min(leader.score, transfer)
    leader.score -= safeTransfer
    receiver.score += safeTransfer
    addFeed(`Incident Spillover: ${safeTransfer} points moved from ${leader.name}`)
  }
}

function clearEvent() {
  if (room.event.id === 'signal-freeze') {
    room.words.forEach((word) => {
      word.frozen = false
    })
  }
  room.event = { id: null, name: '', endsAtMs: 0 }
}

function serializeState() {
  const requiredCorrect = requiredCorrectHits()
  updateSessionTopFive()
  return {
    roomId: room.id,
    sessionId: room.sessionId,
    performanceMode: room.performanceMode,
    running: room.running,
    timeLeft: room.timeLeft,
    question: {
      prompt: room.currentQuestion.prompt,
      options: room.currentQuestion.options,
    },
    words: room.words,
    players: room.players.map(({ socketId, ...player }) => ({
      ...player,
      isOnline: Boolean(socketId),
      isQualified: (player.correctHits || 0) >= requiredCorrect,
      attempted: (player.correctHits || 0) + (player.wrongHits || 0) > 0,
    })),
    feed: room.feed,
    event: room.event,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    questionStats: room.questionStats,
    sessionTopFive: room.sessionTopFive,
    maxPlayers: MAX_PLAYERS,
  }
}

function resetGame() {
  room.sessionId = createSessionId()
  room.startedAtMs = Date.now()
  room.running = true
  room.timeLeft = GAME_SECONDS
  room.currentQuestion = createQuestionRound()
  room.words = primeWordsForQuestion(room.currentQuestion, room.performanceMode, 0)
  room.feed = ['Live multiplayer simulation restarted']
  room.event = { id: null, name: '', endsAtMs: 0 }
  room.nextEventAtMs = Date.now() + 9000
  room.nextQuestionAtMs = Date.now() + QUESTION_DURATION_MS
  room.spawnBudget = 0
  room.lastTickMs = Date.now()
  room.touchedWords.clear()
  room.questionStats = { correct: 0, wrong: 0 }
  room.questionsAppeared = 1
  room.sessionTopFive = []
  room.players = room.players.map((player) => ({
    ...player,
    score: 0,
    correctHits: 0,
    wrongHits: 0,
    surveySubmitted: false,
  }))
}

function gameTick() {
  const nowMs = Date.now()
  const dtMs = nowMs - room.lastTickMs
  const dt = dtMs / 1000
  room.lastTickMs = nowMs

  if (!room.running) {
    return
  }

  const elapsedMs = nowMs - room.startedAtMs
  const progress = clamp(elapsedMs / (GAME_SECONDS * 1000), 0, 1)
  const profile = activeProfile()
  room.timeLeft = Math.max(0, GAME_SECONDS - Math.floor(elapsedMs / 1000))

  if (room.timeLeft <= 0) {
    room.running = false
    updateSessionTopFive()
    addFeed('Timer complete. Match ended.')
    return
  }

  if (!room.event.id && nowMs >= room.nextEventAtMs) {
    triggerEvent(nowMs)
    room.nextEventAtMs = nowMs + rand(10000, 14500)
  }

  if (room.event.id && nowMs >= room.event.endsAtMs) {
    clearEvent()
  }

  const spawnRate = profile.spawnBase + progress * profile.spawnRamp
  room.spawnBudget += dt * spawnRate

  while (room.spawnBudget >= 1 && room.words.length < profile.maxWords) {
    room.words.push(createOptionWord(progress, profile, room.currentQuestion))
    room.spawnBudget -= 1
  }

  const eventId = room.event.id
  room.words = room.words
    .map((word) => {
      word.ageMs += dtMs
      if (word.ageMs >= word.lifeMs) return null

      const speedBoost = eventId === 'automation-surge' ? 1.68 : 1
      const freezeFactor = word.frozen ? 0.08 : 1
      const driftX = Math.sin((elapsedMs / 1000) * word.driftFreq + word.phase) * word.driftAmp
      const driftY =
        Math.cos((elapsedMs / 1000) * word.driftFreq * 0.8 + word.phase) * word.driftAmp

      word.x += (word.vx + driftX) * dt * speedBoost * freezeFactor
      word.y += (word.vy + driftY) * dt * speedBoost * freezeFactor

      if (word.x <= word.halfW) {
        word.x = word.halfW
        word.vx = Math.abs(word.vx)
      }
      if (word.x >= WORLD_WIDTH - word.halfW) {
        word.x = WORLD_WIDTH - word.halfW
        word.vx = -Math.abs(word.vx)
      }
      if (word.y <= word.halfH) {
        word.y = word.halfH
        word.vy = Math.abs(word.vy)
      }
      if (word.y >= WORLD_HEIGHT - word.halfH) {
        word.y = WORLD_HEIGHT - word.halfH
        word.vy = -Math.abs(word.vy)
      }

      return word
    })
    .filter(Boolean)

  ensureCorrectOptionWords(progress, profile)
}

function playerFromSocket(socketId) {
  return room.players.find((player) => player.socketId === socketId)
}

function findPlayerByIdentity(playerId, playerName, sessionId) {
  const normalizedName = String(playerName || '').trim().toLowerCase()
  const normalizedSessionId = sanitizeText(sessionId, 64)

  if (normalizedSessionId) {
    const bySession = room.players.find((player) => player.sessionId === normalizedSessionId)
    if (bySession) return bySession
  }

  if (playerId) {
    const byId = room.players.find((player) => player.id === playerId)
    if (byId) return byId
  }

  if (normalizedName) {
    const byName = room.players.find((player) => player.name.toLowerCase() === normalizedName)
    if (byName) return byName
  }

  return null
}

io.on('connection', (socket) => {
  socket.join(ROOM_ID)
  socket.emit('state', serializeState())

  socket.on('host:reset', () => {
    resetGame()
  })

  socket.on('host:set-performance-mode', ({ mode }) => {
    const nextMode = mode === 'standard' ? 'standard' : mode === 'smooth' ? 'smooth' : null
    if (!nextMode) return
    room.performanceMode = nextMode
    room.spawnBudget = 0
    const profile = activeProfile()
    if (room.words.length > profile.maxWords) {
      room.words = room.words.slice(0, profile.maxWords)
    }
    addFeed(`Performance mode switched to ${nextMode}`)
  })

  socket.on('player:join', ({ name, sessionId }) => {
    const cleaned = String(name || '').trim().slice(0, 24)
    const cleanedSessionId = sanitizeText(sessionId, 64) || `client-${socket.id}`
    if (!cleaned) {
      socket.emit('player:join:error', { message: 'Name is required' })
      return
    }

    let existing = room.players.find((player) => player.sessionId === cleanedSessionId)
    if (!existing) {
      existing = room.players.find((player) => player.name.toLowerCase() === cleaned.toLowerCase())
    }

    if (existing) {
      existing.socketId = socket.id
      existing.sessionId = cleanedSessionId
      socket.emit('player:joined', {
        playerId: existing.id,
        name: existing.name,
        sessionId: existing.sessionId,
      })
      addFeed(`${existing.name} reconnected`)
      return
    }

    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('player:join:error', { message: 'Room is full (20 players max).' })
      return
    }

    const player = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sessionId: cleanedSessionId,
      socketId: socket.id,
      name: cleaned,
      score: 0,
      correctHits: 0,
      wrongHits: 0,
      surveySubmitted: false,
      color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
    }

    room.players.push(player)
    socket.emit('player:joined', {
      playerId: player.id,
      name: player.name,
      sessionId: player.sessionId,
    })
    addFeed(`${player.name} joined the round`)
  })

  socket.on('word:tap', ({ wordId }) => {
    if (!room.running) return
    if (!wordId || room.touchedWords.has(wordId)) return

    const player = playerFromSocket(socket.id)
    if (!player) return

    const index = room.words.findIndex((word) => word.id === wordId)
    if (index === -1) return

    room.touchedWords.add(wordId)
    setTimeout(() => room.touchedWords.delete(wordId), 120)

    const word = room.words[index]

    const delta = word.isCorrect ? 14 : 0
    player.score = Math.max(0, player.score + delta)

    if (word.isCorrect) {
      player.correctHits += 1
      room.questionStats.correct += 1
      addFeed(`${player.name}: Correct answer +${delta}`)
      rotateQuestion('answered')
    } else {
      player.wrongHits += 1
      room.questionStats.wrong += 1
      addFeed(`${player.name}: Wrong answer +0`)
      rotateQuestion('answered')
    }

    io.to(ROOM_ID).emit('state', serializeState())
  })

  socket.on('player:survey-submitted', async (payload = {}, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {}

    console.log(
      '[survey] submit event',
      JSON.stringify({
        socketId: socket.id,
        payloadPlayerId: payload?.playerId || '',
        payloadPlayerName: payload?.playerName || '',
        payloadSessionId: payload?.playerSessionId || '',
      }),
    )

    let player = playerFromSocket(socket.id)
    if (!player) {
      player = findPlayerByIdentity(payload?.playerId, payload?.playerName, payload?.playerSessionId)
      if (player) {
        player.socketId = socket.id
        console.log(`[survey] restored player socket mapping for ${player.name}`)
      }
    }

    if (!player) {
      console.warn('[survey] player session not found for submission')
      ack({ ok: false, message: 'Player session not found' })
      return
    }

    if (player.surveySubmitted) {
      ack({ ok: true })
      return
    }

    if (!dbPool || !DB_READY) {
      ack({ ok: false, message: 'Feedback storage is not configured. Please try later.' })
      return
    }

    const appsUsed = sanitizeStringArray(payload.appsUsed)
    const aspectsWell = sanitizeStringArray(payload.aspectsWell)
    const improvementsNeeded = sanitizeStringArray(payload.improvementsNeeded)
    const aspectsWellOther = sanitizeText(payload.aspectsWellOther, 400)
    const improvementsOther = sanitizeText(payload.improvementsOther, 400)
    const additionalSuggestions = sanitizeText(payload.additionalSuggestions, 4000)

    const normalizedAspectsWell = [...aspectsWell]
    if (normalizedAspectsWell.length === 0 && aspectsWellOther) {
      normalizedAspectsWell.push(`Other: ${aspectsWellOther}`)
    }

    const normalizedImprovementsNeeded = [...improvementsNeeded]
    if (normalizedImprovementsNeeded.length === 0 && improvementsOther) {
      normalizedImprovementsNeeded.push(`Other: ${improvementsOther}`)
    }

    console.log(
      '[survey] received',
      JSON.stringify({
        roomId: room.id,
        playerName: player.name,
        appsUsedCount: appsUsed.length,
        aspectsWellCount: normalizedAspectsWell.length,
        improvementsNeededCount: normalizedImprovementsNeeded.length,
      }),
    )

    if (
      appsUsed.length === 0 ||
      normalizedAspectsWell.length === 0 ||
      normalizedImprovementsNeeded.length === 0
    ) {
      console.warn(`[survey] validation failed for ${player.name}`)
      ack({ ok: false, message: 'Please complete all required survey sections.' })
      return
    }

    try {
      const scoreResult = await dbPool.query(
        `
          INSERT INTO player_scores (
            room_id,
            session_id,
            player_name,
            score,
            correct_hits,
            wrong_hits,
            attempted,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (room_id, session_id, player_name)
          DO UPDATE SET
            score = EXCLUDED.score,
            correct_hits = EXCLUDED.correct_hits,
            wrong_hits = EXCLUDED.wrong_hits,
            attempted = EXCLUDED.attempted,
            updated_at = NOW()
          RETURNING id
        `,
        [
          room.id,
          room.sessionId,
          player.name,
          player.score,
          player.correctHits,
          player.wrongHits,
          player.correctHits + player.wrongHits > 0,
        ],
      )

      const scoreEntryId = scoreResult.rows[0]?.id || null

      console.log(
        `[survey] score upserted for ${player.name} (scoreEntryId=${scoreEntryId ?? 'null'})`,
      )

      await dbPool.query(
        `
          INSERT INTO survey_feedback (
            room_id,
            session_id,
            player_name,
            score_entry_id,
            apps_used,
            aspects_well,
            aspects_well_other,
            improvements_needed,
            improvements_other,
            additional_suggestions,
            submitted_at
          )
          VALUES (
            $1, $2, $3, $4, $5::text[], $6::text[], $7, $8::text[], $9, $10, NOW()
          )
        `,
        [
          room.id,
          room.sessionId,
          player.name,
          scoreEntryId,
          appsUsed,
          normalizedAspectsWell,
          aspectsWellOther,
          normalizedImprovementsNeeded,
          improvementsOther,
          additionalSuggestions,
        ],
      )

      console.log(`[survey] feedback inserted for ${player.name}`)
    } catch (error) {
      console.error('Failed to save feedback submission', error)
      ack({ ok: false, message: 'Unable to save feedback. Please try again.' })
      return
    }

    player.surveySubmitted = true
    addFeed(`${player.name} submitted survey feedback`)
    io.to(ROOM_ID).emit('state', serializeState())
    ack({ ok: true })
  })

  socket.on('disconnect', () => {
    const player = playerFromSocket(socket.id)
    if (player) {
      player.socketId = ''
      addFeed(`${player.name} disconnected`)
    }
  })
})

setInterval(() => {
  gameTick()
  io.to(ROOM_ID).emit('state', serializeState())
}, 50)

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    room: ROOM_ID,
    players: room.players.length,
    dbReady: DB_READY,
    database: ACTIVE_DB_NAME,
  })
})

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'word-battle-backend',
    room: ROOM_ID,
    allowedOrigins: ALLOWED_ORIGINS,
    dbReady: DB_READY,
    database: ACTIVE_DB_NAME,
  })
})

try {
  await initializeDatabase()
} catch (err) {
  console.error('DB initialization failed — server will start without database support:', err.message || err)
  DB_READY = false
}

httpServer.listen(PORT, HOST, () => {
  const interfaces = networkInterfaces()
  const lanIps = Object.values(interfaces)
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)

  console.log(`Realtime server listening on http://localhost:${PORT}`)
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
  lanIps.forEach((ip) => {
    console.log(`Realtime server LAN URL: http://${ip}:${PORT}`)
  })
})
