/** 轻量 localStorage 封装（模拟后端持久化，后续可替换为真实 API） */

const PREFIX = 'dailyspeak:'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

function remove(key: string): void {
  localStorage.removeItem(PREFIX + key)
}

/** 生成短 id */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const storage = {
  read,
  write,
  remove,
  uid,
}
