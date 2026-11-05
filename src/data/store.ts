/**
 * The in-memory database, plus session state.
 *
 * Everything the prototype knows lives here. Screens never touch this directly:
 * they go through `api.ts`, which adds latency and writes the audit trail, so
 * swapping in a real backend later is a change to one file.
 */

import { create } from 'zustand'
import { buildDatabase, SEED } from './seed'
import type { AuditEntry, Database, ID, RoleCode, SecurityEntry, User } from './types'
import { DEFAULT_SETTINGS } from './reference'

let idCounter = 0
export const newId = (prefix: string) => `${prefix}_n${(++idCounter).toString(36)}`

/**
 * The signed-in person and the presenter settings survive a page reload, so
 * refreshing does not throw a presenter back to the login screen. The data
 * itself is rebuilt from the seed, which is deterministic, so the figures are
 * the same every time.
 */
const SESSION_KEY = 'tcl.session'

interface PersistedSession {
  currentUserId: ID | null
  effectiveRole: RoleCode
  presenter: PresenterState
}

function readSession(): PersistedSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as PersistedSession) : null
  } catch {
    return null
  }
}

function writeSession(session: PersistedSession) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // private windows and blocked storage are fine: the session simply does not persist
  }
}

function clearSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // nothing to do
  }
}

export interface PresenterState {
  /** Simulated network latency, so loading states are visible. */
  latency: 'off' | 'realistic' | 'slow'
  /** Highlight the rules the prototype enforces, for a walkthrough. */
  showRuleHints: boolean
}

interface StoreState {
  db: Database
  /** who is signed in; null when the login screen is showing */
  currentUserId: ID | null
  /** the role in force — the presenter can switch this live */
  effectiveRole: RoleCode
  presenter: PresenterState
  settings: typeof DEFAULT_SETTINGS
  /** bumped on every mutation so views recompute */
  revision: number

  signIn: (userId: ID) => void
  signOut: () => void
  setRole: (role: RoleCode) => void
  setPresenter: (patch: Partial<PresenterState>) => void
  resetDemoData: () => void
  /** Apply a change to the database and record it. */
  mutate: (fn: (db: Database) => void) => void
  pushAudit: (entry: Omit<AuditEntry, 'id' | 'occurredAt'>) => void
  pushSecurity: (entry: Omit<SecurityEntry, 'id' | 'occurredAt'>) => void
}

const restored = typeof window === 'undefined' ? null : readSession()

export const useStore = create<StoreState>((set, get) => ({
  db: buildDatabase(SEED),
  currentUserId: restored?.currentUserId ?? null,
  effectiveRole: restored?.effectiveRole ?? 'FULL_ACCESS',
  presenter: restored?.presenter ?? { latency: 'realistic', showRuleHints: true },
  settings: { ...DEFAULT_SETTINGS },
  revision: 0,

  signIn: (userId) => {
    const user = get().db.users.find((u) => u.id === userId)
    const role = user?.roleCode ?? 'FULL_ACCESS'
    set({ currentUserId: userId, effectiveRole: role })
    writeSession({ currentUserId: userId, effectiveRole: role, presenter: get().presenter })
    get().pushSecurity({ eventType: 'LOGIN', userId, detail: 'Signed in', rowCount: null })
  },

  signOut: () => {
    clearSession()
    set({ currentUserId: null })
  },

  setRole: (role) => {
    const { currentUserId } = get()
    set({ effectiveRole: role })
    writeSession({ currentUserId, effectiveRole: role, presenter: get().presenter })
    get().pushSecurity({
      eventType: 'ROLE_CHANGE',
      userId: currentUserId,
      detail: `Demonstration: switched the current session to ${role === 'FULL_ACCESS' ? 'Full Access' : 'View Only'}`,
      rowCount: null,
    })
  },

  setPresenter: (patch) =>
    set((s) => {
      const presenter = { ...s.presenter, ...patch }
      writeSession({ currentUserId: s.currentUserId, effectiveRole: s.effectiveRole, presenter })
      return { presenter }
    }),

  resetDemoData: () =>
    set({
      db: buildDatabase(SEED),
      settings: { ...DEFAULT_SETTINGS },
      revision: get().revision + 1,
    }),

  mutate: (fn) =>
    set((s) => {
      // The screens re-read from `db` after every change, so a shallow clone of
      // the container is enough; `fn` replaces the arrays it touches.
      const next: Database = { ...s.db }
      fn(next)
      return { db: next, revision: s.revision + 1 }
    }),

  pushAudit: (entry) =>
    set((s) => ({
      db: {
        ...s.db,
        audit: [
          { ...entry, id: newId('aud'), occurredAt: new Date().toISOString() },
          ...s.db.audit,
        ],
      },
    })),

  pushSecurity: (entry) =>
    set((s) => ({
      db: {
        ...s.db,
        security: [
          { ...entry, id: newId('sec'), occurredAt: new Date().toISOString() },
          ...s.db.security,
        ],
      },
    })),
}))

// --------------------------------------------------------------- selectors

export const useDb = () => useStore((s) => s.db)
export const useRevision = () => useStore((s) => s.revision)

export function useCurrentUser(): User | null {
  const id = useStore((s) => s.currentUserId)
  const users = useStore((s) => s.db.users)
  return id ? (users.find((u) => u.id === id) ?? null) : null
}

export const useRole = () => useStore((s) => s.effectiveRole)

/** True when the session may change data. Read-only sessions still read everything. */
export const useCanWrite = () => useStore((s) => s.effectiveRole === 'FULL_ACCESS')

export const usePresenter = () => useStore((s) => s.presenter)
export const useSettings = () => useStore((s) => s.settings)

/** Direct access for non-React code (the API layer). */
export const store = {
  get: () => useStore.getState(),
  db: () => useStore.getState().db,
  currentUserId: () => useStore.getState().currentUserId,
  canWrite: () => useStore.getState().effectiveRole === 'FULL_ACCESS',
  settings: () => useStore.getState().settings,
}
