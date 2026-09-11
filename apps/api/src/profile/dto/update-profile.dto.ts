import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt } from 'class-validator'
import {
  AVAILABLE_DOMAINS,
  DOMAIN_SELECT_MAX,
  type Domain,
} from '@dailyspeak/shared'

/**
 * 首次引导 / 修改学习计划（PRD 5.2）
 *
 * 只允许选择「当前有内容」的领域（AVAILABLE_DOMAINS）——
 * 金融 / 汽车制造暂时没有卡片，选了下发不出课程（决策 A-12）。
 * 每日条数的越界按 PRD 要求「按边界值截断」，所以这里不做过界拒绝，由服务层 clamp。
 */
export class UpdateProfileDto {
  @IsArray()
  @ArrayMinSize(1, { message: '请至少选择一个学习领域' })
  @ArrayMaxSize(DOMAIN_SELECT_MAX, { message: `最多选择 ${DOMAIN_SELECT_MAX} 个学习领域` })
  @ArrayUnique({ message: '学习领域不能重复' })
  @IsIn([...AVAILABLE_DOMAINS], { each: true, message: '包含暂不可用的学习领域' })
  domains!: Domain[]

  @IsInt({ message: '每日条数必须是整数' })
  dailyCount!: number
}
