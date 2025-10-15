// 默认RPC节点配置
export const DEFAULT_RPC_NODES = [
  {
    id: 'zan',
    name: 'Zan RPC (默认)',
    url: 'https://api.zan.top/node/v1/solana/mainnet/f5654bcc0d0b472f937410dea8694411',
    wsEndpoint: 'wss://api.zan.top/node/ws/v1/solana/mainnet/f5654bcc0d0b472f937410dea8694411',
    isActive: true,
    latency: 0,
    status: 'disconnected' as const,
    lastChecked: new Date(),
    priority: 1
  },
  {
    id: 'mainnet-beta',
    name: 'Solana Mainnet Beta',
    url: 'https://api.mainnet-beta.solana.com',
    isActive: false,
    latency: 0,
    status: 'disconnected' as const,
    lastChecked: new Date(),
    priority: 2
  },
  {
    id: 'shyft',
    name: 'Shyft RPC',
    url: 'https://rpc.shyft.to',
    isActive: false,
    latency: 0,
    status: 'disconnected' as const,
    lastChecked: new Date(),
    priority: 3
  },
  {
    id: 'ankr',
    name: 'Ankr RPC',
    url: 'https://rpc.ankr.com/solana',
    isActive: false,
    latency: 0,
    status: 'disconnected' as const,
    lastChecked: new Date(),
    priority: 4
  }
];

// 默认交易配置 - 保守设置
export const DEFAULT_TRADE_CONFIG = {
  mode: 'internal' as const,
  tokenAddress: '',
  slippage: 5.0, // 5% - 更宽松的滑点
  buyAmount: 0.01, // 0.01 SOL - 更小的交易金额
  maxGasPrice: 0.001, // 0.001 SOL
  gasPrice: 0.0005, // 0.0005 SOL
  priorityFee: 0.0001, // 0.0001 SOL
  enableMEV: false,
  autoRetry: true,
  retryCount: 2, // 减少重试次数
  maxRetries: 3, // 减少最大重试次数
  retryDelay: 2000, // 2秒 - 增加重试延迟
  tradeInterval: 1000 // 1秒 - 交易间隔
};

// 系统默认配置
export const DEFAULT_SYSTEM_CONFIG = {
  rpcNodes: DEFAULT_RPC_NODES,
  defaultTradeConfig: DEFAULT_TRADE_CONFIG,
  refreshInterval: 5000, // 5秒
  maxConcurrentTrades: 10,
  enableNotifications: true,
  theme: 'dark' as const,
  language: 'zh' as const
};

// 分页配置
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
  MAX_PAGE_SIZE: 1000
};

// 刷新间隔配置
export const REFRESH_INTERVALS = {
  FAST: 1000, // 1秒
  NORMAL: 5000, // 5秒
  SLOW: 30000, // 30秒
  BALANCE_UPDATE: 10000, // 10秒
  RPC_CHECK: 15000, // 15秒
  PRICE_UPDATE: 3000 // 3秒
};

// 交易限制 - 保守设置
export const TRADE_LIMITS = {
  MIN_BUY_AMOUNT: 0.001, // 最小买入金额 (SOL)
  MAX_BUY_AMOUNT: 10, // 最大买入金额 (SOL) - 降低限制
  MIN_SLIPPAGE: 1, // 最小滑点 (%) - 提高最小值
  MAX_SLIPPAGE: 20, // 最大滑点 (%) - 降低最大值
  MAX_RETRY_COUNT: 3, // 减少最大重试次数
  MIN_RETRY_DELAY: 1000, // 最小重试延迟 (ms) - 增加延迟
  MAX_RETRY_DELAY: 10000 // 最大重试延迟 (ms) - 减少最大延迟
};

// 钱包限制
export const WALLET_LIMITS = {
  MAX_WALLETS: 1000,
  MAX_LABEL_LENGTH: 50,
  MIN_BALANCE_DISPLAY: 0.000001 // 最小显示余额
};

// RPC限制
export const RPC_LIMITS = {
  MAX_NODES: 20,
  TIMEOUT: 10000, // 10秒超时
  MAX_LATENCY: 5000, // 5秒最大延迟
  HEALTH_CHECK_INTERVAL: 30000 // 30秒健康检查间隔
};

