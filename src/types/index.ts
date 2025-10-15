// 钱包相关类型
export interface Wallet {
  id: string;
  address: string;
  privateKey: string;
  balance: number;
  solBalance: number;
  isActive: boolean;
  label?: string;
  createdAt: Date;
  lastUpdated: Date;
}

export interface WalletStats {
  totalWallets: number;
  activeWallets: number;
  totalBalance: number;
  totalSolBalance: number;
  averageBalance: number;
  balanceInterval: NodeJS.Timeout | null;
}

// RPC节点相关类型
export interface RPCNode {
  id: string;
  name: string;
  url: string;
  wsEndpoint?: string; // 可选的自定义WebSocket端点
  apiKey?: string;
  isActive: boolean;
  latency: number;
  status: 'connected' | 'disconnected' | 'testing';
  lastChecked: Date;
  priority: number;
}

export interface RPCStats {
  totalNodes: number;
  activeNodes: number;
  averageLatency: number;
  bestNode?: RPCNode;
}

// 交易相关类型
export type TradeMode = 'internal' | 'external';

export interface TradeConfig {
  mode: TradeMode; // 内盘/外盘模式
  tokenAddress: string;
  slippage: number; // 滑点百分比
  buyAmount: number; // 买入金额 (SOL)
  maxGasPrice: number;
  gasPrice: number;
  priorityFee: number;
  enableMEV: boolean;
  autoRetry: boolean;
  retryCount: number;
  maxRetries: number;
  retryDelay: number; // 重试延迟 (ms)
  tradeInterval: number; // 交易间隔 (ms)
}

export interface TradeOrder {
  id: string;
  walletId: string;
  tokenAddress: string;
  type: 'buy' | 'sell';
  mode: TradeMode;
  amount: number;
  price: number;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  txHash?: string;
  error?: string;
  createdAt: Date;
  executedAt?: Date;
  gasUsed?: number;
  actualPrice?: number;
}

export interface TradeStats {
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  successRate: number;
  totalVolume: number;
  totalProfit: number;
  averageExecutionTime: number;
}

// 代币相关类型
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
  holders: number;
  isVerified: boolean;
  createdAt: Date;
}

export interface TokenBalance {
  tokenAddress: string;
  walletAddress: string;
  balance: number;
  usdValue: number;
  lastUpdated: Date;
}

// 日志相关类型
export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';
export type LogCategory = 'rpc' | 'wallet' | 'trade' | 'system' | 'pump' | 'solana' | 'volume';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  module?: string;
  details?: any;
  walletId?: string;
  orderId?: string;
}

export interface LogFilter {
  level?: LogEntry['level'][];
  category?: LogEntry['category'][];
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

// 系统配置类型
export interface SystemConfig {
  rpcNodes: RPCNode[];
  defaultTradeConfig: TradeConfig;
  refreshInterval: number; // 数据刷新间隔 (ms)
  maxConcurrentTrades: number;
  enableNotifications: boolean;
  theme: 'dark' | 'light';
  language: 'en' | 'zh';
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

// 批量操作类型
export interface BatchOperation {
  id: string;
  type: 'import_wallets' | 'batch_trade' | 'update_balances';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  total: number;
  completed: number;
  failed: number;
  startedAt: Date;
  completedAt?: Date;
  errors: string[];
}

// 性能监控类型
export interface PerformanceMetrics {
  rpcLatency: number;
  balanceUpdateTime: number;
  tradeExecutionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  errorRate: number;
  timestamp: Date;
}

// 导出所有类型的联合类型
export type EntityType = 'wallet' | 'rpc' | 'trade' | 'token' | 'log';
export type SortDirection = 'asc' | 'desc';
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface FilterConfig {
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

// 组件Props类型
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface TableProps<T = any> extends BaseComponentProps {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  pagination?: PaginationConfig;
  onSort?: (sort: SortConfig) => void;
  onFilter?: (filters: FilterConfig[]) => void;
  onRowClick?: (row: T) => void;
}

export interface TableColumn<T = any> {
  key: string;
  title: string;
  dataIndex: keyof T;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, record: T, index: number) => React.ReactNode;
}

// 事件类型
export interface AppEvent {
  type: string;
  payload?: any;
  timestamp: Date;
}

export interface EventHandler<T = any> {
  (event: AppEvent & { payload: T }): void;
}

// 错误类型
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  stack?: string;
}

// 通知类型
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  actions?: NotificationAction[];
  timestamp: Date;
}

