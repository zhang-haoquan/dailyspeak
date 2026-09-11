-- 新用户注册后自动创建 user_profiles（PRD 5.2：注册后进入首次引导）
--
-- 放在数据库触发器里而不是应用层，原因：
--   1. 与 Supabase Auth 的注册动作原子发生，不存在「注册成功但 profile 没建」的中间态；
--   2. 无论用户从哪个入口注册（前端直连 Supabase、后台脚本、未来的手机号/微信登录）都会生效。
-- 应用层仍保留幂等的 ensureProfile 作为兜底，两者不冲突。
--
-- ⚠️ 这个迁移会引用 Supabase 托管的 auth.users 表。
--    Prisma 校验迁移时使用的 shadow database 里没有 auth schema，
--    因此整个动作包在 DO 块里先探测 auth.users 是否存在，不存在就跳过
--    （shadow 库跳过 → 真库执行）。这样仍然只有一个迁移系统。

DO $do$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE NOTICE 'auth.users 不存在（shadow database），跳过注册触发器';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
      INSERT INTO public.user_profiles (
        id,
        user_id,
        domains,
        daily_count,
        onboarded,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        NEW.id,
        '{}'::text[],   -- 领域待首次引导时选择
        3,              -- 每日条数默认 3（PRD 5.2 建议值）
        false,
        now(),
        now()
      )
      ON CONFLICT ("user_id") DO NOTHING;

      RETURN NEW;
    END;
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  EXECUTE 'CREATE TRIGGER on_auth_user_created
             AFTER INSERT ON auth.users
             FOR EACH ROW
             EXECUTE FUNCTION public.handle_new_auth_user()';

  RAISE NOTICE '注册触发器 on_auth_user_created 已就绪';
END
$do$;
