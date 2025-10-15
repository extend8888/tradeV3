import { useLogStore } from '@/stores/logStore';
import { LogLevel, LogCategory } from '@/types';

interface LogEntry {
  category: LogCategory;
  message: string;
  data?: any;
  level?: LogLevel;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: any) {
    // 添加到日志存储
    const logStore = useLogStore.getState();
    logStore.addLog({
      level,
      category,
      message,
      details: data ? JSON.stringify(data) : undefined
    });

    // 在开发环境下输出到控制台
    if (this.isDevelopment) {
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      const prefix = `[${category.toUpperCase()}]`;
      const style = this.getConsoleStyle(level);

      console[consoleMethod](`%c${prefix}`, style, message, data || '');
    }
  }

  private getConsoleStyle(level: LogLevel): string {
    const styles: Record<LogLevel, string> = {
      info: 'color: #3B82F6; font-weight: bold',
      success: 'color: #10B981; font-weight: bold',
      warn: 'color: #F59E0B; font-weight: bold',
      error: 'color: #EF4444; font-weight: bold',
      debug: 'color: #6B7280; font-weight: bold'
    };
    return styles[level] || styles.info;
  }

  info(category: LogCategory, message: string, data?: any) {
    this.log('info', category, message, data);
  }

  success(category: LogCategory, message: string, data?: any) {
    this.log('success', category, message, data);
  }

  warn(category: LogCategory, message: string, data?: any) {
    this.log('warn', category, message, data);
  }

  error(category: LogCategory, message: string, data?: any) {
    this.log('error', category, message, data);
  }

  debug(category: LogCategory, message: string, data?: any) {
    if (this.isDevelopment) {
      this.log('debug', category, message, data);
    }
  }

  // 清除所有日志
  clear() {
    const logStore = useLogStore.getState();
    logStore.clearLogs();
  }

  // 导出日志
  export(): string {
    const logStore = useLogStore.getState();
    const logs = logStore.logs;
    return JSON.stringify(logs, null, 2);
  }

  // 获取特定类别的日志
  getByCategory(category: LogCategory) {
    const logStore = useLogStore.getState();
    return logStore.logs.filter(log => log.category === category);
  }

  // 获取特定级别的日志
  getByLevel(level: LogLevel) {
    const logStore = useLogStore.getState();
    return logStore.logs.filter(log => log.level === level);
  }
}

// 创建单例实例
export const logger = new Logger();

// 导出便捷方法
export const logInfo = (category: LogCategory, message: string, data?: any) =>
  logger.info(category, message, data);

export const logSuccess = (category: LogCategory, message: string, data?: any) =>
  logger.success(category, message, data);

export const logWarn = (category: LogCategory, message: string, data?: any) =>
  logger.warn(category, message, data);

export const logError = (category: LogCategory, message: string, data?: any) =>
  logger.error(category, message, data);

export const logDebug = (category: LogCategory, message: string, data?: any) =>
  logger.debug(category, message, data);