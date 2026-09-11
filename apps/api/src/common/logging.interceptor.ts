import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import type { AuthedRequest } from '../auth/authed-request'

/**
 * 请求日志（D-030）
 *
 * 每条请求一行：方法、路径、状态码、耗时、用户。
 * 不打印请求体与响应体——里面会有录音 base64 与转写文本，日志会炸。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest & { url?: string }>()
    const res = context.switchToHttp().getResponse<{ statusCode?: number }>()
    const startedAt = Date.now()
    const method = req.method ?? '-'
    const url = req.url ?? '-'

    // 用户已由 JwtAuthGuard 挂上；@Public 接口没有用户，打 '-'
    const who = req.user?.id ? `user=${req.user.id.slice(0, 8)}` : 'anon'

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - startedAt
          this.logger.log(`${method} ${url} ${res.statusCode ?? 200} ${ms}ms ${who}`)
        },
        error: () => {
          // 失败的请求由 AllExceptionsFilter 统一记日志，这里不重复刷
        },
      }),
    )
  }
}
