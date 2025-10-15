import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, Wifi, WifiOff } from 'lucide-react';
import { checkApiHealth, getApiHealthStatus, startHealthMonitoring, stopHealthMonitoring, ApiHealthStatus } from '../utils/heliusApi';

interface ApiHealthIndicatorProps {
  className?: string;
}

const ApiHealthIndicator: React.FC<ApiHealthIndicatorProps> = ({ className = '' }) => {
  const [healthStatus, setHealthStatus] = useState<ApiHealthStatus>({
    isHealthy: true,
    latency: 0,
    lastCheck: 0,
    retryCount: 0
  });
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // 启动健康监控
    startHealthMonitoring();
    
    // 定期更新状态显示
    const updateInterval = setInterval(() => {
      const currentStatus = getApiHealthStatus();
      setHealthStatus(currentStatus);
    }, 1000);

    return () => {
      clearInterval(updateInterval);
      stopHealthMonitoring();
    };
  }, []);

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const status = await checkApiHealth();
      setHealthStatus(status);
    } catch (error) {
      console.error('手动健康检查失败:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusColor = () => {
    if (isChecking) return 'text-yellow-500';
    return healthStatus.isHealthy ? 'text-green-500' : 'text-red-500';
  };

  const getStatusIcon = () => {
    if (isChecking) return <Clock className="w-4 h-4 animate-spin" />;
    if (healthStatus.isHealthy) return <CheckCircle className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (isChecking) return '检查中...';
    if (healthStatus.isHealthy) return 'API正常';
    return 'API异常';
  };

  const formatLatency = (latency: number) => {
    if (latency === 0) return 'N/A';
    return `${latency}ms`;
  };

  const formatLastCheck = (timestamp: number) => {
    if (timestamp === 0) return 'N/A';
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {healthStatus.isHealthy ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-500" />
          )}
          <h3 className="text-sm font-medium text-gray-900">API状态</h3>
        </div>
        <button
          onClick={handleManualCheck}
          disabled={isChecking}
          className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isChecking ? '检查中...' : '手动检查'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={getStatusColor()}>
              {getStatusIcon()}
            </div>
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            延迟: {formatLatency(healthStatus.latency)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>上次检查: {formatLastCheck(healthStatus.lastCheck)}</span>
          {healthStatus.retryCount > 0 && (
            <span className="text-orange-500">
              重试次数: {healthStatus.retryCount}
            </span>
          )}
        </div>

        {healthStatus.error && (
          <div className="mt-2 p-2 bg-red-50 rounded-md">
            <p className="text-xs text-red-600">
              错误: {healthStatus.error}
            </p>
          </div>
        )}

        {!healthStatus.isHealthy && (
          <div className="mt-2 p-2 bg-yellow-50 rounded-md">
            <p className="text-xs text-yellow-700">
              💡 API连接异常，可能影响数据获取。请检查网络连接或稍后重试。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiHealthIndicator;