// 本地数据存储工具
// 用于缓存代币数据、交易记录、价格历史等信息

// 存储的交易数据接口
export interface StoredTransaction {
  signature: string;
  timestamp: number;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  value: number;
  account: string;
  slot: number;
}

// 存储的价格数据接口
export interface StoredPriceData {
  timestamp: number;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  source: string;
}

// 存储的交易量数据接口
export interface StoredVolumeData {
  timestamp: number;
  hourlyVolume: number;
  dailyVolume: number;
  transactionCount: number;
}

// 存储的预警数据接口
export interface StoredAlertData {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data?: any;
}

// 代币数据缓存接口
export interface TokenDataCache {
  tokenAddress: string;
  lastUpdate: number;
  transactions: StoredTransaction[];
  priceHistory: StoredPriceData[];
  volumeHistory: StoredVolumeData[];
  alerts: StoredAlertData[];
}

// 数据存储管理类
class DataStorage {
  private static instance: DataStorage;
  private readonly STORAGE_PREFIX = 'token_monitor_';
  private readonly MAX_TRANSACTIONS = 1000;
  private readonly MAX_PRICE_HISTORY = 500;
  private readonly MAX_VOLUME_HISTORY = 200;
  private readonly MAX_ALERTS = 100;
  private readonly DATA_RETENTION_DAYS = 7;

  private constructor() {
    // 启动时清理过期数据
    this.cleanupOldData();
  }

  // 获取单例实例
  public static getInstance(): DataStorage {
    if (!DataStorage.instance) {
      DataStorage.instance = new DataStorage();
    }
    return DataStorage.instance;
  }

  // 生成存储键
  private getStorageKey(tokenAddress: string, type: string): string {
    return `${this.STORAGE_PREFIX}${tokenAddress}_${type}`;
  }

  // 获取代币缓存数据
  public getTokenCache(tokenAddress: string): TokenDataCache {
    try {
      const key = this.getStorageKey(tokenAddress, 'cache');
      const cached = localStorage.getItem(key);
      
      if (cached) {
        const data = JSON.parse(cached) as TokenDataCache;
        // 清理过期数据
        this.cleanupExpiredData(data);
        return data;
      }
    } catch (error) {
      console.error('获取代币缓存失败:', error);
    }

    // 返回默认缓存结构
    return {
      tokenAddress,
      lastUpdate: Date.now(),
      transactions: [],
      priceHistory: [],
      volumeHistory: [],
      alerts: []
    };
  }

