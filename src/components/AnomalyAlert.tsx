import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Settings, Bell, BellOff, Shield, Volume2, Users, Clock } from 'lucide-react';
import { getPriceData, getEnhancedTransactions, analyzeHolders, getTokenInfo, type PriceData as HeliusPriceData } from '../utils/heliusApi';

interface AlertLevel {
  level: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

interface AnomalyAlert {
  id: string;
  type: 'price' | 'volume' | 'holder' | 'transaction';
  level: AlertLevel['level'];
  title: string;
  message: string;
  timestamp: number;
  data?: any;
}

interface PriceData {
  current: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
}

interface VolumeData {
  current: number;
  average: number;
  changePercent: number;
}

interface AnomalyAlertProps {
  tokenAddress: string;
  isActive: boolean;
}

const AnomalyAlert: React.FC<AnomalyAlertProps> = ({ tokenAddress, isActive }) => {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [volumeData, setVolumeData] = useState<VolumeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 预警级别配置
  const alertLevels: Record<AlertLevel['level'], AlertLevel> = {
    low: {
      level: 'low',
      color: 'text-blue-400',
      bgColor: 'bg-blue-900/20 border-blue-500',
      icon: <Shield className="w-4 h-4" />
    },
    medium: {
      level: 'medium',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900/20 border-yellow-500',
      icon: <AlertTriangle className="w-4 h-4" />
    },
    high: {
      level: 'high',
      color: 'text-orange-400',
      bgColor: 'bg-orange-900/20 border-orange-500',
      icon: <AlertTriangle className="w-4 h-4" />
    },
    critical: {
      level: 'critical',
      color: 'text-red-400',
      bgColor: 'bg-red-900/20 border-red-500',
      icon: <AlertTriangle className="w-4 h-4" />
    }
  };

  // 异常检测阈值配置
  const thresholds = {
    price: {
      low: 10,      // 10%价格波动
      medium: 25,   // 25%价格波动
      high: 50,     // 50%价格波动
      critical: 80  // 80%价格波动
    },
    volume: {
      low: 50,      // 50%交易量变化
      medium: 100,  // 100%交易量变化
      high: 200,    // 200%交易量变化
      critical: 500 // 500%交易量变化
    },
    holder: {
      low: 5,       // 5%持仓变化
      medium: 10,   // 10%持仓变化
      high: 20,     // 20%持仓变化
      critical: 30  // 30%持仓变化
    }
  };

  // 获取异常检测数据
  const fetchAnomalyData = async () => {
    if (!tokenAddress || !isActive) return;

    setLoading(true);

    try {
      // 先获取代币信息
      const tokenInfo = await getTokenInfo(tokenAddress);
      
      // 并行获取价格、交易和持仓数据
      const [priceResult, transactionResult, holderResult] = await Promise.allSettled([
        getPriceData(tokenAddress),
        getEnhancedTransactions(tokenAddress, 200),
        analyzeHolders(tokenInfo, tokenAddress)
      ]);

      // 处理价格数据
      if (priceResult.status === 'fulfilled' && priceResult.value) {
        const price = priceResult.value;
        const priceInfo: PriceData = {
          current: price.price || 0,
          change24h: price.priceChange24h || 0,
          changePercent24h: price.priceChange24h || 0,
          high24h: price.price || 0, // HeliusPriceData 没有 high24h
          low24h: price.price || 0  // HeliusPriceData 没有 low24h
        };
        setPriceData(priceInfo);

        // 检测价格异常
        detectPriceAnomalies(priceInfo);
      }

      // 处理交易量数据
      if (transactionResult.status === 'fulfilled' && transactionResult.value) {
        const transactions = transactionResult.value;
        const volumeInfo = analyzeVolumeData(transactions);
        setVolumeData(volumeInfo);
        
        // 检测交易量异常
        detectVolumeAnomalies(volumeInfo);
        
        // 检测交易异常
        detectTransactionAnomalies(transactions);
      }

      // 处理持仓数据
      if (holderResult.status === 'fulfilled' && holderResult.value) {
        const holders = holderResult.value;
        
        // 检测持仓异常
        detectHolderAnomalies(holders);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('获取异常检测数据失败:', error);
      addAlert({
        type: 'transaction',
        level: 'medium',
        title: '数据获取异常',
        message: '无法获取完整的监控数据，请检查网络连接',
        data: { error: error instanceof Error ? error.message : '未知错误' }
      });
    } finally {
      setLoading(false);
    }
  };

  // 分析交易量数据
  const analyzeVolumeData = (transactions: any[]): VolumeData => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // 最近1小时交易量
    const recentVolume = transactions
      .filter(tx => tx.timestamp * 1000 > oneHourAgo)
      .reduce((sum, tx) => sum + (tx.nativeTransfers?.[0]?.amount || 0), 0);

    // 24小时平均每小时交易量
    const dayVolume = transactions
      .filter(tx => tx.timestamp * 1000 > oneDayAgo)
      .reduce((sum, tx) => sum + (tx.nativeTransfers?.[0]?.amount || 0), 0);
    
    const averageHourlyVolume = dayVolume / 24;
    const changePercent = averageHourlyVolume > 0 
      ? ((recentVolume - averageHourlyVolume) / averageHourlyVolume) * 100 
      : 0;

    return {
      current: recentVolume,
      average: averageHourlyVolume,
      changePercent
    };
  };

  // 检测价格异常
  const detectPriceAnomalies = (price: PriceData) => {
    const absChangePercent = Math.abs(price.changePercent24h);
    
    if (absChangePercent >= thresholds.price.critical) {
      addAlert({
        type: 'price',
        level: 'critical',
        title: '价格剧烈波动',
        message: `24小时价格变化${price.changePercent24h > 0 ? '+' : ''}${price.changePercent24h.toFixed(2)}%`,
        data: price
      });
    } else if (absChangePercent >= thresholds.price.high) {
      addAlert({
        type: 'price',
        level: 'high',
        title: '价格大幅波动',
        message: `24小时价格变化${price.changePercent24h > 0 ? '+' : ''}${price.changePercent24h.toFixed(2)}%`,
        data: price
      });
    } else if (absChangePercent >= thresholds.price.medium) {
      addAlert({
        type: 'price',
        level: 'medium',
        title: '价格异常波动',
        message: `24小时价格变化${price.changePercent24h > 0 ? '+' : ''}${price.changePercent24h.toFixed(2)}%`,
        data: price
      });
    }

    // 检测价格突破
    const priceRange = price.high24h - price.low24h;
    const currentPosition = (price.current - price.low24h) / priceRange;
    
    if (currentPosition >= 0.95) {
      addAlert({
        type: 'price',
        level: 'medium',
        title: '接近24小时最高价',
        message: `当前价格接近24小时最高价 $${price.high24h.toFixed(6)}`,
        data: price
      });
    } else if (currentPosition <= 0.05) {
      addAlert({
        type: 'price',
        level: 'medium',
        title: '接近24小时最低价',
        message: `当前价格接近24小时最低价 $${price.low24h.toFixed(6)}`,
        data: price
      });
    }
  };

  // 检测交易量异常
  const detectVolumeAnomalies = (volume: VolumeData) => {
    const absChangePercent = Math.abs(volume.changePercent);
    
    if (absChangePercent >= thresholds.volume.critical) {
      addAlert({
        type: 'volume',
        level: 'critical',
        title: '交易量剧烈变化',
        message: `交易量${volume.changePercent > 0 ? '激增' : '骤降'}${absChangePercent.toFixed(0)}%`,
        data: volume
      });
    } else if (absChangePercent >= thresholds.volume.high) {
      addAlert({
        type: 'volume',
        level: 'high',
        title: '交易量大幅变化',
        message: `交易量${volume.changePercent > 0 ? '增长' : '下降'}${absChangePercent.toFixed(0)}%`,
        data: volume
      });
    } else if (absChangePercent >= thresholds.volume.medium) {
      addAlert({
        type: 'volume',
        level: 'medium',
        title: '交易量异常变化',
        message: `交易量${volume.changePercent > 0 ? '增长' : '下降'}${absChangePercent.toFixed(0)}%`,
        data: volume
      });
    }
  };

  // 检测交易异常
  const detectTransactionAnomalies = (transactions: any[]) => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // 检测短时间内大量交易
    const recentTransactions = transactions.filter(tx => tx.timestamp * 1000 > fiveMinutesAgo);
    
    if (recentTransactions.length >= 20) {
      addAlert({
        type: 'transaction',
        level: 'high',
        title: '交易频率异常',
        message: `5分钟内检测到${recentTransactions.length}笔交易`,
        data: { count: recentTransactions.length, timeframe: '5分钟' }
      });
    }

    // 检测大额交易集中
    const largeTransactions = transactions.filter(tx => {
      const amount = tx.nativeTransfers?.[0]?.amount || 0;
      return amount > 1000000000; // 1 SOL
    });

    if (largeTransactions.length >= 3) {
      addAlert({
        type: 'transaction',
        level: 'medium',
        title: '大额交易集中',
        message: `检测到${largeTransactions.length}笔大额交易`,
        data: { count: largeTransactions.length }
      });
    }
  };

