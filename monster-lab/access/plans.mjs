// Single source of truth for what each plan includes. Prices are NT$ (TWD).
// Quotas protect API cost; change them here only.
export const PLANS = {
  trial: {
    id: 'trial', label: '優惠碼體驗', priceTWD: 0, billing: 'one-time',
    reviews: 1, period: 'ticket', ticketDays: 14, selfServe: true,
    summary: '輸入優惠碼，免費完成 1 次影片分析。',
  },
  monthly: {
    id: 'monthly', label: '月費方案', priceTWD: 399, billing: 'monthly',
    reviews: 30, period: 'month', ticketDays: 31, selfServe: true,
    summary: '每月 30 次影片分析（公平使用上限），隨時可停。',
  },
  project: {
    id: 'project', label: '專案陪跑', priceTWD: 1500, billing: 'one-time',
    reviews: 30, period: 'month', ticketDays: 60, selfServe: false,
    summary: '真人到場協助架設攝影機並陪你練習（不含場地費用），附 60 天 AI 分析權限。',
  },
};
export const publicPlans = () => Object.values(PLANS).map(({ id, label, priceTWD, billing, reviews, period, summary, selfServe }) => ({ id, label, priceTWD, billing, reviews, period, summary, selfServe }));