  // 保存代币缓存数据
  public saveTokenCache(tokenAddress: string, cache: TokenDataCache): void {
    const key = this.getStorageKey(tokenAddress, 'cache');
    try {
      cache.lastUpdate = Date.now();

      // 清理过期数据
      this.cleanupExpiredData(cache);

      localStorage.setItem(key, JSON.stringify(cache));
    } catch (error) {
      console.error('保存代币缓存失败:', error);

      // 如果存储空间不足，尝试清理旧数据
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.cleanupOldData();
        try {
          localStorage.setItem(key, JSON.stringify(cache));
        } catch (retryError) {
          console.error('重试保存失败:', retryError);
        }
      }
    }
  }

  // 添加交易记录
  public addTransaction(tokenAddress: string, transaction: StoredTransaction): void {
    const cache = this.getTokenCache(tokenAddress);
    
    // 检查是否已存在相同交易
    const exists = cache.transactions.some(tx => tx.signature === transaction.signature);
    if (exists) return;

    // 添加新交易
    cache.transactions.unshift(transaction);
    
    // 限制数量
    if (cache.transactions.length > this.MAX_TRANSACTIONS) {
      cache.transactions = cache.transactions.slice(0, this.MAX_TRANSACTIONS);
    }

    this.saveTokenCache(tokenAddress, cache);
  }

  // 批量添加交易记录
  public addTransactions(tokenAddress: string, transactions: StoredTransaction[]): void {
    const cache = this.getTokenCache(tokenAddress);
    
    // 过滤重复交易
    const existingSignatures = new Set(cache.transactions.map(tx => tx.signature));
    const newTransactions = transactions.filter(tx => !existingSignatures.has(tx.signature));
    
    if (newTransactions.length === 0) return;

    // 添加新交易并排序
    cache.transactions = [...newTransactions, ...cache.transactions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.MAX_TRANSACTIONS);

    this.saveTokenCache(tokenAddress, cache);
  }

  // 添加价格历史记录
  public addPriceHistory(tokenAddress: string, priceData: StoredPriceData): void {
    const cache = this.getTokenCache(tokenAddress);
    
    // 检查是否已存在相同时间戳的数据（允许5分钟误差）
    const existingIndex = cache.priceHistory.findIndex(
      p => Math.abs(p.timestamp - priceData.timestamp) < 5 * 60 * 1000
    );
    
    if (existingIndex >= 0) {
      // 更新现有数据
      cache.priceHistory[existingIndex] = priceData;
    } else {
      // 添加新数据
      cache.priceHistory.unshift(priceData);
    }
    
    // 按时间排序并限制数量
    cache.priceHistory = cache.priceHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.MAX_PRICE_HISTORY);

    this.saveTokenCache(tokenAddress, cache);
  }

  // 添加交易量历史记录
  public addVolumeHistory(tokenAddress: string, volumeData: StoredVolumeData): void {
    const cache = this.getTokenCache(tokenAddress);
    
    // 检查是否已存在相同时间戳的数据（允许1小时误差）
    const existingIndex = cache.volumeHistory.findIndex(
      v => Math.abs(v.timestamp - volumeData.timestamp) < 60 * 60 * 1000
    );
    
    if (existingIndex >= 0) {
      // 更新现有数据
      cache.volumeHistory[existingIndex] = volumeData;
    } else {
      // 添加新数据
      cache.volumeHistory.unshift(volumeData);
    }
    
    // 按时间排序并限制数量
    cache.volumeHistory = cache.volumeHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.MAX_VOLUME_HISTORY);

    this.saveTokenCache(tokenAddress, cache);
  }

  // 添加预警记录
  public addAlert(tokenAddress: string, alert: StoredAlertData): void {
    const cache = this.getTokenCache(tokenAddress);
    
    // 检查是否已存在相同预警
    const exists = cache.alerts.some(a => a.id === alert.id);
    if (exists) return;

    // 添加新预警
    cache.alerts.unshift(alert);
    
    // 限制数量
    if (cache.alerts.length > this.MAX_ALERTS) {
      cache.alerts = cache.alerts.slice(0, this.MAX_ALERTS);
    }

    this.saveTokenCache(tokenAddress, cache);
  }

  // 获取交易历史
  public getTransactionHistory(tokenAddress: string, limit?: number): StoredTransaction[] {
    const cache = this.getTokenCache(tokenAddress);
    return limit ? cache.transactions.slice(0, limit) : cache.transactions;
  }

  // 获取价格历史
  public getPriceHistory(tokenAddress: string, hours?: number): StoredPriceData[] {
    const cache = this.getTokenCache(tokenAddress);
    
    if (hours) {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      return cache.priceHistory.filter(p => p.timestamp > cutoffTime);
    }
    
    return cache.priceHistory;
  }

  // 获取交易量历史
  public getVolumeHistory(tokenAddress: string, hours?: number): StoredVolumeData[] {
    const cache = this.getTokenCache(tokenAddress);
    
    if (hours) {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      return cache.volumeHistory.filter(v => v.timestamp > cutoffTime);
    }
    
    return cache.volumeHistory;
  }

  // 获取预警历史
  public getAlertHistory(tokenAddress: string, hours?: number): StoredAlertData[] {
    const cache = this.getTokenCache(tokenAddress);
    
    if (hours) {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      return cache.alerts.filter(a => a.timestamp > cutoffTime);
    }
    
    return cache.alerts;
  }

  // 计算交易量趋势
  public calculateVolumeTrend(tokenAddress: string, periodHours: number): {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  } {
    const volumeHistory = this.getVolumeHistory(tokenAddress, periodHours * 2);
    
    const now = Date.now();
    const periodMs = periodHours * 60 * 60 * 1000;
    const currentPeriodStart = now - periodMs;
    const previousPeriodStart = now - (periodMs * 2);

    // 当前周期交易量
    const currentVolume = volumeHistory
      .filter(v => v.timestamp >= currentPeriodStart && v.timestamp <= now)
      .reduce((sum, v) => sum + v.hourlyVolume, 0);

    // 上一周期交易量
    const previousVolume = volumeHistory
      .filter(v => v.timestamp >= previousPeriodStart && v.timestamp < currentPeriodStart)
      .reduce((sum, v) => sum + v.hourlyVolume, 0);

    const change = currentVolume - previousVolume;
    const changePercent = previousVolume > 0 ? (change / previousVolume) * 100 : 0;

    return {
      current: currentVolume,
      previous: previousVolume,
      change,
      changePercent
    };
  }

  // 获取大单交易统计
  public getLargeTransactionStats(tokenAddress: string, minAmount: number, hours: number = 24): {
    count: number;
    totalAmount: number;
    averageAmount: number;
    buyCount: number;
    sellCount: number;
  } {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    const transactions = this.getTransactionHistory(tokenAddress)
      .filter(tx => tx.timestamp > cutoffTime && tx.amount >= minAmount);

    const buyTransactions = transactions.filter(tx => tx.type === 'buy');
    const sellTransactions = transactions.filter(tx => tx.type === 'sell');
    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      count: transactions.length,
      totalAmount,
      averageAmount: transactions.length > 0 ? totalAmount / transactions.length : 0,
      buyCount: buyTransactions.length,
      sellCount: sellTransactions.length
    };
  }

  // 清理过期数据
  private cleanupExpiredData(cache: TokenDataCache): void {
    const cutoffTime = Date.now() - (this.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    // 清理过期交易
    cache.transactions = cache.transactions.filter(tx => tx.timestamp > cutoffTime);
    
    // 清理过期价格数据
    cache.priceHistory = cache.priceHistory.filter(p => p.timestamp > cutoffTime);
    
    // 清理过期交易量数据
    cache.volumeHistory = cache.volumeHistory.filter(v => v.timestamp > cutoffTime);
    
    // 清理过期预警
    cache.alerts = cache.alerts.filter(a => a.timestamp > cutoffTime);
  }

  // 清理旧数据以释放存储空间
  private cleanupOldData(): void {
    try {
      const keysToRemove: string[] = [];
      
      // 遍历所有localStorage键
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            
            // 如果数据超过7天，标记为删除
            if (data.lastUpdate && Date.now() - data.lastUpdate > this.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
              keysToRemove.push(key);
            }
          } catch (error) {
            // 如果解析失败，也标记为删除
            keysToRemove.push(key);
          }
        }
      }
      
      // 删除标记的键
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log(`清理了 ${keysToRemove.length} 个过期数据项`);
    } catch (error) {
      console.error('清理旧数据失败:', error);
    }
  }

  // 清除指定代币的所有数据
  public clearTokenData(tokenAddress: string): void {
    try {
      const key = this.getStorageKey(tokenAddress, 'cache');
      localStorage.removeItem(key);
    } catch (error) {
      console.error('清除代币数据失败:', error);
    }
  }

  // 获取存储使用情况
  public getStorageInfo(): {
    used: number;
    total: number;
    percentage: number;
    tokenCount: number;
  } {
    let used = 0;
    let tokenCount = 0;
    
    try {
      // 计算已使用空间
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key) || '';
          used += key.length + value.length;
          
          if (key.startsWith(this.STORAGE_PREFIX)) {
            tokenCount++;
          }
        }
      }
      
      // 估算总空间（通常为5-10MB）
      const total = 5 * 1024 * 1024; // 5MB
      const percentage = (used / total) * 100;
      
      return {
        used,
        total,
        percentage,
        tokenCount
      };
    } catch (error) {
      console.error('获取存储信息失败:', error);
      return {
        used: 0,
        total: 0,
        percentage: 0,
        tokenCount: 0
      };
    }
  }
}

// 导出单例实例
export const dataStorage = DataStorage.getInstance();

// 导出类
export default DataStorage;