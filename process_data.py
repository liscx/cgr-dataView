import os
import json
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path

# ============================================================
# 采购人用户画像数据大屏 - 数据处理脚本 (符合 方案.md 第一期规范)
# 读取方式：优先 Data/source_data.xlsx，否则 src/assets/阳光优采交易订单.xlsx
# 输出：src/data/profile.json
# ============================================================

_BASE = os.path.dirname(os.path.abspath(__file__))
_PRIMARY = os.path.join(_BASE, 'Data', 'source_data.xlsx')
_FALLBACK = os.path.join(_BASE, 'src', 'assets', '阳光优采交易订单.xlsx')
df = pd.read_excel(_PRIMARY if os.path.exists(_PRIMARY) else _FALLBACK)

now = datetime.now()

# 按订单号去重
orders = df.drop_duplicates(subset='订单号', keep='first').copy()
orders['日期'] = pd.to_datetime(orders['订单创建时间'], errors='coerce')
orders = orders[orders['日期'].notna()].copy()

data_end_date = orders['日期'].max().strftime('%Y-%m-%d')
max_dt = orders['日期'].max()

# 剔除采购人为空的订单
buyer_orders = orders[orders['采购人'].notna()].copy()
buyer_orders['buyer_id'] = buyer_orders['采购企业'].astype(str) + '||' + buyer_orders['采购人'].astype(str)

total_amount = round(buyer_orders['订单金额（元）'].sum(), 2)
total_orders = len(buyer_orders)
buyer_count = buyer_orders['buyer_id'].nunique()
company_count = buyer_orders['采购企业'].nunique()

# 部门归类函数
def dept_group(dept, company):
    if pd.isna(dept) or not str(dept).strip() or str(dept).strip() == str(company).strip():
        return '采购主体（未细分）'
    d = str(dept)
    for kw in ('招采', '采购', '招标'):
        if kw in d: return '招采部门'
    for kw in ('办公', '综合', '行政', '党政', '秘书', '文书'):
        if kw in d: return '综合办公'
    for kw in ('财务', '资产', '资金', '审计'):
        if kw in d: return '财务资产'
    for kw in ('安全', '生产', '设备', '物资'):
        if kw in d: return '安全生产'
    for kw in ('项目', '工程', '勘察', '勘探', '施工', '矿区', '井'):
        if kw in d: return '项目工程'
    for kw in ('技术', '科技', '信息', '数智', '数字', '测绘', '实验', '质检'):
        if kw in d: return '科技信息'
    for kw in ('经营', '市场', '销售', '客服', '后勤', '保障'):
        if kw in d: return '市场经营'
    return '其他职能部门'

buyer_orders['部门归类'] = buyer_orders.apply(
    lambda r: dept_group(r['采购部门'], r['采购企业']), axis=1
)

def month_label(x):
    return f"{x.year}-{int(x.month):02d}"

buyer_orders['月'] = buyer_orders['日期'].apply(month_label)
all_months = sorted(buyer_orders['月'].unique())

# 行级明细（含 单价（元）/数量），用于商品/供应商的「件数」「单价」计算
# 与底部品类分布共用，提前准备好并按下单采购人分组
lines = df.copy()
for c in ['订单号', '采购企业', '采购人', '订单创建时间']:
    lines[c] = lines[c].ffill()
lines['日期'] = pd.to_datetime(lines['订单创建时间'], errors='coerce')
lines = lines[lines['采购人'].notna() & lines['日期'].notna()].copy()
lines['line_amount'] = lines['单价（元）'] * lines['数量']
lines['buyer_id'] = lines['采购企业'].astype(str) + '||' + lines['采购人'].astype(str)
lines_groups = {bid: sub for bid, sub in lines.groupby('buyer_id')}

dt_3m_start = max_dt - pd.Timedelta(days=90)
dt_prev_3m_start = max_dt - pd.Timedelta(days=180)
dt_12m_start = max_dt - pd.Timedelta(days=365)

