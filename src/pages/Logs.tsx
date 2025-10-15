import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  AlertTriangle,
  Clock,
  Activity,
  Eye,
  EyeOff,
  RefreshCw,
  Calendar,
  Tag,
  FileText
} from 'lucide-react';
import { useLogStore } from '../stores/logStore';
import {
  formatTime,
  cn
} from '../utils';
import { LogLevel, LogEntry } from '../types';

/**
 * 日志监控页面
 * 支持实时日志显示、过滤、搜索和导出功能
 */
const Logs: React.FC = () => {
  const {
    logs,
    isAutoRefresh,
    filters,
    updateFilters,
    clearLogs,
    exportLogs,
    toggleAutoRefresh
  } = useLogStore();
  
  // 状态管理
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  
  // 获取所有模块
  const modules = useMemo(() => {
    const moduleSet = new Set(logs.map(log => log.module));
    return Array.from(moduleSet).sort();
  }, [logs]);
  
  // 过滤日志
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 搜索过滤
      if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // 级别过滤
      if (selectedLevel !== 'all' && log.level !== selectedLevel) {
        return false;
      }
      
      // 模块过滤
      if (selectedModule !== 'all' && log.module !== selectedModule) {
        return false;
      }
      
      return true;
    });
  }, [logs, searchTerm, selectedLevel, selectedModule]);
  
  // 统计信息
  const stats = useMemo(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentLogs = logs.filter(log => log.timestamp >= oneHourAgo);
    
    return {
      total: logs.length,
      filtered: filteredLogs.length,
      recent: recentLogs.length,
      byLevel: {
        error: logs.filter(log => log.level === 'error').length,
        warn: logs.filter(log => log.level === 'warn').length,
        info: logs.filter(log => log.level === 'info').length,
        success: logs.filter(log => log.level === 'success').length
      }
    };
  }, [logs, filteredLogs]);
  
  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && filteredLogs.length > 0) {
      const element = document.getElementById('logs-container');
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }
  }, [filteredLogs, autoScroll]);
  
  // 清空日志
  const handleClearLogs = () => {
    if (window.confirm('确定要清空所有日志吗？')) {
      clearLogs();
      setSelectedLogs(new Set());
    }
  };
  
  // 导出日志
  const handleExportLogs = () => {
    const logsToExport = selectedLogs.size > 0 
      ? filteredLogs.filter(log => selectedLogs.has(log.id))
      : filteredLogs;
    
    const exportData = exportLogs('json');
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // 切换日志选择
  const toggleLogSelection = (logId: string) => {
    const newSelection = new Set(selectedLogs);
    if (newSelection.has(logId)) {
      newSelection.delete(logId);
    } else {
      newSelection.add(logId);
    }
    setSelectedLogs(newSelection);
  };
  
  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedLogs.size === filteredLogs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(filteredLogs.map(log => log.id)));
    }
  };
  
  // 获取日志级别样式
  const getLevelStyle = (level: LogLevel) => {
    const styles = {
      error: 'text-red-500 bg-red-500/10 border-red-500/20',
      warning: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
      info: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      success: 'text-green-500 bg-green-500/10 border-green-500/20'
    };
    return styles[level];
  };
  
  // 获取日志级别图标
  const getLevelIcon = (level: LogLevel) => {
    const icons = {
      error: AlertCircle,
      warning: AlertTriangle,
      info: Info,
      success: CheckCircle
    };
    return icons[level];
  };
  
  // 日志行组件
  const LogRow: React.FC<{ log: LogEntry; isSelected: boolean }> = ({ log, isSelected }) => {
    const LevelIcon = getLevelIcon(log.level);
    const isExpanded = expandedLog === log.id;
    
    return (
      <div className={cn(
        "border-l-4 transition-all duration-200",
        getLevelStyle(log.level),
        isSelected ? "bg-blue-50 border-r border-r-blue-200" : "hover:bg-gray-50"
      )}>
        <div className="p-4">
          <div className="flex items-start space-x-3">
            {/* 选择框 */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleLogSelection(log.id)}
              className="mt-1 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
            />
            
            {/* 级别图标 */}
            <div className="flex-shrink-0 mt-0.5">
              <LevelIcon className={cn("w-5 h-5", log.level === 'error' ? 'text-red-500' : 
                log.level === 'warn' ? 'text-yellow-500' : 
                log.level === 'success' ? 'text-green-500' : 'text-blue-500')} />
            </div>
            
            {/* 日志内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-3">
                  <span className={cn(
                    "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                    getLevelStyle(log.level)
                  )}>
                    {log.level.toUpperCase()}
                  </span>
                  
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    <Tag className="w-3 h-3 mr-1" />
                    {log.module === 'trading' ? '交易' : log.module === 'wallet' ? '钱包' : log.module === 'system' ? '系统' : log.module}
                  </span>
                  
                  <span className="text-xs text-gray-600">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                
                <button
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              <div className="text-gray-900">
                <p className={cn(
                  "break-words",
                  !isExpanded && "line-clamp-2"
                )}>
                  {log.message}
                </p>
                
                {isExpanded && log.details && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Details:</h4>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="p-6 space-y-6 h-full flex flex-col bg-white">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">系统日志</h1>
          <p className="text-gray-600 mt-1">监控系统活动和交易操作</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className={cn(
            "flex items-center space-x-2 px-3 py-2 rounded-lg",
            isAutoRefresh ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-600"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isAutoRefresh ? "bg-green-500 animate-pulse" : "bg-gray-400"
            )} />
            <span className="text-sm font-medium">
              {isAutoRefresh ? '实时' : '暂停'}
            </span>
          </div>
          
          <button
            onClick={toggleAutoRefresh}
            className={cn(
              "px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2",
              isAutoRefresh 
                ? "bg-yellow-600 hover:bg-yellow-700 text-white" 
                : "bg-green-600 hover:bg-green-700 text-white"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", isAutoRefresh && "animate-spin")} />
            <span>{isAutoRefresh ? '暂停' : '恢复'}</span>
          </button>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">日志总数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">错误</p>
              <p className="text-2xl font-bold text-red-500">{stats.byLevel.error}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">警告</p>
              <p className="text-2xl font-bold text-yellow-500">{stats.byLevel.warn}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">成功</p>
              <p className="text-2xl font-bold text-green-500">{stats.byLevel.success}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">最近1小时</p>
              <p className="text-2xl font-bold text-blue-500">{stats.recent}</p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>
      
      {/* 搜索和过滤 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* 搜索框 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索日志..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* 过滤器 */}
          <div className="flex items-center space-x-3">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as LogLevel | 'all')}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">所有级别</option>
              <option value="error">错误</option>
              <option value="warn">警告</option>
              <option value="info">信息</option>
              <option value="success">成功</option>
            </select>
            
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">所有模块</option>
              {modules.map(module => (
                <option key={module} value={module}>{module}</option>
              ))}
            </select>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showFilters ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleSelectAll}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg text-sm font-medium transition-colors"
            >
              {selectedLogs.size === filteredLogs.length ? '取消全选' : '全选'}
            </button>
            
            <button
              onClick={handleExportLogs}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>导出</span>
            </button>
            
            <button
              onClick={handleClearLogs}
              disabled={logs.length === 0}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>清除</span>
            </button>
          </div>
        </div>
        
        {/* 高级过滤器 */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="autoScroll"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="autoScroll" className="text-sm text-gray-700">
                  自动滚动到底部
                </label>
              </div>
              
              <div className="text-sm text-gray-600">
                显示 {stats.filtered} / {stats.total} 条日志
              </div>
              
              <div className="text-sm text-gray-600">
                {selectedLogs.size} selected
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* 日志列表 */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">日志条目</h2>
        </div>
        
        <div 
          id="logs-container"
          className="flex-1 overflow-y-auto"
        >
          {filteredLogs.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <LogRow 
                  key={log.id} 
                  log={log} 
                  isSelected={selectedLogs.has(log.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600 py-12">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">
                  {logs.length === 0 ? '暂无日志' : '未找到符合条件的日志'}
                </p>
                <p className="text-sm">
                  {logs.length === 0 
                    ? '系统活动产生的日志将显示在这里' 
                    : '请尝试调整搜索或过滤条件'
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Logs;