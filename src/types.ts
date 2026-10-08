/** 数据结构类型定义（符合 方案.md 第一期规范） */

export interface Kpis {
  buyerCount: number
  companyCount: number
  totalOrders: number
  totalAmount: number
  avgOrdersPerBuyer: number
  avgAmountPerBuyer: number
  avgOrderAmount: number
  activeThisMonth: number
  newThisMonth: number
  activeBuyers: number
  highPotentialCount: number
  highStickinessCount: number
  dormantCount: number
  top10Share: number
}

export interface BuyerSummary {
  id: string
  name: string
  company: string
  dept?: string | null
  deptGroup: string
  count: number
  amount: number
  avgAmount: number
  activeMonths: number
  firstOrder: string
  lastOrder: string
  ecShare: number

  // 第一期新增维度
  potentialScore: number
  stickinessScore: number
  quadrant: '核心采购用户' | '潜力待激活' | '稳定型用户' | '普通用户'
  status: '活跃' | '正常' | '低活跃' | '沉默' | '回流'
  regularity: '规律型' | '较规律' | '一般' | '无明显规律'
  avgCycleDays: number
  cycleStdDays: number
  inactiveDays: number
  cycleDeviationRatio: number
  growthRate3m: number
  amt3m: number
  amt12m: number
  tags: string[]
}

export interface GroupStat {
  name: string
  count: number
  amount: number
}

export interface BuyerDetail extends BuyerSummary {
  zones: GroupStat[]
  supplierTypes: GroupStat[]
  months: { label: string; count: number; amount: number }[]
  bands: GroupStat[]
  goods: GroupStat[]
  suppliers: GroupStat[]
}

export interface BehaviorOverview {
  avgAmountPerBuyer: number
  avgMonthlyFreq: number
  avgCycleDays: number
  avgCategoryCount: number
}

export interface KeyUserItem {
  id: string
  name: string
  company: string
  deptGroup: string
  amount: number
  amt3m: number
  growthRate3m: number
  avgCycleDays: number
  inactiveDays: number
  cycleDeviationRatio: number
  status: '活跃' | '正常' | '低活跃' | '沉默' | '回流'
  quadrant: '核心采购用户' | '潜力待激活' | '稳定型用户' | '普通用户'
  potentialScore: number
  stickinessScore: number
}

export interface DashboardData {
  generatedAt: string
  dataEndDate: string
  source: string
  kpis: Kpis
  quadrantDist: Record<'核心采购用户' | '潜力待激活' | '稳定型用户' | '普通用户', number>
  statusDist: Record<'活跃' | '正常' | '低活跃' | '沉默' | '回流', number>
  regularityDist: Record<'规律型' | '较规律' | '一般' | '无明显规律', number>
  behaviorOverview: BehaviorOverview
  buyerRank: BuyerDetail[]
  amountTiers: { name: string; buyers: number; orders: number; amount: number }[]
  monthlyTrend: {
    label: string
    orders: number
    amount: number
    activeBuyers: number
    newBuyers: number
  }[]
  deptDist: { name: string; orders: number; amount: number; buyers: number }[]
  zoneDist: { name: string; orders: number; amount: number; buyers: number }[]
  categoryDist: { name: string; orders: number; amount: number; buyers: number }[]
  /** 品类金额覆盖率（源数据仅部分商品标注了目录） */
  categoryCoverage: number
  companyRank: { name: string; orders: number; amount: number; buyers: number }[]
  supplierTypeDist: { name: string; orders: number; amount: number; buyers: number }[]
  keyUserGroups: Record<
    '潜力用户' | '沉默用户' | '快速增长' | '采购下降' | '近期回流',
    KeyUserItem[]
  >
  buyers: Record<string, BuyerDetail>
}