# 第一轮聚合计算采购人基础维度
raw_buyers = {}
for bid, g in buyer_orders.groupby('buyer_id'):
    company, name = bid.split('||', 1)
    g_sorted = g.sort_values('日期')
    dates = g_sorted['日期'].tolist()

    amount_sum = float(g['订单金额（元）'].sum())
    order_cnt = len(g)
    first_dt = dates[0]
    last_dt = dates[-1]

    inactive_days = int((max_dt - last_dt).days)
    tenure_days = int((last_dt - first_dt).days) + 1

    # 订单时间间隔计算
    if len(dates) >= 2:
        intervals = [(dates[i] - dates[i-1]).days for i in range(1, len(dates))]
        avg_cycle_days = float(np.mean(intervals))
        cycle_std_days = float(np.std(intervals)) if len(intervals) >= 2 else 0.0
    else:
        intervals = []
        avg_cycle_days = float(max(30, inactive_days))
        cycle_std_days = 0.0

    # 过滤 0 周期
    if avg_cycle_days <= 0:
        avg_cycle_days = 7.0

    cycle_dev_ratio = round(inactive_days / avg_cycle_days, 2)

    # 校验最近3个月 vs 上一个3个月金额
    g_3m = g[g['日期'] >= dt_3m_start]
    amt_3m = float(g_3m['订单金额（元）'].sum())

    g_prev_3m = g[(g['日期'] >= dt_prev_3m_start) & (g['日期'] < dt_3m_start)]
    amt_prev_3m = float(g_prev_3m['订单金额（元）'].sum())

    g_12m = g[g['日期'] >= dt_12m_start]
    amt_12m = float(g_12m['订单金额（元）'].sum())

    if amt_prev_3m > 0:
        growth_3m = round(((amt_3m - amt_prev_3m) / amt_prev_3m) * 100, 1)
    else:
        growth_3m = 100.0 if amt_3m > 0 else 0.0

    cat_count = int(g['商品名称'].nunique())
    active_months = int(g['月'].nunique())

    # 回流判定：倒数第二次订单与最后一次订单间隔 > 45 天
    prior_inactive = (dates[-1] - dates[-2]).days if len(dates) >= 2 else 0

    raw_buyers[bid] = {
        'bid': bid,
        'name': name,
        'company': company,
        'g': g,
        'amount_sum': amount_sum,
        'order_cnt': order_cnt,
        'first_dt': first_dt,
        'last_dt': last_dt,
        'inactive_days': inactive_days,
        'tenure_days': tenure_days,
        'avg_cycle_days': round(avg_cycle_days, 1),
        'cycle_std_days': round(cycle_std_days, 1),
        'cycle_dev_ratio': cycle_dev_ratio,
        'amt_12m': amt_12m,
        'amt_3m': amt_3m,
        'amt_prev_3m': amt_prev_3m,
        'growth_3m': growth_3m,
        'cat_count': cat_count,
        'active_months': active_months,
        'prior_inactive': prior_inactive,
    }

# 分位数 / Percentile 评分计算
b_list = list(raw_buyers.values())

def rank_scores(values):
    s = pd.Series(values)
    return s.rank(pct=True).values * 100.0

p1 = rank_scores([b['amt_12m'] for b in b_list])
p2 = rank_scores([b['amt_3m'] for b in b_list])
p3 = rank_scores([b['order_cnt'] for b in b_list])
p4 = rank_scores([b['growth_3m'] for b in b_list])

# 潜力分权重：近12月金额 / 近3月金额 / 采购频次 / 近3月金额增长率
# （已移除原「品类丰富度 10%」，剩余四项按原相对比例归一到合计 100%）
P_WEIGHTS = (0.30, 0.25, 0.20, 0.15)
P_WEIGHT_SUM = sum(P_WEIGHTS)

s1 = rank_scores([b['tenure_days'] for b in b_list])
s2 = rank_scores([b['active_months'] for b in b_list])
s3 = rank_scores([1.0 / (b['cycle_std_days'] / (b['avg_cycle_days'] + 1) + 1) for b in b_list])
s4 = rank_scores([-b['cycle_dev_ratio'] for b in b_list])

buyers = {}
quadrant_counts = {'核心采购用户': 0, '潜力待激活': 0, '稳定型用户': 0, '普通用户': 0}
status_counts = {'活跃': 0, '正常': 0, '低活跃': 0, '沉默': 0, '回流': 0}
regularity_counts = {'规律型': 0, '较规律': 0, '一般': 0, '无明显规律': 0}

key_user_groups = {
    '潜力用户': [],
    '沉默用户': [],
    '快速增长': [],
    '采购下降': [],
    '近期回流': []
}

