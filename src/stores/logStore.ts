import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LogEntry, LogLevel, LogCategory } from '@/types';
import { STORAGE_KEYS } from '@/constants';

interface LogState {
  // 状态
  logs: LogEntry[];
  maxLogs: number;
  filters: {
    level: LogLevel | 'all';
    category: LogCategory | 'all';
    walletId: string | 'all';
    orderId: string | 'all';
    search: string;
  };
  autoScroll: boolean;
  isRecording: boolean;
  isAutoRefresh: boolean;

  // 操作
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  addBatchLogs: (logs: Omit<LogEntry, 'id' | 'timestamp'>[]) => void;
  clearLogs: () => void;
  removeLog: (id: string) => void;
  updateFilters: (filters: Partial<LogState['filters']>) => void;
  getFilteredLogs: () => LogEntry[];
  exportLogs: (format: 'json' | 'csv') => string;
  setMaxLogs: (max: number) => void;
  toggleAutoScroll: () => void;
  toggleRecording: () => void;
  toggleAutoRefresh: () => void;
  getLogsByLevel: (level: LogLevel) => LogEntry[];
  getLogsByCategory: (category: LogCategory) => LogEntry[];
  getLogsByWallet: (walletId: string) => LogEntry[];
  getLogsByOrder: (orderId: string) => LogEntry[];
  getRecentLogs: (count: number) => LogEntry[];
  searchLogs: (query: string) => LogEntry[];
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      // 初始状态
      logs: [],
      maxLogs: 1000,
      filters: {
        level: 'all',
        category: 'all',
        walletId: 'all',
        orderId: 'all',
        search: ''
      },
      autoScroll: true,
      isRecording: true,
      isAutoRefresh: false,

      // 添加日志
      addLog: (logData) => {
        const { isRecording, maxLogs } = get();
        
        if (!isRecording) return;

        const newLog: LogEntry = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date(),
          ...logData
        };

        set((state) => {
          let updatedLogs = [newLog, ...state.logs];
          
          // 限制日志数量
          if (updatedLogs.length > maxLogs) {
            updatedLogs = updatedLogs.slice(0, maxLogs);
          }

          return { logs: updatedLogs };
        });

