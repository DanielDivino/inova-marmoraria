export type DashboardCounts = {
  issued: number; pending: number; sold: number; cancelled: number; rejected: number; expired: number;
  approved: number; production: number; waitingMaterial: number; pendingWork: number; rework: number; paused: number;
  ready: number; deliveryPending: number; installationPending: number; delivered: number; overdue: number;
  quotedValue: number; soldValue: number; conversion: number;
};
export type DashboardData = {
  totals: DashboardCounts;
  sellers: ({ id: string; name: string; role: import('./acesso.js').UserRole; isActive: boolean } & DashboardCounts)[];
  overdueQuotes: { id: string; number: string; customerName: string; sellerName: string; deadline: string; deadlineSource: string; netTotal: number }[];
  generatedAt: string;
};