for i, b in enumerate(b_list):
    bid = b['bid']
    g = b['g']

    # 潜力得分 & 粘性得分 (0 - 100)
    potential_score = int(round(
        (P_WEIGHTS[0]*p1[i] + P_WEIGHTS[1]*p2[i] + P_WEIGHTS[2]*p3[i] + P_WEIGHTS[3]*p4[i]) / P_WEIGHT_SUM
    ))
    stickiness_score = int(round(0.20*s1[i] + 0.25*s2[i] + 0.25*s3[i] + 0.30*s4[i]))

    # 四象限归类
    if potential_score >= 50 and stickiness_score >= 50:
        quadrant = '核心采购用户'
    elif potential_score >= 50 and stickiness_score < 50:
        quadrant = '潜力待激活'
    elif potential_score < 50 and stickiness_score >= 50:
        quadrant = '稳定型用户'
    else:
        quadrant = '普通用户'
    quadrant_counts[quadrant] += 1

    # 用户状态判断
    inactive_d = b['inactive_days']
    dev_r = b['cycle_dev_ratio']
    if inactive_d <= 30 and b['prior_inactive'] >= 45:
        status = '回流'
    elif dev_r >= 2.0 or (inactive_d >= 60 and b['order_cnt'] > 1):
        status = '沉默'
    elif dev_r >= 1.2 or inactive_d >= 35:
        status = '低活跃'
    elif inactive_d <= 30:
        status = '活跃'
    else:
        status = '正常'
    status_counts[status] += 1

    # 采购规律判断
    cv = b['cycle_std_days'] / (b['avg_cycle_days'] + 1)
    if b['order_cnt'] < 2:
        regularity = '无明显规律'
    elif cv < 0.35:
        regularity = '规律型'
    elif cv < 0.65:
        regularity = '较规律'
    elif cv < 1.0:
        regularity = '一般'
    else:
        regularity = '无明显规律'
    regularity_counts[regularity] += 1

    # AI 智能行为标签
    tags = []
    if potential_score >= 70: tags.append('高潜力')
    elif potential_score <= 35: tags.append('普通潜力')

    if stickiness_score >= 70: tags.append('高粘性')
    elif stickiness_score <= 35: tags.append('低粘性')

    tags.append(regularity)
    if b['growth_3m'] >= 30: tags.append('快速增长')
    elif b['growth_3m'] <= -30: tags.append('采购下降')

    if dev_r >= 2.0: tags.append('周期严重偏离')

    # 专区、供应商、商品等明细
    zones = g.groupby('专区名称').agg(count=('订单号', 'count'), amount=('订单金额（元）', 'sum')).sort_values('amount', ascending=False)
    sup_types = g.groupby('供应商类型').agg(count=('订单号', 'count'), amount=('订单金额（元）', 'sum'))
    months = g.groupby('月').agg(count=('订单号', 'count'), amount=('订单金额（元）', 'sum'))
    # 商品 / 品类：行级明细计算 件数(sum 数量) 与 单价(加权均价 = 金额 / 数量)
    lines_b = lines_groups.get(bid, lines.iloc[0:0])

    def max_consecutive_months(month_list):
        """计算月标签(YYYY-MM)中最长连续自然月跨度，用于标记「连续三月采购」"""
        s = sorted(set(month_list))
        if not s:
            return 0
        best = cur = 1
        for i in range(1, len(s)):
            y0, m0 = (int(x) for x in s[i - 1].split('-'))
            y1, m1 = (int(x) for x in s[i].split('-'))
            if (y1 * 12 + m1) - (y0 * 12 + m0) == 1:
                cur += 1
                best = max(best, cur)
            else:
                cur = 1
        return best

    prod = lines_b[lines_b['商品名称'].notna()]
    # 逐笔订单明细：商品名称 -> [{orderNo, date, qty}]（按日期降序），供前端 hover 展示历史采购订单
    order_detail: dict = {}
    if len(prod):
        goods = prod.groupby('商品名称').agg(
            count=('订单号', 'nunique'),
            amount=('line_amount', 'sum'),
            qty=('数量', 'sum'),
            months=('日期', lambda x: [d.strftime('%Y-%m') for d in x]),
        ).sort_values('amount', ascending=False)
        goods['unit'] = np.where(goods['qty'] > 0, goods['amount'] / goods['qty'], 0.0)
        # 连续三个月（含）出现采购行为 → 标记 hot（前端红色字体）
        goods['hot'] = goods['months'].apply(lambda ms: max_consecutive_months(ms) >= 3)
        for name, grp in prod.groupby('商品名称'):
            od = (
                grp.groupby('订单号')
                .agg(日期=('日期', 'max'), 数量=('数量', 'sum'))
                .reset_index()
                .sort_values('日期', ascending=False)
            )
            order_detail[name] = [
                {'orderNo': str(o['订单号']), 'date': o['日期'].strftime('%Y-%m-%d'), 'qty': int(o['数量'])}
                for _, o in od.iterrows()
            ]
    else:
        goods = pd.DataFrame(columns=['count', 'amount', 'qty', 'unit', 'hot'])

    # 常常采品类：按商品目录名称聚合采购次数（一次采购 = 一个订单号）
    cat_b = lines_b[lines_b['商品目录名称'].notna()]
    if len(cat_b):
        categories = cat_b.groupby('商品目录名称').agg(
            count=('订单号', 'nunique'),
            amount=('line_amount', 'sum'),
        ).sort_values('count', ascending=False)
    else:
        categories = pd.DataFrame(columns=['count', 'amount'])

    def band(a):
        if a < 1000: return '1千以下'
        elif a < 5000: return '1千-5千'
        elif a < 10000: return '5千-1万'
        elif a < 30000: return '1万-3万'
        else: return '3万以上'
    g_band = g.copy()
    g_band['金额区间'] = g_band['订单金额（元）'].apply(band)
    bands = g_band.groupby('金额区间').agg(count=('订单号', 'count'), amount=('订单金额（元）', 'sum'))
    band_order = ['1千以下', '1千-5千', '5千-1万', '1万-3万', '3万以上']
    bands = bands.reindex([bk for bk in band_order if bk in bands.index])

    ec = g[g['供应商类型'] == '电商供应商']
    ec_share = round(ec['订单金额（元）'].sum() / b['amount_sum'], 4) if b['amount_sum'] > 0 else 0

    info = {
        'id': bid,
        'name': b['name'],
        'company': b['company'],
        'dept': None if pd.isna(g['采购部门'].iloc[0]) else str(g['采购部门'].iloc[0]),
        'deptGroup': g['部门归类'].iloc[0],
        'count': b['order_cnt'],
        'amount': round(b['amount_sum'], 2),
        'avgAmount': round(b['amount_sum'] / b['order_cnt'], 2) if b['order_cnt'] > 0 else 0,
        'activeMonths': b['active_months'],
        'firstOrder': b['first_dt'].strftime('%Y-%m-%d'),
        'lastOrder': b['last_dt'].strftime('%Y-%m-%d'),
        'ecShare': ec_share,
        # 新增第一期维度
        'potentialScore': potential_score,
        'stickinessScore': stickiness_score,
        'quadrant': quadrant,
        'status': status,
        'regularity': regularity,
        'avgCycleDays': b['avg_cycle_days'],
        'cycleStdDays': b['cycle_std_days'],
        'inactiveDays': b['inactive_days'],
        'cycleDeviationRatio': dev_r,
        'growthRate3m': b['growth_3m'],
        'amt3m': round(b['amt_3m'], 2),
        'amt12m': round(b['amt_12m'], 2),
        'tags': tags,
        'zones': [
            {'name': str(k), 'count': int(v['count']), 'amount': round(float(v['amount']), 2)}
            for k, v in zones.iterrows()
        ],
        'supplierTypes': [
            {'name': str(k), 'count': int(v['count']), 'amount': round(float(v['amount']), 2)}
            for k, v in sup_types.iterrows()
        ],
        'months': [
            {'label': m, 'count': int(v['count']), 'amount': round(float(v['amount']), 2)}
            for m, v in months.iterrows()
        ],
        'bands': [
            {'name': str(k), 'count': int(v['count']), 'amount': round(float(v['amount']), 2)}
            for k, v in bands.iterrows()
        ],
        'goods': [
            {'name': str(k), 'count': int(v['count']), 'amount': round(float(v['amount']), 2),
             'qty': int(v['qty']), 'unit': round(float(v['unit']), 2), 'hot': bool(v['hot']),
             'orders': order_detail.get(k, [])}
            for k, v in goods.iterrows()
        ],
        'categories': [
            {'name': str(k), 'count': int(v['count']), 'amount': round(float(v['amount']), 2)}
            for k, v in categories.iterrows()
        ],
    }

    buyers[bid] = info

    # 重点用户 5 分类加入简要信息
    summary_item = {
        'id': bid,
        'name': b['name'],
        'company': b['company'],
        'deptGroup': info['deptGroup'],
        'amount': info['amount'],
        'amt3m': info['amt3m'],
        'growthRate3m': info['growthRate3m'],
        'avgCycleDays': info['avgCycleDays'],
        'inactiveDays': info['inactiveDays'],
        'cycleDeviationRatio': dev_r,
        'status': status,
        'quadrant': quadrant,
        'potentialScore': potential_score,
        'stickinessScore': stickiness_score,
    }

    if potential_score >= 60 and b['growth_3m'] >= -10:
        key_user_groups['潜力用户'].append(summary_item)
    if status == '沉默' or dev_r >= 2.0:
        key_user_groups['沉默用户'].append(summary_item)
    if b['growth_3m'] >= 30.0:
        key_user_groups['快速增长'].append(summary_item)
    if b['growth_3m'] <= -30.0:
        key_user_groups['采购下降'].append(summary_item)
    if status == '回流' or (inactive_d <= 30 and b['prior_inactive'] >= 45):
        key_user_groups['近期回流'].append(summary_item)

