import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AUDIO_LIMITS, type AnswerScore, type AuthUser, type RepeatScore } from '@dailyspeak/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { ScoreRequestDto } from './dto/score-request.dto'
import { ScoringService } from './scoring.service'

/**
 * 评测接口（PRD 12 章）
 *
 * 请求：`multipart/form-data`，字段 `audio`（16kHz 单声道 16-bit PCM WAV）+ `cardId`
 * 响应：跟读返回 `RepeatScore`，应答返回 `AnswerScore`；
 *       第三方不可用时 `degraded: true` 且 `score: null`，**绝不返回伪造分数**。
 *
 * 状态码用 200 而不是 Nest POST 默认的 201：这两个接口是**幂等的计算**，
 * 不新建任何带 URL 的资源（重复提交同一张卡只会覆盖同一行），
 * 回 201 Created 会让调用方以为产生了新资源。
 */
@Controller('score')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  /** 跟读评测：ASR 转写 + 与原句词级比对 */
  @Post('repeat')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('audio', {
      // 提前挡住超大文件，避免把整个 body 读进内存再判断
      limits: { fileSize: AUDIO_LIMITS.maxBytes, files: 1 },
    }),
  )
  scoreRepeat(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ScoreRequestDto,
  ): Promise<RepeatScore> {
    return this.scoringService.scoreRepeat(user.id, dto.cardId, requireAudio(file))
  }

  /** 情境应答评测：ASR 转写 + DeepSeek 四维评测 */
  @Post('answer')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: AUDIO_LIMITS.maxBytes, files: 1 },
    }),
  )
  scoreAnswer(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ScoreRequestDto,
  ): Promise<AnswerScore> {
    return this.scoringService.scoreAnswer(user.id, dto.cardId, requireAudio(file))
  }
}

function requireAudio(file: Express.Multer.File | undefined): Buffer {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: '请上传音频文件（字段名 audio）',
    })
  }
  return file.buffer
}