  // 检测持仓异常
  const detectHolderAnomalies = (holderData: any) => {
    if (!holderData || !holderData.topHolders) return;

    const { topHolders, concentration } = holderData;
    
    // 检测持仓集中度
    if (concentration && concentration.top10Percent > 90) {
      addAlert({
        type: 'holder',
        level: 'high',
        title: '持仓高度集中',
        message: `前10大户持仓占比${concentration.top10Percent.toFixed(1)}%`,
        data: concentration
      });
    }

    // 检测大户异常活动（基于持仓变化）
    const significantChanges = topHolders.filter((holder: any) => {
      return holder.change && Math.abs(holder.change.percentage) > 20;
    });

    if (significantChanges.length >= 2) {
      addAlert({
        type: 'holder',
        level: 'medium',
        title: '大户异常活动',
        message: `${significantChanges.length}个大户持仓发生显著变化`,
        data: { count: significantChanges.length }
      });
    }
  };

  // 添加预警
  const addAlert = (alertData: Omit<AnomalyAlert, 'id' | 'timestamp'>) => {
    const newAlert: AnomalyAlert = {
      ...alertData,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    setAlerts(prev => {
      // 避免重复预警（相同类型和级别的预警在5分钟内只显示一次）
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const isDuplicate = prev.some(alert => 
        alert.type === newAlert.type && 
        alert.level === newAlert.level && 
        alert.timestamp > fiveMinutesAgo
      );

      if (isDuplicate) return prev;

      // 播放提示音
      if (soundEnabled && (newAlert.level === 'high' || newAlert.level === 'critical')) {
        playAlertSound();
      }

      // 保持最新的20条预警
      const updated = [newAlert, ...prev].slice(0, 20);
      return updated;
    });
  };

  // 播放提示音
  const playAlertSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmHgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (error) {
      // 忽略音频播放错误
    }
  };

