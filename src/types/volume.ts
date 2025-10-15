// 策略交易类型定义
export interface VolumeConfig {
  // 基础配置
  enabled: boolean;
  tokenAddress: string;
  mode: 'internal' | 'external';
  
  // 策略配置
  strategy: 'sideways' | 'bullish' | 'bearish';
  targetPrice?: number; // 目标价格（美元），交易代币达到此价格后自动停止策略交易
  
  // 交易参数
  minAmount: number;
  maxAmount: number;
  minInterval: number; // 秒
  maxInterval: number; // 秒
  
  // 钱包配置
  maxWallets: number;
  
  // 钱包轮换配置
  enableWalletRotation: boolean;
  walletRotationMode: 'sequential' | 'random' | 'weighted';
  rotationInterval: number; // 每隔多少笔交易轮换一次
  minWalletBalance: number; // 最小钱包余额要求 (SOL)
  excludeRecentWallets: boolean; // 是否排除最近使用的钱包
  recentWalletCooldown: number; // 钱包冷却时间 (分钟)
  
  // 风险控制
  maxFailures: number;
  
  // 高级设置
  slippage: number;
  priorityFee: number;
  
  // 安全设置
  autoStopOnHighRisk?: boolean;
  enableAuditLog?: boolean;
  enableRiskMonitoring?: boolean;
}

export interface VolumeSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'paused' | 'stopped' | 'error';
  config: VolumeConfig;
  
  // 暂停时间相关
  pausedAt?: Date;
  totalPausedTime: number; // 总暂停时间（毫秒）
  
  // 统计数据
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  totalFees: number;
  
  // 错误信息
  lastError?: string;
  errorCount: number;
}

export interface VolumeOrder {
  id: string;
  sessionId: string;
  walletId: string;
  type: 'buy' | 'sell';
  amount: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  executedAt?: Date;
  txHash?: string;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
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
  runningTime: number; // 运行时间（秒）
}

// 默认配置
export const DEFAULT_VOLUME_CONFIG: VolumeConfig = {
  enabled: false,
  tokenAddress: '',
  mode: 'internal',
  strategy: 'sideways', // 默认为横盘震荡策略
  minAmount: 0.01,
  maxAmount: 0.1,
  minInterval: 30,
  maxInterval: 120,
  maxWallets: 5,
  
  // 钱包轮换默认配置
  enableWalletRotation: true,
  walletRotationMode: 'random',
  rotationInterval: 3, // 每3笔交易轮换一次
  minWalletBalance: 0.01, // 最小余额0.01 SOL
  excludeRecentWallets: true,
  recentWalletCooldown: 10, // 10分钟冷却时间
  
  maxFailures: 5,
  slippage: 5,
  priorityFee: 0.0001
};

// 配置验证规则
export const VOLUME_LIMITS = {
  MIN_AMOUNT: 0.001,
  MAX_AMOUNT: 10,
  MIN_INTERVAL: 10,
  MAX_INTERVAL: 3600,
  MIN_WALLETS: 1,
  MAX_WALLETS: 20,
  MIN_SLIPPAGE: 0.1,
  MAX_SLIPPAGE: 50,
  MIN_PRIORITY_FEE: 0,
  MAX_PRIORITY_FEE: 0.01
};

// 配置验证函数
export function validateVolumeConfig(config: VolumeConfig): string[] {
  const errors: string[] = [];

  if (!config.tokenAddress) {
    errors.push('代币地址不能为空');
  }

  if (config.minAmount < VOLUME_LIMITS.MIN_AMOUNT || config.minAmount > VOLUME_LIMITS.MAX_AMOUNT) {
    errors.push(`最小金额必须在 ${VOLUME_LIMITS.MIN_AMOUNT} - ${VOLUME_LIMITS.MAX_AMOUNT} SOL 之间`);
  }

  if (config.maxAmount < VOLUME_LIMITS.MIN_AMOUNT || config.maxAmount > VOLUME_LIMITS.MAX_AMOUNT) {
    errors.push(`最大金额必须在 ${VOLUME_LIMITS.MIN_AMOUNT} - ${VOLUME_LIMITS.MAX_AMOUNT} SOL 之间`);
  }

  if (config.minAmount >= config.maxAmount) {
    errors.push('最小金额必须小于最大金额');
  }

  if (config.minInterval < VOLUME_LIMITS.MIN_INTERVAL || config.minInterval > VOLUME_LIMITS.MAX_INTERVAL) {
    errors.push(`最小间隔必须在 ${VOLUME_LIMITS.MIN_INTERVAL} - ${VOLUME_LIMITS.MAX_INTERVAL} 秒之间`);
  }

  if (config.maxInterval < VOLUME_LIMITS.MIN_INTERVAL || config.maxInterval > VOLUME_LIMITS.MAX_INTERVAL) {
    errors.push(`最大间隔必须在 ${VOLUME_LIMITS.MIN_INTERVAL} - ${VOLUME_LIMITS.MAX_INTERVAL} 秒之间`);
  }

  if (config.minInterval >= config.maxInterval) {
    errors.push('最小间隔必须小于最大间隔');
  }

  if (config.maxWallets < VOLUME_LIMITS.MIN_WALLETS || config.maxWallets > VOLUME_LIMITS.MAX_WALLETS) {
    errors.push(`最大钱包数必须在 ${VOLUME_LIMITS.MIN_WALLETS} - ${VOLUME_LIMITS.MAX_WALLETS} 之间`);
  }

  if (config.slippage < VOLUME_LIMITS.MIN_SLIPPAGE || config.slippage > VOLUME_LIMITS.MAX_SLIPPAGE) {
    errors.push(`滑点容忍度必须在 ${VOLUME_LIMITS.MIN_SLIPPAGE} - ${VOLUME_LIMITS.MAX_SLIPPAGE}% 之间`);
  }

  if (config.priorityFee < VOLUME_LIMITS.MIN_PRIORITY_FEE || config.priorityFee > VOLUME_LIMITS.MAX_PRIORITY_FEE) {
    errors.push(`优先费用必须在 ${VOLUME_LIMITS.MIN_PRIORITY_FEE} - ${VOLUME_LIMITS.MAX_PRIORITY_FEE} SOL 之间`);
  }

  return errors;
}