export interface NotificationAction {
  label: string;
  action: () => void;
  style?: 'primary' | 'secondary' | 'danger';
}

// 策略交易相关类型
export interface VolumeConfig {
  enabled: boolean;
  tokenAddress: string;
  mode: 'continuous' | 'burst' | 'random'; // 连续模式、爆发模式、随机模式
  
  // 交易参数
  minTradeAmount: number; // 最小交易金额 (SOL)
  maxTradeAmount: number; // 最大交易金额 (SOL)
  tradeInterval: {
    min: number; // 最小间隔 (秒)
    max: number; // 最大间隔 (秒)
  };
  
  // 钱包配置
  walletRotation: boolean; // 是否轮换钱包
  maxWalletsPerCycle: number; // 每轮最大使用钱包数
  
  // 安全限制
  maxLossPercentage: number; // 最大损失百分比
  stopOnError: boolean; // 遇到错误时停止
  
  // 高级设置
  priceImpactLimit: number; // 价格影响限制 (%)
  slippageTolerance: number; // 滑点容忍度 (%)
  gasOptimization: boolean; // Gas优化
  
  // 安全设置
  enableRiskMonitoring: boolean; // 启用风险监控
  autoStopOnHighRisk: boolean; // 高风险时自动停止
  enableAuditLog: boolean; // 启用审计日志
}

export interface VolumeOrder {
  id: string;
  sessionId: string; // 刷量会话ID
  walletId: string;
  tokenAddress: string;
  type: 'volume_buy' | 'volume_sell';
  amount: number;
  targetPrice?: number;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  txHash?: string;
  error?: string;
  createdAt: Date;
  executedAt?: Date;
  gasUsed?: number;
  actualPrice?: number;
  priceImpact?: number;
}

export interface VolumeSession {
  id: string;
  tokenAddress: string;
  config: VolumeConfig;
  status: 'running' | 'paused' | 'stopped' | 'completed';
  startedAt: Date;
  endedAt?: Date;
  
  // 统计数据
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  totalVolume: number; // 总交易量 (SOL)
  totalFees: number; // 总手续费
  netProfit: number; // 净利润/损失
  
  // 实时数据
  currentCycle: number;
  walletsUsed: string[];
  lastTradeAt?: Date;
  nextTradeAt?: Date;
  
  // 错误追踪
  errors: string[];
  warningCount: number;
}

export interface VolumeStats {
  // 会话统计
  activeSessions: number;
  totalSessions: number;
  
  // 交易统计
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  successRate: number;
  
  // 财务统计
  totalVolume: number;
  totalFees: number;
  averageOrderSize: number;
  
  // 性能统计
  averageExecutionTime: number;
  ordersPerMinute: number;
}

export interface VolumeRisk {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  recommendations: string[];
  maxSafeVolume: number;
  estimatedDetectionRisk: number; // 0-100%
}

// 钱包状态管理类型
export interface WalletState {
  wallets: Wallet[];
  stats: WalletStats;
  balanceInterval: NodeJS.Timeout | null;
  
  // 钱包管理
  importWallet: (privateKey: string, label?: string) => Promise<void>;
  importWallets: (privateKeys: string[]) => Promise<void>;
  removeWallet: (address: string) => void;
  updateWallet: (address: string, updates: Partial<Wallet>) => void;
  
  // 余额管理
  updateBalance: (address: string, balance: number, solBalance: number) => void;
  refreshBalances: () => Promise<void>;
  
  // 监控控制
  startBalanceMonitoring: () => void;
  stopBalanceMonitoring: () => void;

  // 统计计算
  calculateStats: (wallets: Wallet[]) => WalletStats;
}