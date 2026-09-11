import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from '@dailyspeak/shared'
import type { Response } from 'express'

/**
 * 全局异常过滤器：把任何抛出的东西收敛成统一错误体
 *
 *   { code, message, details? }
 *
 * 约定（D-030）：
 * - **成功响应不加 envelope**，直接返回资源本身；只有错误走统一格式。
 * - HTTP 状态码保留语义（401/403/404/409/422/5xx），`code` 是给前端做分支判断用的稳定标识。
 * - 5xx **不外泄**内部错误信息（可能含 SQL / 密钥片段），只在服务端日志里留全文。
 */

/** HTTP 状态码 → 稳定错误码 */
function codeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
    // 音频超过上传上限（Multer 抛 413）对用户来说同样是「这个请求不合规」
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return API_ERROR_CODES.BAD_REQUEST
    case HttpStatus.UNAUTHORIZED:
      return API_ERROR_CODES.UNAUTHORIZED
    case HttpStatus.FORBIDDEN:
      return API_ERROR_CODES.FORBIDDEN
    case HttpStatus.NOT_FOUND:
      return API_ERROR_CODES.NOT_FOUND
    case HttpStatus.CONFLICT:
      return API_ERROR_CODES.CONFLICT
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return API_ERROR_CODES.VALIDATION_FAILED
    case HttpStatus.BAD_GATEWAY:
    case HttpStatus.SERVICE_UNAVAILABLE:
    case HttpStatus.GATEWAY_TIMEOUT:
      return API_ERROR_CODES.UPSTREAM_UNAVAILABLE
    default:
      return status >= 500 ? API_ERROR_CODES.INTERNAL_ERROR : API_ERROR_CODES.BAD_REQUEST
  }
}

/** Prisma 已知错误码 → HTTP 状态码 */
function statusFromPrismaCode(code: string): number | null {
  switch (code) {
    case 'P2025': // 记录不存在
      return HttpStatus.NOT_FOUND
    case 'P2002': // 唯一约束冲突
      return HttpStatus.CONFLICT
    case 'P2003': // 外键约束失败
      return HttpStatus.BAD_REQUEST
    default:
      return null
  }
}

interface Normalized {
  status: number
  code: ApiErrorCode
  message: string
  details?: Record<string, string>
}

/** 触发器 / 业务代码主动抛出：带 code 的请求体 */
function fromHttpException(exception: HttpException): Normalized {
  const status = exception.getStatus()
  const raw = exception.getResponse()

  // 校验管道（见 validation.ts）与业务代码抛的都是对象
  if (raw && typeof raw === 'object') {
    const body = raw as Partial<ApiErrorBody> & { message?: string | string[] }
    const explicitCode = body.code
    const details = body.details
    const message = Array.isArray(body.message)
      ? body.message.join('；')
      : (body.message ?? exception.message)

    return {
      status,
      code: explicitCode ?? codeFromStatus(status),
      message,
      ...(details ? { details } : {}),
    }
  }

  return { status, code: codeFromStatus(status), message: String(raw) }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException')

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<{ method?: string; url?: string }>()

    const normalized = this.normalize(exception)
    const body: ApiErrorBody = {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    }

    // 5xx 记完整堆栈；4xx 只记一行，避免正常业务拒绝刷屏
    const where = `${req.method ?? '-'} ${req.url ?? '-'}`
    if (normalized.status >= 500) {
      this.logger.error(
        `${where} → ${normalized.status} ${normalized.code}：${normalized.message}`,
        exception instanceof Error ? exception.stack : undefined,
      )
    } else {
      this.logger.warn(`${where} → ${normalized.status} ${normalized.code}：${normalized.message}`)
    }

    if (res.headersSent) return
    res.status(normalized.status).json(body)
  }

  private normalize(exception: unknown): Normalized {
    if (exception instanceof HttpException) {
      const normalized = fromHttpException(exception)
      // Multer 的文件大小限制会抛英文原文（"File too large"），换成中文
      if (normalized.status === HttpStatus.PAYLOAD_TOO_LARGE) {
        return { ...normalized, message: '音频文件过大，请重新录制' }
      }
      // 5xx 的 HttpException 同样不把内部措辞透给客户端
      if (normalized.status >= 500) {
        return {
          ...normalized,
          message: '服务暂时不可用，请稍后重试',
        }
      }
      return normalized
    }

    // Prisma 错误：不 import 生成客户端，按 code 字段判定，避免与生成产物耦合
    const prismaCode =
      exception && typeof exception === 'object' && 'code' in exception
        ? (exception as { code?: unknown }).code
        : undefined
    if (typeof prismaCode === 'string') {
      const status = statusFromPrismaCode(prismaCode)
      if (status !== null) {
        return {
          status,
          code: codeFromStatus(status),
          message: status === HttpStatus.NOT_FOUND ? '请求的数据不存在' : '数据冲突，请刷新后重试',
        }
      }
    }

    // 其余一律 500，且不外泄细节
    const detail = exception instanceof Error ? exception.message : String(exception)
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: '服务内部错误',
      // 仅开发期把真实信息放进 details，方便本地排查
      ...(process.env.NODE_ENV === 'production' ? {} : { details: { detail } }),
    }
  }
}
