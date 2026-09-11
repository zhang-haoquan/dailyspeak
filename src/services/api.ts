import type {
  CardProgress,
  Domain,
  ReviewItem,
  ScenarioCard,
  TodayCard,
  User,
  UserProfile,
} from '../types'
import { SEED_CARDS } from '../data/cards'
import { storage } from './storage'
import {
  isDue,
  formatDateKey,
  scheduleFirstReview,
  scheduleNextReview,
} from './review'

/**
 * Mock API 层：模拟 NestJS + Supabase 后端（PRD 08 章技术架构）。
 * 所有数据落 localStorage，接口签名与真实后端对齐，后续可直接替换为 fetch 调用。
 */

// ---------- 认证 ----------

const KEY_USERS = 'users'
const KEY_SESSION = 'session'
const KEY_PROFILE = 'profile'
const KEY_PROGRESS = 'progress'
const KEY_REVIEWS = 'reviews'
const KEY_DONE_DAYS = 'doneDays'
const KEY_TODAY_PLAN = 'todayPlan'

type AuthError = { message: string }

function getUsers(): User[] {
  return storage.read<User[]>(KEY_USERS, [])
}

export function isEmailOrPhone(account: string): boolean {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const phone = /^1[3-9]\d{9}$/
  return email.test(account) || phone.test(account)
}

/** PRD 5.1：密码 ≥ 8 位，且同时包含大小写字母与数字 */
export function isStrongPassword(pwd: string): boolean {
  return pwd.length >= 8 && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd)
}

