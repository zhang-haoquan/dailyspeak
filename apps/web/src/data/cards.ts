import type { ScenarioCard } from '../types'

/**
 * MVP 种子内容库：首发「计算机/IT + 职场通用」两个领域。
 * 实际生产环境由 AI 批量生成候选 + 人工抽审上线（PRD 07 章）。
 */
export const SEED_CARDS: ScenarioCard[] = [
  {
    id: 'c01',
    domain: '计算机/IT',
    sceneText: 'Resume walkthrough',
    sceneZh: '简历导览',
    sentence: 'Could you walk me through your resume?',
    translation: '你能带我过一下你的简历吗？',
    prompt:
      'Could you describe a project you are most proud of and what you contributed?',
    promptZh: '描述一个你最有成就感的项目，以及你的贡献。',
    referenceAnswer:
      "I led the refactoring of our payment module, which cut processing time by 40%. I coordinated with two engineers and took ownership of the core design.",
    difficulty: 2,
    tag: '面试高频句',
  },
  {
    id: 'c02',
    domain: '计算机/IT',
    sceneText: 'Project experience',
    sceneZh: '项目经验',
    sentence:
      'I led the refactoring of our payment module, which cut processing time by 40%.',
    translation: '我主导了支付模块重构，使处理时间缩短了 40%。',
    prompt:
      'Tell me about a technical challenge you faced and how you solved it.',
    promptZh: '说说你遇到的一个技术挑战，以及你是如何解决的。',
    referenceAnswer:
      'We had a bottleneck in the payment service. I profiled the queries, redesigned the schema, and added caching. The failure rate dropped significantly.',
    difficulty: 2,
    tag: '项目介绍',
  },
  {
    id: 'c03',
    domain: '计算机/IT',
    sceneText: 'Tech interview',
    sceneZh: '技术面试',
    sentence:
      'I am comfortable with React and TypeScript, and I enjoy building clean, testable components.',
    translation: '我熟悉 React 和 TypeScript，喜欢构建干净、可测试的组件。',
    prompt:
      'What programming languages or frameworks are you most comfortable with?',
    promptZh: '你最熟悉哪些编程语言或框架？',
    referenceAnswer:
      "I'm most comfortable with TypeScript and React. I also use Node.js on the backend, and I write unit tests with Vitest.",
    difficulty: 1,
    tag: '技术问答',
  },
  {
    id: 'c04',
    domain: '计算机/IT',
    sceneText: 'Daily standup',
    sceneZh: '每日站会',
    sentence:
      'Yesterday I finished the login flow, and today I will start on the notification service.',
    translation: '昨天我完成了登录流程，今天开始做通知服务。',
    prompt:
      'What did you work on yesterday and what will you do today?',
    promptZh: '你昨天做了什么，今天计划做什么？',
    referenceAnswer:
      'Yesterday I completed the login flow and fixed two bugs. Today I am starting the notification service and will demo it by Friday.',
    difficulty: 1,
    tag: '例会表达',
  },
  {
    id: 'c05',
    domain: '职场通用',
    sceneText: 'Introduce yourself',
    sceneZh: '自我介绍',
    sentence:
      'I am a software developer with three years of experience, and I really enjoy solving problems.',
    translation: '我是一名有三年经验的软件开发者，非常享受解决问题。',
    prompt: 'Please introduce yourself in about 30 seconds.',
    promptZh: '请用大约 30 秒做自我介绍。',
    referenceAnswer:
      "I'm a backend developer with three years of experience. I specialize in distributed systems and I'm looking to grow into a technical lead role.",
    difficulty: 1,
    tag: '面试高频句',
  },
  {
    id: 'c06',
    domain: '职场通用',
    sceneText: 'Why this position',
    sceneZh: '求职动机',
    sentence:
      'Why are you interested in this position?',
    translation: '你为什么对这个职位感兴趣？',
    prompt:
      'What attracts you to our company and this role?',
    promptZh: '我们公司和这个岗位吸引你的地方是什么？',
    referenceAnswer:
      'Your product solves a real problem, and the team moves fast. I want to work where my contributions ship quickly.',
    difficulty: 2,
    tag: '面试高频句',
  },
  {
    id: 'c07',
    domain: '职场通用',
    sceneText: 'Greatest strengths',
    sceneZh: '优势与亮点',
    sentence: 'What are your greatest strengths?',
    translation: '你最大的优势是什么？',
    prompt:
      'Tell me about a time you handled a difficult situation at work.',
    promptZh: '讲讲你在工作中处理过一次困难情况的经历。',
    referenceAnswer:
      'I stay calm under pressure. Once a release broke in production, I led the rollback and root-cause analysis within an hour.',
    difficulty: 2,
    tag: '面试高频句',
  },
  {
    id: 'c08',
    domain: '职场通用',
    sceneText: 'Career goals',
    sceneZh: '职业规划',
    sentence:
      'In five years, I hope to grow into a technical lead and mentor junior engineers.',
    translation: '五年后，我希望成长为技术负责人并指导初级工程师。',
    prompt: 'Where do you see yourself in five years?',
    promptZh: '你未来五年的规划是什么？',
    referenceAnswer:
      "I'd like to deepen my expertise and eventually lead a small team, while still staying hands-on with the codebase.",
    difficulty: 2,
    tag: '职业规划',
  },
  {
    id: 'c09',
    domain: '职场通用',
    sceneText: 'Email discussion',
    sceneZh: '邮件沟通',
    sentence:
      'Could we move our meeting to 3 PM? I have a conflict at 2.',
    translation: '我们能把会议改到下午三点吗？两点我有冲突。',
    prompt:
      'How would you politely reschedule a meeting with a colleague?',
    promptZh: '你如何礼貌地与同事重新约定会议时间？',
    referenceAnswer:
      'I would say: Sorry for the late notice, but could we move the meeting to 3 PM? I have a conflict at 2. Thanks!',
    difficulty: 1,
    tag: '职场沟通',
  },
  {
    id: 'c10',
    domain: '职场通用',
    sceneText: 'Salary discussion',
    sceneZh: '薪资谈判',
    sentence:
      'I am flexible on timing, but I would like my compensation to reflect my experience.',
    translation: '入职时间我可以灵活，但我希望薪酬能反映我的经验。',
    prompt:
      'How do you respond when asked about your salary expectation?',
    promptZh: '当被问到期望薪资时，你会如何回应？',
    referenceAnswer:
      "I'd ask about the budget range first, then share that I'm open to a package that reflects my experience and the market rate.",
    difficulty: 3,
    tag: '职场沟通',
  },
]
