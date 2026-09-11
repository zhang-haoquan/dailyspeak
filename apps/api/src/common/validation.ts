import { BadRequestException, type ValidationError } from '@nestjs/common'
import { API_ERROR_CODES, type ApiErrorBody } from '@dailyspeak/shared'

/**
 * DTO 校验失败 → 统一错误体（D-030）
 *
 * 不用 Nest 默认的 `{ message: string[], error, statusCode }`：前端要按字段高亮输入框，
 * 需要的是 `details: { 字段名: 提示 }`。这里把 class-validator 的树摊平成字段映射，
 * 嵌套 DTO 用 `parent.child` 路径。
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const details: Record<string, string> = {}
  flatten(errors, '', details)

  const body: ApiErrorBody = {
    code: API_ERROR_CODES.VALIDATION_FAILED,
    message: '请求参数不合法',
    details,
  }
  return new BadRequestException(body)
}

function flatten(
  errors: readonly ValidationError[],
  prefix: string,
  out: Record<string, string>,
): void {
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property
    const messages = err.constraints ? Object.values(err.constraints) : []
    if (messages.length > 0) {
      // 同一个字段可能同时违反多条规则，全部保留，前端只取第一条展示
      out[path] = messages.join('；')
    }
    if (err.children && err.children.length > 0) {
      flatten(err.children, path, out)
    }
  }
}