export function register(account: string, password: string): { user: User } | AuthError {
  if (!isEmailOrPhone(account)) {
    return { message: '请输入合法的邮箱或 11 位手机号' }
  }
  if (!isStrongPassword(password)) {
    return { message: '密码至少 8 位，需包含大小写字母和数字' }
  }
  const users = getUsers()
  if (users.some((u) => u.account === account)) {
    return { message: '该账号已注册，请直接登录' }
  }
  const user: User = {
    id: storage.uid(),
    account,
    password,
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  storage.write(KEY_USERS, users)
  storage.write(KEY_SESSION, { userId: user.id })
  return { user }
}

export function login(account: string, password: string): { user: User } | AuthError {
  const users = getUsers()
  const user = users.find((u) => u.account === account)
  if (!user || user.password !== password) {
    return { message: '账号或密码不正确' }
  }
  storage.write(KEY_SESSION, { userId: user.id })
  return { user }
}

export function logout(): void {
  storage.remove(KEY_SESSION)
}

export function getSessionUser(): User | null {
  const session = storage.read<{ userId: string } | null>(KEY_SESSION, null)
  if (!session) return null
  const user = getUsers().find((u) => u.id === session.userId)
  return user ?? null
}

// ---------- 画像（Onboarding） ----------

export function getProfile(userId: string): UserProfile | null {
  const profile = storage.read<UserProfile | null>(KEY_PROFILE, null)
  return profile && profile.userId === userId ? profile : null
}

export function saveProfile(userId: string, domains: Domain[], dailyCount: number): UserProfile {
  const profile: UserProfile = {
    userId,
    domains,
    dailyCount,
    onboarded: true,
    createdAt: new Date().toISOString(),
  }
  storage.write(KEY_PROFILE, profile)
  // 领域/条数变了，今天的任务快照要重新生成
  storage.remove(KEY_TODAY_PLAN)
  return profile
}

// ---------- 进度与复习 ----------

function getProgress(userId: string): CardProgress[] {
  const all = storage.read<CardProgress[]>(KEY_PROGRESS, [])
  return all.filter((p) => p.userId === userId)
}

function getReviews(userId: string): ReviewItem[] {
  const all = storage.read<ReviewItem[]>(KEY_REVIEWS, [])
  return all.filter((r) => r.userId === userId)
}

export function getCardProgress(userId: string, cardId: string): CardProgress | null {
  return getProgress(userId).find((p) => p.cardId === cardId) ?? null
}

function upsertProgress(progress: CardProgress): void {
  const all = storage.read<CardProgress[]>(KEY_PROGRESS, [])
  const idx = all.findIndex(
    (p) => p.userId === progress.userId && p.cardId === progress.cardId,
  )
  if (idx >= 0) all[idx] = progress
  else all.push(progress)
  storage.write(KEY_PROGRESS, all)
}

function upsertReview(item: ReviewItem): void {
  const all = storage.read<ReviewItem[]>(KEY_REVIEWS, [])
  const idx = all.findIndex(
    (r) => r.userId === item.userId && r.cardId === item.cardId,
  )
  if (idx >= 0) all[idx] = item
  else all.push(item)
  storage.write(KEY_REVIEWS, all)
}

/** 记录打卡日（用于历史统计） */
function markDoneDay(userId: string, dateKey: string): void {
  const map = storage.read<Record<string, string[]>>(KEY_DONE_DAYS, {})
  const list = map[userId] ?? []
  if (!list.includes(dateKey)) list.push(dateKey)
  map[userId] = list
  storage.write(KEY_DONE_DAYS, map)
}

/**
 * 跟读打分完成：只记录跟读分与进度。
 * 复习排期统一在「整卡完成」（即应答打分）时推进，
 * 避免同一张复习卡在一次练习里被重复推进两个阶段（PRD 5.5）。
 */
export function submitRepeatScore(
  userId: string,
  cardId: string,
  score: number,
  mode: 'new' | 'review',
): void {
  const prev = getCardProgress(userId, cardId)
  const progress: CardProgress = {
    userId,
    cardId,
    repeatScore: score,
    answerScore: prev?.answerScore ?? null,
    composite: null,
    doneAt: new Date().toISOString(),
    mode,
  }
  upsertProgress(progress)
  markDoneDay(userId, formatDateKey(new Date()))
}

/**
 * 应答打分完成（整卡完成）：
 * 记录 answerScore + composite；
 * 新卡完成 → 生成 S1 首条复习排期；
 * 复习卡完成 → 按综合分推进/回退一个阶段（仅此一次）。
 */
export function submitAnswerScore(
  userId: string,
  cardId: string,
  repeatScore: number,
  answerScore: number,
  mode: 'new' | 'review',
): void {
  const composite = Math.round(repeatScore * 0.5 + answerScore * 0.5)
  const progress: CardProgress = {
    userId,
    cardId,
    repeatScore,
    answerScore,
    composite,
    doneAt: new Date().toISOString(),
    mode,
  }
  upsertProgress(progress)

  const review = getReviews(userId).find((r) => r.cardId === cardId)
  if (mode === 'review' && review) {
    upsertReview(scheduleNextReview(review, composite))
  } else if (!review) {
    // 新卡完成，或复习卡缺少排期记录（异常兜底）→ 生成 S1 排期
    upsertReview(scheduleFirstReview(cardId, userId))
  }
  markDoneDay(userId, formatDateKey(new Date()))
}

// ---------- 今日任务 ----------

/**
 * 今日任务快照。
 * PRD 5.3：进入学习台时按 user_profiles 生成今日任务。
 * 快照必须当天固定——否则「完成一张复习卡 → 该卡不再到期 → 新句名额变多」
 * 会让今日条数在一天之内不断变化，进度出现 1/3 → 1/4 的跳变。
 */
interface DayPlan {
  userId: string
  dateKey: string
  tasks: { cardId: string; type: 'new' | 'review' }[]
}

function getDayPlan(userId: string): DayPlan | null {
  const plan = storage.read<DayPlan | null>(KEY_TODAY_PLAN, null)
  if (!plan || plan.userId !== userId) return null
  return plan.dateKey === formatDateKey(new Date()) ? plan : null
}

function buildDayPlan(userId: string, profile: UserProfile, today: string): DayPlan {
  const reviews = getReviews(userId)
  const progress = getProgress(userId)

  // 到期复习卡（PRD 5.5：按 due_at 拉取）
  const dueReviews = reviews.filter((r) => isDue(r))
  const dueIds = new Set(dueReviews.map((r) => r.cardId))

  // 已掌握的卡不再作为新句推送；正在进行中的卡优先补回
  const masteredIds = new Set(
    progress.filter((p) => p.answerScore !== null).map((p) => p.cardId),
  )
  const inProgress = progress
    .filter((p) => p.answerScore === null && !dueIds.has(p.cardId))
    .sort((a, b) => new Date(a.doneAt).getTime() - new Date(b.doneAt).getTime())

  // 新句名额 = 每日条数 - 今日到期复习卡数（不为负，PRD 5.3）
  const newCount = Math.max(0, profile.dailyCount - dueReviews.length)

  const tasks: DayPlan['tasks'] = []
  const picked = new Set<string>()

  const takeNew = (cardId: string) => {
    if (tasks.length >= newCount || picked.has(cardId)) return
    if (!SEED_CARDS.some((c) => c.id === cardId)) return
    tasks.push({ cardId, type: 'new' })
    picked.add(cardId)
  }

  // 1) 先把「只完成跟读、未完成应答」的卡放回今日任务，
  //    否则中途离开后该卡既不在今日列表、也没有复习排期，会永远消失。
  for (const p of inProgress) takeNew(p.cardId)

  // 2) 再用没学过的卡补足（排除已到期的复习卡，避免同一张卡重复出现）
  const pool = SEED_CARDS.filter(
    (c) =>
      profile.domains.includes(c.domain) &&
      !masteredIds.has(c.id) &&
      !dueIds.has(c.id) &&
      !picked.has(c.id),
  )
  for (const card of [...pool].sort(() => Math.random() - 0.5)) takeNew(card.id)

  return {
    userId,
    dateKey: today,
    tasks: [
      ...tasks,
      ...dueReviews
        .filter((r) => SEED_CARDS.some((c) => c.id === r.cardId))
        .map((r) => ({ cardId: r.cardId, type: 'review' as const })),
    ],
  }
}

/** 读取今日任务（首次进入当天时生成并落库，之后当天固定） */
export function getTodayCards(userId: string, profile: UserProfile): TodayCard[] {
  const today = formatDateKey(new Date())
  let plan = getDayPlan(userId)
  if (!plan) {
    plan = buildDayPlan(userId, profile, today)
    storage.write(KEY_TODAY_PLAN, plan)
  }

  const result: TodayCard[] = []
  for (const task of plan.tasks) {
    const card = SEED_CARDS.find((c) => c.id === task.cardId)
    if (!card) continue
    const base = { card, ...stepsDoneToday(userId, card.id, today) }
    if (task.type === 'new') {
      result.push({ ...base, type: 'new' })
    } else {
      const review = getReviews(userId).find((r) => r.cardId === card.id)
      result.push({
        ...base,
        type: 'review',
        stage: review?.stage ?? 1,
        lastScore: review?.lastScore,
      })
    }
  }
  return result
}

export function getCardById(id: string): ScenarioCard | null {
  return SEED_CARDS.find((c) => c.id === id) ?? null
}

/**
 * 今日「本轮练习」的步骤完成情况。
 * 只看今天发生过的提交——否则复习卡会带着上一次学习的分数，
 * 一进页面就显示「跟读 ✓ 应答 ✓」。
 */
function stepsDoneToday(
  userId: string,
  cardId: string,
  today: string,
): { repeatDone: boolean; answerDone: boolean } {
  const p = getCardProgress(userId, cardId)
  if (!p || formatDateKey(new Date(p.doneAt)) !== today) {
    return { repeatDone: false, answerDone: false }
  }
  return { repeatDone: p.repeatScore != null, answerDone: p.answerScore != null }
}

// ---------- 历史统计 ----------

interface HistoryStats {
  streak: number
  monthCards: number
  totalDays: number
  weekActivity: number[]
  recent: { date: string; title: string; score: number }[]
  totalCards: number
}

function getDoneDays(userId: string): string[] {
  const map = storage.read<Record<string, string[]>>(KEY_DONE_DAYS, {})
  return (map[userId] ?? []).slice().sort()
}

export function getHistoryStats(userId: string): HistoryStats {
  const days = getDoneDays(userId)
  const progress = getProgress(userId)

  // 连续学习天数（streak）
  let streak = 0
  const daySet = new Set(days)
  const cursor = new Date()
  while (daySet.has(formatDateKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  // 本月学习卡片（doneAt 是 UTC ISO，需转成本地日期再比较，避免跨时区算错）
  const monthKey = formatDateKey(new Date()).slice(0, 7)
  const monthCards = progress.filter((p) =>
    formatDateKey(new Date(p.doneAt)).startsWith(monthKey),
  ).length

  // 本周学习进度（本周一 → 本周日，与历史页「一…日」的标签一一对应）
  const weekActivity: number[] = []
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // 周一=0
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - dayOfWeek + i)
    const key = formatDateKey(d)
    const count = progress.filter((p) => formatDateKey(new Date(p.doneAt)) === key).length
    weekActivity.push(count)
  }

  // 最近练习
  const recent = [...progress]
    .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime())
    .slice(0, 8)
    .map((p) => {
      const card = SEED_CARDS.find((c) => c.id === p.cardId)
      return {
        date: formatDateKey(new Date(p.doneAt)),
        title: card?.sceneText ?? p.cardId,
        score: p.composite ?? p.repeatScore ?? 0,
      }
    })

  return {
    streak,
    monthCards,
    totalDays: days.length,
    weekActivity,
    recent,
    totalCards: progress.length,
  }
}

/** 供调试/演示：重置所有本地数据 */
export function resetAllData(): void {
  ;[
    KEY_USERS,
    KEY_SESSION,
    KEY_PROFILE,
    KEY_PROGRESS,
    KEY_REVIEWS,
    KEY_DONE_DAYS,
    KEY_TODAY_PLAN,
  ].forEach((k) => storage.remove(k))
}