# 重点用户列表排序
for k in key_user_groups:
    key_user_groups[k] = sorted(key_user_groups[k], key=lambda x: x['amt3m'], reverse=True)

# 按金额对全量采购人排行榜排序
buyer_rank_list = sorted(buyers.values(), key=lambda x: x['amount'], reverse=True)

# 采购力分层
def tier(a):
    if a < 1000: return '1千以下'
    elif a < 5000: return '1千-5千'
    elif a < 10000: return '5千-1万'
    elif a < 50000: return '1万-5万'
    else: return '5万以上'
tier_order = ['1千以下', '1千-5千', '5千-1万', '1万-5万', '5万以上']
tier_stat = {}
for _, info in buyers.items():
    t = tier(info['amount'])
    s = tier_stat.setdefault(t, {'buyers': 0, 'orders': 0, 'amount': 0.0})
    s['buyers'] += 1
    s['orders'] += info['count']
    s['amount'] += info['amount']
amount_tiers = [
    {'name': t, 'buyers': tier_stat[t]['buyers'], 'orders': tier_stat[t]['orders'],
     'amount': round(tier_stat[t]['amount'], 2)}
    for t in tier_order if t in tier_stat
]

# 月度趋势（近12个月全量数据）
monthly_trend = []
seen_buyers = set()
for m in all_months:
    g = buyer_orders[buyer_orders['月'] == m]
    active = set(g['buyer_id'])
    new = active - seen_buyers
    seen_buyers |= active
    monthly_trend.append({
        'label': m,
        'orders': int(len(g)),
        'amount': round(float(g['订单金额（元）'].sum()), 2),
        'activeBuyers': len(active),
        'newBuyers': len(new),
    })

