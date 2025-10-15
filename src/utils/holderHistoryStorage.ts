// 大户持仓历史数据存储管理

export interface HolderHistoryRecord {
  timestamp: number;
  tokenAddress: string;
  totalHolders: number;
  whales: number; // > 1%
  large: number;  // 0.1% - 1%
  medium: number; // 0.01% - 0.1%
  small: number;  // < 0.01%
  top10Percentage: number;
  top50Percentage: number;
  topHolders: Array<{
    address: string;
    balance: number;
    percentage: number;
    rank: number;
  }>;
}

export interface HolderTrendAnalysis {
  current: HolderHistoryRecord;
  previous?: HolderHistoryRecord;
  changes: {
    totalHolders: {
      value: number;
      percentage: number;
      trend: 'up' | 'down' | 'stable';
    };
    whales: {
      value: number;
      percentage: number;
      trend: 'up' | 'down' | 'stable';
    };
    large: {
      value: number;
      percentage: number;
      trend: 'up' | 'down' | 'stable';
    };
    concentration: {
      top10Change: number;
      top50Change: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    };
  };
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

class HolderHistoryStorage {
  private readonly STORAGE_KEY_PREFIX = 'holder_history_';
  private readonly MAX_RECORDS = 50; // 最多保存50条历史记录
  private readonly MIN_INTERVAL = 5 * 60 * 1000; // 最小间隔5分钟

  private getStorageKey(tokenAddress: string): string {
    return `${this.STORAGE_KEY_PREFIX}${tokenAddress}`;
  }

  // 获取历史记录
  getHistory(tokenAddress: string): HolderHistoryRecord[] {
    try {
      const key = this.getStorageKey(tokenAddress);
      const data = localStorage.getItem(key);
      if (!data) return [];
      
      const records: HolderHistoryRecord[] = JSON.parse(data);
      return records.sort((a, b) => b.timestamp - a.timestamp); // 按时间倒序
    } catch (error) {
      console.error('获取历史记录失败:', error);
      return [];
    }
  }

  // 保存新记录
  saveRecord(record: HolderHistoryRecord): void {
    try {
      const history = this.getHistory(record.tokenAddress);
      
      // 检查是否需要保存（避免频繁保存相同数据）
      if (history.length > 0) {
        const lastRecord = history[0];
        const timeDiff = record.timestamp - lastRecord.timestamp;
        
        // 如果时间间隔太短且数据没有显著变化，则不保存
        if (timeDiff < this.MIN_INTERVAL && 
            Math.abs(record.totalHolders - lastRecord.totalHolders) < 5) {
          return;
        }
      }
      
      // 添加新记录
      history.unshift(record);
      
      // 限制记录数量
      if (history.length > this.MAX_RECORDS) {
        history.splice(this.MAX_RECORDS);
      }
      
      // 保存到localStorage
      const key = this.getStorageKey(record.tokenAddress);
      localStorage.setItem(key, JSON.stringify(history));
      
      console.log(`✅ 已保存持仓历史记录: ${record.tokenAddress}`);
    } catch (error) {
      console.error('保存历史记录失败:', error);
    }
  }

