import { Length, IsString } from 'class-validator'

/** 路径参数 `:id` 校验：内容卡 id 是短字符串（如 `c01`），不是 UUID，别用 @IsUUID */
export class CardIdParam {
  @IsString()
  @Length(1, 64)
  id!: string
}