dept_dist = buyer_orders.groupby('部门归类').agg(
    orders=('订单号', 'count'),
    amount=('订单金额（元）', 'sum'),
    buyers=('buyer_id', 'nunique'),
).reset_index().sort_values('amount', ascending=False)
dept_dist_list = [
    {'name': r['部门归类'], 'orders': int(r['orders']), 'amount': round(float(r['amount']), 2), 'buyers': int(r['buyers'])}
    for _, r in dept_dist.iterrows()
]

zone_dist = buyer_orders.groupby('专区名称').agg(
    orders=('订单号', 'count'),
    amount=('订单金额（元）', 'sum'),
    buyers=('buyer_id', 'nunique'),
).reset_index().sort_values('amount', ascending=False)
zone_dist_list = [
    {'name': str(r['专区名称']), 'orders': int(r['orders']), 'amount': round(float(r['amount']), 2), 'buyers': int(r['buyers'])}
    for _, r in zone_dist.iterrows()
]

# 品类分布：按商品行明细聚合（续行订单号/时间 ffill 归属，行金额 = 单价 × 数量）
# lines / line_amount 已在上方 buyer 循环前统一准备
cat_rows = lines.dropna(subset=['商品目录名称'])
cat_dist = cat_rows.groupby('商品目录名称').agg(
    orders=('订单号', 'nunique'),
    amount=('line_amount', 'sum'),
    buyers=('采购人', 'nunique'),
).reset_index().sort_values('amount', ascending=False).head(15)
cat_dist_list = [
    {'name': str(r['商品目录名称']), 'orders': int(r['orders']), 'amount': round(float(r['amount']), 2), 'buyers': int(r['buyers'])}
    for _, r in cat_dist.iterrows()
]
_total_line_amount = float(lines['line_amount'].sum())
category_coverage = round(float(cat_rows['line_amount'].sum() / _total_line_amount), 4) if _total_line_amount > 0 else 0.0

