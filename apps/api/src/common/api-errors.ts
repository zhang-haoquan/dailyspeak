import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { API_ERROR_CODES } from '@dailyspeak/shared'

/**
 * 业务异常快捷方式（D-030）
 *
 * 抛出的 body 已经是我们自己的错误体形状，AllExceptionsFilter 会原样透传，
 * 这样业务代码不需要关心 HTTP 细节，只表达「什么错了」。
 */

export function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: API_ERROR_CODES.NOT_FOUND, message })
}

export function badRequest(message: string): BadRequestException {
  return new BadRequestException({ code: API_ERROR_CODES.BAD_REQUEST, message })
}

export function conflict(message: string): ConflictException {
  return new ConflictException({ code: API_ERROR_CODES.CONFLICT, message })
}

export function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: API_ERROR_CODES.FORBIDDEN, message })
}
