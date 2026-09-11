/**
 * 登录/注册表单校验（PRD 5.1 字段规则 + 决策 D-015：MVP 只做邮箱）
 */

/** 合法邮箱 */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** 密码 ≥ 8 位，且同时包含小写字母、大写字母与数字（PRD 5.1） */
export function isStrongPassword(pwd: string): boolean {
  return pwd.length >= 8 && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd)
}
