import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 通用工具函数
 */

// Tailwind CSS 类名合并
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 格式化数字显示
export const formatNumber = (num: number, decimals: number = 2): string => {
  if (num === 0) return '0';
  
  if (num < 0.01) {
    return num.toExponential(2);
  }
  
  if (num < 1000) {
    return num.toFixed(decimals);
  }
  
  if (num < 1000000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  
  if (num < 1000000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  
  return (num / 1000000000).toFixed(1) + 'B';
};

// 格式化百分比
export const formatPercentage = (num: number, decimals: number = 2): string => {
  return `${num.toFixed(decimals)}%`;
};

// 格式化时间
export const formatTime = (date: Date | string | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// 格式化日期时间
export const formatDateTime = (date: Date | string | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// 格式化相对时间
export const formatRelativeTime = (date: Date | string | number): string => {
  const now = new Date();
  const dateObj = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) {
    return `${diffSecs}秒前`;
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else {
    return `${diffDays}天前`;
  }
};

// 截断地址显示
export const truncateAddress = (address: string, startChars: number = 6, endChars: number = 4): string => {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

// 复制到剪贴板
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // 降级方案
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (fallbackError) {
      console.error('Failed to copy to clipboard:', fallbackError);
      return false;
    }
  }
};

// 生成随机ID
export const generateId = (prefix: string = '', length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}_${result}` : result;
};

// 防抖函数
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// 节流函数
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// 延迟函数
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// 重试函数
export const retry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      await delay(delayMs * attempt);
    }
  }
  
  throw lastError!;
};

// 验证邮箱格式
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// 验证URL格式
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// 验证数字范围
export const isInRange = (value: number, min: number, max: number): boolean => {
  return value >= min && value <= max;
};

// 安全的JSON解析
export const safeJsonParse = <T>(json: string, defaultValue: T): T => {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
};

// 本地存储工具
export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  
  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  },
  
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  },
  
  clear: (): void => {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }
};

// 会话存储工具
export const sessionStorage = {
  get: <T>(key: string, defaultValue: T): T => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  
  set: <T>(key: string, value: T): void => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to sessionStorage:', error);
    }
  },
  
  remove: (key: string): void => {
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from sessionStorage:', error);
    }
  },
  
  clear: (): void => {
    try {
      window.sessionStorage.clear();
    } catch (error) {
      console.error('Failed to clear sessionStorage:', error);
    }
  }
};

// 下载文件
export const downloadFile = (content: string, filename: string, contentType: string = 'text/plain'): void => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// 读取文件内容
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target?.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsText(file);
  });
};

// 颜色工具
export const colors = {
  // 根据值生成颜色（红绿渐变）
  getValueColor: (value: number, min: number = -100, max: number = 100): string => {
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const red = Math.floor(255 * (1 - normalized));
    const green = Math.floor(255 * normalized);
    return `rgb(${red}, ${green}, 0)`;
  },
  
  // 根据百分比生成颜色
  getPercentageColor: (percentage: number): string => {
    if (percentage > 0) {
      return 'text-green-500';
    } else if (percentage < 0) {
      return 'text-red-500';
    } else {
      return 'text-gray-500';
    }
  },
  
  // 根据状态生成颜色
  getStatusColor: (status: string): string => {
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'active':
        return 'text-green-500';
      case 'error':
      case 'failed':
      case 'inactive':
        return 'text-red-500';
      case 'warning':
      case 'pending':
        return 'text-yellow-500';
      case 'info':
      case 'processing':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  }
};

// 数组工具
export const arrays = {
  // 数组去重
  unique: <T>(array: T[]): T[] => {
    return [...new Set(array)];
  },
  
  // 数组分组
  groupBy: <T, K extends keyof T>(array: T[], key: K): Record<string, T[]> => {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  },
  
  // 数组排序
  sortBy: <T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] => {
    return [...array].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  },
  
  // 数组分页
  paginate: <T>(array: T[], page: number, pageSize: number): T[] => {
    const startIndex = (page - 1) * pageSize;
    return array.slice(startIndex, startIndex + pageSize);
  }
};

// 对象工具
export const objects = {
  // 深度克隆
  deepClone: <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  },
  
  // 对象合并
  merge: <T extends Record<string, any>>(...objects: Partial<T>[]): T => {
    return Object.assign({}, ...objects) as T;
  },
  
  // 选择对象属性
  pick: <T extends Record<string, any>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Pick<T, K> => {
    const result = {} as Pick<T, K>;
    keys.forEach(key => {
      if (key in obj) {
        result[key] = obj[key];
      }
    });
    return result;
  },
  
  // 排除对象属性
  omit: <T extends Record<string, any>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Omit<T, K> => {
    const result = { ...obj };
    keys.forEach(key => {
      delete result[key];
    });
    return result;
  }
};

// 导出所有工具
export * from './solana';
export * from './pump';