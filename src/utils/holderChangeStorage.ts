// 前10大户持仓变化数据存储工具

export interface HolderData {
  address: string;
  balance: number;
  percentage: number;
  rank: number;
}

export interface HolderSnapshot {
  tokenAddress: string;
  timestamp: number;
  holders: HolderData[];
}

export interface HolderChange {
  balanceChange: number;
  percentageChange: number;
  isNew: boolean;
}

class HolderChangeStorage {
  private getStorageKey(tokenAddress: string): string {
    return `holder_snapshot_${tokenAddress}`;
  }

  // 获取上次的持仓快照
  getPreviousSnapshot(tokenAddress: string): HolderSnapshot | null {
    try {
      const key = this.getStorageKey(tokenAddress);
      const data = localStorage.getItem(key);
      if (!data) return null;
      
      const snapshot = JSON.parse(data) as HolderSnapshot;
      return snapshot;
    } catch (error) {
      console.error('获取历史持仓数据失败:', error);
      return null;
    }
  }

  // 保存当前持仓快照
  saveSnapshot(tokenAddress: string, holders: HolderData[]): void {
    try {
      const snapshot: HolderSnapshot = {
        tokenAddress,
        timestamp: Date.now(),
        holders: holders.slice(0, 10) // 只保存前10名
      };
      
      const key = this.getStorageKey(tokenAddress);
      localStorage.setItem(key, JSON.stringify(snapshot));
      
      console.log(`✅ 已保存持仓快照: ${tokenAddress}`, snapshot);
    } catch (error) {
      console.error('保存持仓快照失败:', error);
    }
  }

  // 计算持仓变化
  calculateChanges(tokenAddress: string, currentHolders: HolderData[]): Map<string, HolderChange> {
    const changes = new Map<string, HolderChange>();
    const previousSnapshot = this.getPreviousSnapshot(tokenAddress);
    
    if (!previousSnapshot) {
      // 首次获取数据，所有持仓者都标记为新增
      currentHolders.forEach(holder => {
        changes.set(holder.address, {
          balanceChange: 0,
          percentageChange: 0,
          isNew: true
        });
      });
      return changes;
    }

    // 创建上次数据的映射表
    const previousHolders = new Map<string, HolderData>();
    previousSnapshot.holders.forEach(holder => {
      previousHolders.set(holder.address, holder);
    });

    // 计算每个当前持仓者的变化
    currentHolders.forEach(currentHolder => {
      const previousHolder = previousHolders.get(currentHolder.address);
      
      if (!previousHolder) {
        // 新增的持仓者
        changes.set(currentHolder.address, {
          balanceChange: 0,
          percentageChange: 0,
          isNew: true
        });
      } else {
        // 计算变化百分比
        const balanceChange = ((currentHolder.balance - previousHolder.balance) / previousHolder.balance) * 100;
        const percentageChange = ((currentHolder.percentage - previousHolder.percentage) / previousHolder.percentage) * 100;
        
        changes.set(currentHolder.address, {
          balanceChange: isFinite(balanceChange) ? balanceChange : 0,
          percentageChange: isFinite(percentageChange) ? percentageChange : 0,
          isNew: false
        });
      }
    });

    return changes;
  }

  // 格式化变化显示
  formatChange(change: HolderChange): { text: string; color: string } {
    if (change.isNew) {
      return { text: '新增', color: 'text-blue-600' };
    }

    const changeValue = change.balanceChange;
    
    if (Math.abs(changeValue) < 0.01) {
      return { text: '0.00%', color: 'text-gray-500' };
    }

    const sign = changeValue > 0 ? '+' : '';
    const color = changeValue > 0 ? 'text-green-600' : 'text-red-600';
    
    return {
      text: `${sign}${changeValue.toFixed(2)}%`,
      color
    };
  }

  // 清除指定代币的历史数据
  clearHistory(tokenAddress: string): void {
    try {
      const key = this.getStorageKey(tokenAddress);
      localStorage.removeItem(key);
      console.log(`🗑️ 已清除历史数据: ${tokenAddress}`);
    } catch (error) {
      console.error('清除历史数据失败:', error);
    }
  }
}

// 导出单例实例
export const holderChangeStorage = new HolderChangeStorage