  // 获取趋势分析
  getTrendAnalysis(tokenAddress: string): HolderTrendAnalysis | null {
    const history = this.getHistory(tokenAddress);
    if (history.length === 0) return null;
    
    const current = history[0];
    const previous = history.length > 1 ? history[1] : undefined;
    
    if (!previous) {
      // 只有一条记录时的默认分析
      return {
        current,
        changes: {
          totalHolders: { value: 0, percentage: 0, trend: 'stable' },
          whales: { value: 0, percentage: 0, trend: 'stable' },
          large: { value: 0, percentage: 0, trend: 'stable' },
          concentration: { top10Change: 0, top50Change: 0, trend: 'stable' }
        },
        riskLevel: this.calculateRiskLevel(current),
        summary: '首次分析，暂无历史对比数据'
      };
    }
    
    // 计算变化
    const totalHoldersChange = current.totalHolders - previous.totalHolders;
    const totalHoldersPercentage = previous.totalHolders > 0 ? 
      (totalHoldersChange / previous.totalHolders) * 100 : 0;
    
    const whalesChange = current.whales - previous.whales;
    const whalesPercentage = previous.whales > 0 ? 
      (whalesChange / previous.whales) * 100 : 0;
    
    const largeChange = current.large - previous.large;
    const largePercentage = previous.large > 0 ? 
      (largeChange / previous.large) * 100 : 0;
    
    const top10Change = current.top10Percentage - previous.top10Percentage;
    const top50Change = current.top50Percentage - previous.top50Percentage;
    
    // 生成趋势分析
    const analysis: HolderTrendAnalysis = {
      current,
      previous,
      changes: {
        totalHolders: {
          value: totalHoldersChange,
          percentage: totalHoldersPercentage,
          trend: totalHoldersChange > 0 ? 'up' : totalHoldersChange < 0 ? 'down' : 'stable'
        },
        whales: {
          value: whalesChange,
          percentage: whalesPercentage,
          trend: whalesChange > 0 ? 'up' : whalesChange < 0 ? 'down' : 'stable'
        },
        large: {
          value: largeChange,
          percentage: largePercentage,
          trend: largeChange > 0 ? 'up' : largeChange < 0 ? 'down' : 'stable'
        },
        concentration: {
          top10Change,
          top50Change,
          trend: (top10Change + top50Change) > 1 ? 'increasing' : 
                 (top10Change + top50Change) < -1 ? 'decreasing' : 'stable'
        }
      },
      riskLevel: this.calculateRiskLevel(current),
      summary: this.generateSummary(current, previous, totalHoldersPercentage, whalesPercentage)
    };
    
    return analysis;
  }

  // 计算风险等级
  private calculateRiskLevel(record: HolderHistoryRecord): 'low' | 'medium' | 'high' {
    const { whales, top10Percentage, top50Percentage } = record;
    
    // 高风险：巨鲸过多或集中度过高
    if (whales > 10 || top10Percentage > 80 || top50Percentage > 95) {
      return 'high';
    }
    
    // 中等风险：适中的集中度
    if (whales > 5 || top10Percentage > 60 || top50Percentage > 85) {
      return 'medium';
    }
    
    // 低风险：分散持仓
    return 'low';
  }

  // 生成分析摘要
  private generateSummary(
    current: HolderHistoryRecord, 
    previous: HolderHistoryRecord,
    totalHoldersPercentage: number,
    whalesPercentage: number
  ): string {
    const parts: string[] = [];
    
    // 总持有者变化
    if (Math.abs(totalHoldersPercentage) > 5) {
      const direction = totalHoldersPercentage > 0 ? '增加' : '减少';
      parts.push(`持有者数量${direction}${Math.abs(totalHoldersPercentage).toFixed(1)}%`);
    }
    
    // 巨鲸变化
    if (Math.abs(whalesPercentage) > 10) {
      const direction = whalesPercentage > 0 ? '增加' : '减少';
      parts.push(`巨鲸数量${direction}${Math.abs(whalesPercentage).toFixed(1)}%`);
    }
    
    // 集中度变化
    const concentrationChange = current.top10Percentage - previous.top10Percentage;
    if (Math.abs(concentrationChange) > 2) {
      const direction = concentrationChange > 0 ? '上升' : '下降';
      parts.push(`前10持仓集中度${direction}${Math.abs(concentrationChange).toFixed(1)}%`);
    }
    
    return parts.length > 0 ? parts.join('，') : '持仓结构相对稳定';
  }

  // 清除历史记录
  clearHistory(tokenAddress: string): void {
    try {
      const key = this.getStorageKey(tokenAddress);
      localStorage.removeItem(key);
      console.log(`🗑️ 已清除历史记录: ${tokenAddress}`);
    } catch (error) {
      console.error('清除历史记录失败:', error);
    }
  }

  // 获取所有代币的历史记录键
  getAllTokenKeys(): string[] {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          keys.push(key.replace(this.STORAGE_KEY_PREFIX, ''));
        }
      }
    } catch (error) {
      console.error('获取历史记录键失败:', error);
    }
    return keys;
  }
}

// 导出单例实例
export const holderHistoryStorage = new HolderHistoryStorage();