// 日志配置
export const LOG_CONFIG = {
  MAX_ENTRIES: 10000,
  RETENTION_DAYS: 7,
  LEVELS: ['debug', 'info', 'warn', 'error'] as const,
  CATEGORIES: ['rpc', 'wallet', 'trade', 'system'] as const
};

// 颜色主题
export const COLORS = {
  PRIMARY: '#3B82F6',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  ERROR: '#EF4444',
  INFO: '#6B7280',
  BACKGROUND: '#0F172A',
  SURFACE: '#1E293B',
  BORDER: '#334155',
  TEXT_PRIMARY: '#F8FAFC',
  TEXT_SECONDARY: '#CBD5E1',
  TEXT_MUTED: '#64748B'
};

// 状态颜色映射
export const STATUS_COLORS = {
  connected: COLORS.SUCCESS,
  disconnected: COLORS.ERROR,
  testing: COLORS.WARNING,
  pending: COLORS.WARNING,
  executing: COLORS.INFO,
  completed: COLORS.SUCCESS,
  failed: COLORS.ERROR,
  cancelled: COLORS.TEXT_MUTED
};

// 图表配置
export const CHART_CONFIG = {
  COLORS: {
    PRIMARY: '#3B82F6',
    SECONDARY: '#10B981',
    ACCENT: '#F59E0B',
    GRID: '#334155',
    TEXT: '#CBD5E1'
  },
  ANIMATION_DURATION: 300,
  UPDATE_INTERVAL: 1000
};

// 本地存储键名
export const STORAGE_KEYS = {
  WALLETS: 'socrates-trader_wallets',
  RPC_NODES: 'socrates-trader_rpc_nodes',
  TRADE_CONFIG: 'socrates-trader_trade_config',
  VOLUME_CONFIG: 'socrates-trader_volume_config',
  SYSTEM_CONFIG: 'socrates-trader_system_config',
  LOGS: 'socrates-trader_logs',
  LOG_SETTINGS: 'socrates-trader_log_settings',
  THEME: 'socrates-trader_theme',
  LANGUAGE: 'socrates-trader_language'
};

// API端点
export const API_ENDPOINTS = {
  SOLANA_PRICE: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
  TOKEN_PRICE: 'https://api.coingecko.com/api/v3/simple/token_price/solana',
  TOKEN_INFO: 'https://api.solana.fm/v1/tokens'
};

// 错误消息
export const ERROR_MESSAGES = {
  WALLET_IMPORT_FAILED: '钱包导入失败',
  INVALID_PRIVATE_KEY: '无效的私钥格式',
  INSUFFICIENT_BALANCE: '余额不足',
  RPC_CONNECTION_FAILED: 'RPC连接失败',
  TRADE_EXECUTION_FAILED: '交易执行失败',
  INVALID_TOKEN_ADDRESS: '无效的代币地址',
  NETWORK_ERROR: '网络错误',
  UNKNOWN_ERROR: '未知错误'
};

// 成功消息
export const SUCCESS_MESSAGES = {
  WALLET_IMPORTED: '钱包导入成功',
  WALLET_DELETED: '钱包删除成功',
  RPC_CONNECTED: 'RPC连接成功',
  TRADE_COMPLETED: '交易完成',
  CONFIG_SAVED: '配置保存成功',
  BALANCE_UPDATED: '余额更新成功'
};

// 正则表达式
export const REGEX_PATTERNS = {
  SOLANA_ADDRESS: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  PRIVATE_KEY: /^[1-9A-HJ-NP-Za-km-z]{87,88}$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  NUMBER: /^\d+(\.\d+)?$/,
  PERCENTAGE: /^\d+(\.\d+)?%?$/
};

// 快捷键配置
export const KEYBOARD_SHORTCUTS = {
  REFRESH: 'r',
  NEW_WALLET: 'n',
  TOGGLE_THEME: 't',
  SEARCH: '/',
  ESCAPE: 'Escape',
  ENTER: 'Enter'
};

// 动画配置
export const ANIMATION_CONFIG = {
  DURATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
  },
  EASING: {
    EASE_IN: 'ease-in',
    EASE_OUT: 'ease-out',
    EASE_IN_OUT: 'ease-in-out'
  }
};

// 导出所有常量
export * from './index';