        // 在控制台也输出日志（开发模式）
        if (process.env.NODE_ENV === 'development') {
          const logMethod = newLog.level === 'error' ? 'error' : 
                           newLog.level === 'warn' ? 'warn' : 'log';
          console[logMethod](`[${newLog.category}] ${newLog.message}`, newLog.details || '');
        }
      },

      // 批量添加日志
      addBatchLogs: (logsData) => {
        const { isRecording, maxLogs } = get();
        
        if (!isRecording) return;

        const newLogs: LogEntry[] = logsData.map(logData => ({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date(),
          ...logData
        }));

        set((state) => {
          let updatedLogs = [...newLogs, ...state.logs];
          
          // 限制日志数量
          if (updatedLogs.length > maxLogs) {
            updatedLogs = updatedLogs.slice(0, maxLogs);
          }

          return { logs: updatedLogs };
        });
      },

      // 清除所有日志
      clearLogs: () => {
        set({ logs: [] });
        
        get().addLog({
          level: 'info',
          category: 'system',
          message: 'Logs cleared'
        });
      },

      // 删除指定日志
      removeLog: (id) => {
        set((state) => ({
          logs: state.logs.filter(log => log.id !== id)
        }));
      },

      // 更新过滤器
      updateFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters }
        }));
      },

      // 获取过滤后的日志
      getFilteredLogs: () => {
        const { logs, filters } = get();
        
        return logs.filter(log => {
          // 级别过滤
          if (filters.level !== 'all' && log.level !== filters.level) {
            return false;
          }

          // 分类过滤
          if (filters.category !== 'all' && log.category !== filters.category) {
            return false;
          }

          // 钱包过滤
          if (filters.walletId !== 'all' && log.walletId !== filters.walletId) {
            return false;
          }

          // 订单过滤
          if (filters.orderId !== 'all' && log.orderId !== filters.orderId) {
            return false;
          }

          // 搜索过滤
          if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const messageMatch = log.message.toLowerCase().includes(searchLower);
            const detailsMatch = log.details && 
              JSON.stringify(log.details).toLowerCase().includes(searchLower);
            
            if (!messageMatch && !detailsMatch) {
              return false;
            }
          }

          return true;
        });
      },

      // 导出日志
      exportLogs: (format) => {
        const logs = get().getFilteredLogs();
        
        if (format === 'json') {
          return JSON.stringify(logs, null, 2);
        } else if (format === 'csv') {
          const headers = ['Timestamp', 'Level', 'Category', 'Message', 'WalletId', 'OrderId', 'Details'];
          const csvRows = [headers.join(',')];
          
          logs.forEach(log => {
            const row = [
              log.timestamp.toISOString(),
              log.level,
              log.category,
              `"${log.message.replace(/"/g, '""')}"`, // 转义CSV中的引号
              log.walletId || '',
              log.orderId || '',
              log.details ? `"${JSON.stringify(log.details).replace(/"/g, '""')}"` : ''
            ];
            csvRows.push(row.join(','));
          });
          
          return csvRows.join('\n');
        }
        
        return '';
      },

      // 设置最大日志数量
      setMaxLogs: (max) => {
        set((state) => {
          let updatedLogs = state.logs;
          
          // 如果新的最大值小于当前日志数量，截断日志
          if (max < updatedLogs.length) {
            updatedLogs = updatedLogs.slice(0, max);
          }
          
          return {
            maxLogs: max,
            logs: updatedLogs
          };
        });
      },

      // 切换自动滚动
      toggleAutoScroll: () => {
        set((state) => ({ autoScroll: !state.autoScroll }));
      },

      // 切换录制状态
      toggleRecording: () => {
        set((state) => {
          const newRecording = !state.isRecording;
          
          // 记录状态变化
          if (newRecording) {
            // 延迟添加，避免在状态更新过程中添加日志
            setTimeout(() => {
              get().addLog({
                level: 'info',
                category: 'system',
                message: 'Log recording resumed'
              });
            }, 0);
          } else {
            // 在停止录制前添加最后一条日志
            const finalLog: LogEntry = {
              id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              timestamp: new Date(),
              level: 'info',
              category: 'system',
              message: 'Log recording paused'
            };
            
            return {
              isRecording: false,
              logs: [finalLog, ...state.logs].slice(0, state.maxLogs)
            };
          }
          
          return { isRecording: newRecording };
        });
      },

      // 切换自动刷新
      toggleAutoRefresh: () => {
        set((state) => ({ isAutoRefresh: !state.isAutoRefresh }));
      },

      // 按级别获取日志
      getLogsByLevel: (level) => {
        const { logs } = get();
        return logs.filter(log => log.level === level);
      },

      // 按分类获取日志
      getLogsByCategory: (category) => {
        const { logs } = get();
        return logs.filter(log => log.category === category);
      },

      // 按钱包获取日志
      getLogsByWallet: (walletId) => {
        const { logs } = get();
        return logs.filter(log => log.walletId === walletId);
      },

      // 按订单获取日志
      getLogsByOrder: (orderId) => {
        const { logs } = get();
        return logs.filter(log => log.orderId === orderId);
      },

      // 获取最近的日志
      getRecentLogs: (count) => {
        const { logs } = get();
        return logs.slice(0, count);
      },

      // 搜索日志
      searchLogs: (query) => {
        const { logs } = get();
        const queryLower = query.toLowerCase();
        
        return logs.filter(log => {
          const messageMatch = log.message.toLowerCase().includes(queryLower);
          const detailsMatch = log.details && 
            JSON.stringify(log.details).toLowerCase().includes(queryLower);
          
          return messageMatch || detailsMatch;
        });
      }
    }),
    {
      name: STORAGE_KEYS.LOG_SETTINGS,
      partialize: (state) => ({
        maxLogs: state.maxLogs,
        filters: state.filters,
        autoScroll: state.autoScroll,
        isRecording: state.isRecording,
        isAutoRefresh: state.isAutoRefresh
      })
    }
  )
);

// 导出store类型
export type LogStore = typeof useLogStore;

// 导出便捷的日志记录函数
export const logger = {
  info: (category: LogCategory, message: string, details?: any, walletId?: string, orderId?: string) => {
    useLogStore.getState().addLog({
      level: 'info',
      category,
      message,
      details,
      walletId,
      orderId
    });
  },
  
  warn: (category: LogCategory, message: string, details?: any, walletId?: string, orderId?: string) => {
    useLogStore.getState().addLog({
      level: 'warn',
      category,
      message,
      details,
      walletId,
      orderId
    });
  },
  
  error: (category: LogCategory, message: string, details?: any, walletId?: string, orderId?: string) => {
    useLogStore.getState().addLog({
      level: 'error',
      category,
      message,
      details,
      walletId,
      orderId
    });
  },
  
  debug: (category: LogCategory, message: string, details?: any, walletId?: string, orderId?: string) => {
    useLogStore.getState().addLog({
      level: 'debug',
      category,
      message,
      details,
      walletId,
      orderId
    });
  }
};