  // 清除预警
  const clearAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  // 清除所有预警
  const clearAllAlerts = () => {
    setAlerts([]);
  };

  // 格式化时间
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 获取类型图标
  const getTypeIcon = (type: AnomalyAlert['type']) => {
    switch (type) {
      case 'price': return <TrendingUp className="w-4 h-4" />;
      case 'volume': return <Volume2 className="w-4 h-4" />;
      case 'holder': return <Users className="w-4 h-4" />;
      case 'transaction': return <Clock className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  useEffect(() => {
    if (isActive && tokenAddress) {
      fetchAnomalyData();
      
      // 每15秒检测一次异常
      const interval = setInterval(fetchAnomalyData, 15000);
      return () => clearInterval(interval);
    }
  }, [tokenAddress, isActive]);

  if (!isActive || !tokenAddress) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-white">异常交易预警</h3>
        </div>
        <p className="text-gray-400">监控已暂停</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 异常交易预警系统 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-800">异常交易预警系统</h3>
          </div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm ${
              soundEnabled 
                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {soundEnabled ? '预警开启' : '预警关闭'}
          </button>
        </div>
        
        {/* 预警统计 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">总预警数</span>
              <AlertTriangle className="w-4 h-4 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {alerts.length}
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-red-700 text-sm">严重预警</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600">
              {alerts.filter(a => a.level === 'critical').length}
            </div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-yellow-700 text-sm">高级预警</span>
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="text-2xl font-bold text-yellow-600">
              {alerts.filter(a => a.level === 'high').length}
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-700 text-sm">中等预警</span>
              <AlertTriangle className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {alerts.filter(a => a.level === 'medium').length}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg transition-colors ${
              soundEnabled 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-600 text-gray-300'
            }`}
            title={soundEnabled ? '关闭提示音' : '开启提示音'}
          >
            <Bell className="w-4 h-4" />
          </button>
          {alerts.length > 0 && (
            <button
              onClick={clearAllAlerts}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
            >
              清除全部
            </button>
          )}
          {lastUpdate && (
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <Clock className="w-4 h-4" />
              {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto"></div>
          <p className="text-gray-400 mt-2">检测异常交易...</p>
        </div>
      )}

      {/* 当前状态概览 */}
      {!loading && (priceData || volumeData) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {priceData && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                价格监控
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">当前价格:</span>
                  <span className="text-white">${priceData.current.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h变化:</span>
                  <span className={priceData.changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {priceData.changePercent24h > 0 ? '+' : ''}{priceData.changePercent24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {volumeData && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                交易量监控
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">当前交易量:</span>
                  <span className="text-white">{(volumeData.current / 1e9).toFixed(2)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">变化幅度:</span>
                  <span className={volumeData.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {volumeData.changePercent > 0 ? '+' : ''}{volumeData.changePercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 预警列表 */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无异常预警</p>
            <p className="text-sm">系统正在监控中，发现异常时将及时提醒</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`border-l-4 rounded-lg p-4 bg-white shadow-sm ${
                alert.level === 'critical' 
                  ? 'border-red-500' 
                  : alert.level === 'high'
                  ? 'border-yellow-500'
                  : 'border-blue-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    alert.level === 'critical' 
                      ? 'bg-red-100 text-red-800' 
                      : alert.level === 'high'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {alert.level === 'critical' ? '严重' : 
                     alert.level === 'high' ? '高级' : '中等'}
                  </span>
                  <span className="font-medium text-gray-800">{alert.type}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <p className="text-gray-700 mb-3">{alert.message}</p>
              
              <button
                onClick={() => clearAlert(alert.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors float-right"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AnomalyAlert;