company_rank = buyer_orders.groupby('采购企业').agg(
    orders=('订单号', 'count'),
    amount=('订单金额（元）', 'sum'),
    buyers=('buyer_id', 'nunique'),
).reset_index().sort_values('amount', ascending=False).head(10)
company_rank_list = [
    {'name': str(r['采购企业']), 'orders': int(r['orders']), 'amount': round(float(r['amount']), 2), 'buyers': int(r['buyers'])}
    for _, r in company_rank.iterrows()
]

sup_type_dist = buyer_orders.groupby('供应商类型').agg(
    orders=('订单号', 'count'),
    amount=('订单金额（元）', 'sum'),
    buyers=('buyer_id', 'nunique'),
).reset_index().sort_values('amount', ascending=False)
sup_type_list = [
    {'name': str(r['供应商类型']), 'orders': int(r['orders']), 'amount': round(float(r['amount']), 2), 'buyers': int(r['buyers'])}
    for _, r in sup_type_dist.iterrows()
]

max_date = buyer_orders['日期'].max()
cur_month_start = max_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
cur = buyer_orders[buyer_orders['日期'] >= cur_month_start]
active_this_month = cur['buyer_id'].nunique()
history = buyer_orders[buyer_orders['日期'] < cur_month_start]
history_ids = set(history['buyer_id'])
new_this_month = len(set(cur['buyer_id']) - history_ids)

top10_amount = sum(info['amount'] for info in buyer_rank_list[:10])
top10_share = round(top10_amount / total_amount, 6) if total_amount > 0 else 0

# 采购行为画像全景指标
all_cycles = [b['avg_cycle_days'] for b in b_list if b['order_cnt'] >= 2]
all_cats = [b['cat_count'] for b in b_list]

behavior_overview = {
    'avgAmountPerBuyer': round(total_amount / buyer_count, 2) if buyer_count else 0,
    'avgMonthlyFreq': round(total_orders / (buyer_count * 12), 1) if buyer_count else 0,
    'avgCycleDays': round(float(np.mean(all_cycles)), 1) if len(all_cycles) > 0 else 14.5,
    'avgCategoryCount': round(float(np.mean(all_cats)), 1) if len(all_cats) > 0 else 5.2,
}

result = {
    'generatedAt': now.strftime('%Y-%m-%d %H:%M'),
    'dataEndDate': data_end_date,
    'source': '阳光优采交易订单.xlsx',
    'kpis': {
        'buyerCount': buyer_count,
        'companyCount': company_count,
        'totalOrders': total_orders,
        'totalAmount': total_amount,
        'avgOrdersPerBuyer': round(total_orders / buyer_count, 1) if buyer_count else 0,
        'avgAmountPerBuyer': round(total_amount / buyer_count, 2) if buyer_count else 0,
        'avgOrderAmount': round(total_amount / total_orders, 2) if total_orders else 0,
        'activeThisMonth': active_this_month,
        'newThisMonth': new_this_month,
        'activeBuyers': status_counts['活跃'],
        'highPotentialCount': quadrant_counts['核心采购用户'] + quadrant_counts['潜力待激活'],
        'highStickinessCount': quadrant_counts['核心采购用户'] + quadrant_counts['稳定型用户'],
        'dormantCount': status_counts['沉默'],
        'top10Share': top10_share,
    },
    'quadrantDist': quadrant_counts,
    'statusDist': status_counts,
    'regularityDist': regularity_counts,
    'behaviorOverview': behavior_overview,
    'buyerRank': buyer_rank_list,
    'amountTiers': amount_tiers,
    'monthlyTrend': monthly_trend,
    'deptDist': dept_dist_list,
    'zoneDist': zone_dist_list,
    'categoryDist': cat_dist_list,
    'categoryCoverage': category_coverage,
    'companyRank': company_rank_list,
    'supplierTypeDist': sup_type_list,
    'keyUserGroups': key_user_groups,
    'buyers': buyers,
}

output_path = Path(_BASE) / 'src' / 'data' / 'profile.json'
output_path.parent.mkdir(parents=True, exist_ok=True)
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'数据已生成: {output_path}')
print(f'采购人数: {buyer_count} | 活跃人数: {status_counts["活跃"]} | 沉默人数: {status_counts["沉默"]} | 核心用户: {quadrant_counts["核心采购用户"]}')
