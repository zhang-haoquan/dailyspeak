import { Length, IsString } from 'class-validator'

/**
 * 评测请求的**文本字段**（音频走 multipart 的 `audio` 部分）
 *
 * multipart 的字段值永远是字符串，所以 `cardId` 只做「非空且不太长」的校验；
 * 卡片是否存在、是否已上线由服务层判定并返回 404。
 */
export class ScoreRequestDto {
  @IsString()
  @Length(1, 64)
  cardId!: string
}
