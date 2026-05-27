import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { Server } from 'socket.io'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 4000)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const ROOM_ID = 'main'
const GAME_SECONDS = 60
const QUESTION_DURATION_MS = 7000
const WORLD_WIDTH = 1200
const WORLD_HEIGHT = 760

const PERFORMANCE_PROFILES = {
  standard: {
    maxWords: 52,
    spawnBase: 3.4,
    spawnRamp: 6.2,
    size: { correct: [20, 30], wrong: [15, 25] },
    speed: { min: 36, max: 88, progressMult: 0.68 },
    life: { min: 15000, max: 24000, progressDrop: 3200 },
    drift: { min: 8, max: 24 },
  },
  smooth: {
    maxWords: 36,
    spawnBase: 2.8,
    spawnRamp: 4.8,
    size: { correct: [18, 26], wrong: [14, 22] },
    speed: { min: 30, max: 72, progressMult: 0.58 },
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
    prompt: 'Where should employees go for quick links, announcements, and real-time company updates?',
    answer: 'OneConnect',
  },
  {
    prompt: 'Which app solves the challenge of Day-1 onboarding without chasing many teams?',
    answer: 'eMbark',
  },
  {
    prompt: 'If laptop and mobile tracking visibility is missing, which app should be used?',
    answer: 'MyAssets',
  },
  {
    prompt: 'Which platform keeps contract renewals, approvals, and obligations from being missed?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'Which app enables seamless guest entry with minimal calls and paperwork?',
    answer: 'VisitorManagementSystem',
  },
  {
    prompt: 'Which app makes career growth a guided process instead of guesswork?',
    answer: 'CAF',
  },
  {
    prompt: 'Where do teams manage planning, reporting, and governance in one flow?',
    answer: 'Pulse',
  },
  {
    prompt: 'Which app turns delivery excellence into visible score-based tracking?',
    answer: 'Compass',
  },
  {
    prompt: 'Which platform captures employee ideas that may otherwise never surface?',
    answer: 'HouseOfIdeas',
  },
  {
    prompt: 'An employee changes team and needs asset reassignment. Which app handles this?',
    answer: 'MyAssets',
  },
  {
    prompt: 'A receptionist needs to manage daily visitor entry logs. Which app is correct?',
    answer: 'VisitorManagementSystem',
  },
  {
    prompt: 'A manager needs to track contract ownership and accountability. Which app fits?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'Leaders want action-oriented employee sentiment and governance insights. Which app should they use?',
    answer: 'Pulse',
  },
  {
    prompt: 'Which app aligns execution with delivery goals and performance visibility?',
    answer: 'Compass',
  },
  {
    prompt: 'Where should new joiners complete onboarding and compliance steps?',
    answer: 'eMbark',
  },
  {
    prompt: 'Which app is the central place for enterprise communication and instant navigation?',
    answer: 'OneConnect',
  },
  {
    prompt: 'Which application should an employee use to submit and track innovation ideas?',
    answer: 'HouseOfIdeas',
  },
  {
    prompt: 'When contract lifecycle actions require approvals and reminders, which app is best?',
    answer: 'ContractManagementSystem',
  },
  {
    prompt: 'If a facility needs a clean digital guest experience, which app supports that process?',
    answer: 'VisitorManagementSystem',
  },
  {
    prompt: 'Which platform helps employees discover structured opportunities for career progression?',
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

function isOriginAllowed(origin) {
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes('*')) return true
  return ALLOWED_ORIGINS.includes(origin)
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

const room = createRoomState()

function createRoomState() {
  const currentQuestion = createQuestionRound()
  return {
    id: ROOM_ID,
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
  }
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
    const candidates = room.players.filter((player) => player.id !== leader.id)
    const receiver = pick(candidates)
    const transfer = Math.max(4, Math.floor(Math.abs(leader.score) * 0.15))
    leader.score -= transfer
    receiver.score += transfer
    addFeed(`Incident Spillover: ${transfer} points moved from ${leader.name}`)
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
  return {
    roomId: room.id,
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
    })),
    feed: room.feed,
    event: room.event,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    questionStats: room.questionStats,
  }
}

function resetGame() {
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

  if (nowMs >= room.nextQuestionAtMs) {
    rotateQuestion('timeout')
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

  socket.on('player:join', ({ name }) => {
    const cleaned = String(name || '').trim().slice(0, 24)
    if (!cleaned) {
      socket.emit('player:join:error', { message: 'Name is required' })
      return
    }

    if (!room.running) {
      resetGame()
      addFeed('Round restarted after new player joined')
    }

    const existing = room.players.find((player) => player.name.toLowerCase() === cleaned.toLowerCase())
    if (existing) {
      existing.socketId = socket.id
      socket.emit('player:joined', { playerId: existing.id, name: existing.name })
      addFeed(`${existing.name} reconnected`)
      return
    }

    const player = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      socketId: socket.id,
      name: cleaned,
      score: 0,
      correctHits: 0,
      wrongHits: 0,
      surveySubmitted: false,
      color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
    }

    room.players.push(player)
    socket.emit('player:joined', { playerId: player.id, name: player.name })
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

    const delta = word.isCorrect ? 14 : -7
    player.score += delta

    if (word.isCorrect) {
      player.correctHits += 1
      room.questionStats.correct += 1
      addFeed(`${player.name}: Correct answer +${delta}`)
      rotateQuestion('answered')
    } else {
      player.wrongHits += 1
      room.questionStats.wrong += 1
      addFeed(`${player.name}: Wrong answer ${delta}`)
      rotateQuestion('answered')
    }

    io.to(ROOM_ID).emit('state', serializeState())
  })

  socket.on('player:survey-submitted', () => {
    const player = playerFromSocket(socket.id)
    if (!player || player.surveySubmitted) return
    player.surveySubmitted = true
    addFeed(`${player.name} submitted survey feedback`)
    io.to(ROOM_ID).emit('state', serializeState())
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
}, 33)

app.get('/health', (_req, res) => {
  res.json({ ok: true, room: ROOM_ID, players: room.players.length })
})

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'word-battle-backend',
    room: ROOM_ID,
    allowedOrigins: ALLOWED_ORIGINS,
  })
})

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
