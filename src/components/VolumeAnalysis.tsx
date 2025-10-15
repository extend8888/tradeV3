import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Activity, Clock, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { getEnhancedTransactions } from '../utils/heliusApi';

interface VolumeData {
  timestamp: number;
  volume: number;
  transactionCount: number;
  averageSize: number;
}

interface VolumeTrend {
  period: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

interface VolumeAnalysisProps {
  tokenAddress: string;
  isActive: boolean;
}

const VolumeAnalysis: React.FC<VolumeAnalysisProps> = ({ tokenAddress, isActive }) => {
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);
  const [volumeTrends, setVolumeTrends] = useState<VolumeTrend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [dataStats, setDataStats] = useState<{
    totalFetched: number;
    validTransactions: number;
    timeRange: { start: Date | null; end: Date | null };
  }>({ totalFetched: 0, validTransactions: 0, timeRange: { start: null, end: null } });

  // 时间段配置
  const timePeriods = [
    { key: '1h', label: '1小时', minutes: 60 },
    { key: '4h', label: '4小时', minutes: 240 },
    { key: '24h', label: '24小时', minutes: 1440 }
  ];

  // 获取交易量数据
  const fetchVolumeData = async () => {
    if (!tokenAddress || loading) {
      console.log('⏸️  跳过数据获取:', { tokenAddress, loading });
      return;
    }

    console.log('🚀 开始获取交易量数据，代币地址:', tokenAddress);
    setLoading(true);
    setError(null);

    try {
      console.log('📡 调用 getEnhancedTransactions...');
      const transactions = await getEnhancedTransactions(tokenAddress, 100);
      console.log('✅ 获取到交易数据:', transactions?.length || 0, '笔');
      
      // 保存原始交易数据
      setRawTransactions(transactions || []);
      
      if (!transactions || transactions.length === 0) {
        console.warn('⚠️  没有获取到交易数据');
        setVolumeData([]);
        setVolumeTrends([]);
        setDataStats({ totalFetched: 0, validTransactions: 0, timeRange: { start: null, end: null } });
        setError('暂无交易数据');
        return;
      }
      
      // 计算数据统计
      const validTxs = transactions.filter(tx => tx.timestamp > 0);
      const timestamps = validTxs.map(tx => tx.timestamp).sort((a, b) => a - b);
      setDataStats({
        totalFetched: transactions.length,
        validTransactions: validTxs.length,
        timeRange: {
          start: timestamps.length > 0 ? new Date(timestamps[0]) : null,
          end: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]) : null
        }
      });

      // 按小时分组统计交易量
      const hourlyData = processTransactionData(transactions);
      console.log('📊 处理后的数据:', hourlyData);
      setVolumeData(hourlyData);

      // 计算趋势数据
      const trends = calculateVolumeTrends(hourlyData);
      console.log('📈 计算的趋势:', trends);
      setVolumeTrends(trends);

      setLastUpdate(new Date());
    } catch (err) {
      console.error('❌ 获取交易量数据失败:', err);
      setError(`获取交易量数据失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 处理交易数据
  const processTransactionData = (transactions: any[]): VolumeData[] => {
    console.log('🔍 处理交易数据:', transactions.length, '笔交易');
    
    const now = Date.now();
    const hourlyMap = new Map<number, { volume: number; count: number; totalAmount: number }>();

    transactions.forEach((tx, index) => {
      if (!tx.timestamp) {
        console.log(`⚠️  交易 ${index} 缺少时间戳:`, tx);
        return;
      }

      const txTime = tx.timestamp * 1000;
      const hourKey = Math.floor(txTime / (60 * 60 * 1000)) * (60 * 60 * 1000);

      // 暂时注释掉时间过滤，因为API返回的时间戳可能有问题
      // if (now - txTime > 24 * 60 * 60 * 1000) return;
      
      // 调试：检查时间戳是否合理
      if (index < 3) {
        console.log(`⏰ 交易 ${index} 时间检查:`, {
          交易时间: new Date(txTime).toLocaleString(),
          当前时间: new Date(now).toLocaleString(),
          时间差小时: Math.abs(now - txTime) / (60 * 60 * 1000),
          是否未来时间: txTime > now
        });
      }

      const existing = hourlyMap.get(hourKey) || { volume: 0, count: 0, totalAmount: 0 };
      
      // 计算交易金额（多种方式尝试）
      let amount = 0;
      
      // 调试：打印交易结构
      if (index < 3) {
        console.log(`🔍 交易 ${index} 结构:`, {
          nativeTransfers: tx.nativeTransfers,
          tokenTransfers: tx.tokenTransfers,
          accountData: tx.accountData,
          signature: tx.signature
        });
        
        // 详细打印tokenTransfers结构
        if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
          console.log(`💰 交易 ${index} tokenTransfers详情:`, tx.tokenTransfers[0]);
        }
      }
      
      // 尝试从不同字段获取交易金额
      if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
        amount = Math.abs(tx.nativeTransfers[0].amount || 0) / 1e9; // SOL转换
      } else if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        const tokenTransfer = tx.tokenTransfers[0];
        // 尝试多个可能的金额字段
        amount = Math.abs(
          tokenTransfer.tokenAmount || 
          tokenTransfer.amount || 
          tokenTransfer.uiTokenAmount?.uiAmount ||
          tokenTransfer.rawAmount ||
          0
        );
        
        // 如果有decimals信息，进行转换
        const decimals = tokenTransfer.decimals || tokenTransfer.uiTokenAmount?.decimals || 6;
        if (amount > 0 && decimals) {
          amount = amount / Math.pow(10, decimals);
        }
        
        if (index < 3) {
          console.log(`💰 交易 ${index} 金额计算:`, {
            原始金额: tokenTransfer.tokenAmount || tokenTransfer.amount,
            UI金额: tokenTransfer.uiTokenAmount?.uiAmount,
            小数位: decimals,
            最终金额: amount
          });
        }
      } else if (tx.accountData && tx.accountData.length > 0) {
        amount = Math.abs(tx.accountData[0].nativeBalanceChange || 0) / 1e9; // SOL转换
      } else {
        // 使用固定值作为占位符
        amount = 1;
      }
      
      existing.volume += amount;
      existing.count += 1;
      existing.totalAmount += amount;
      
      if (index < 3) {
        console.log(`📈 交易 ${index} 添加到时间段:`, {
          时间戳: new Date(txTime).toLocaleString(),
          小时键: new Date(hourKey).toLocaleString(),
          金额: amount,
          累计交易量: existing.volume,
          交易数量: existing.count
        });
      }
      
      hourlyMap.set(hourKey, existing);
    });

    console.log('📊 按小时分组结果:', hourlyMap.size, '个时间段');
    
    // 转换为数组并排序
    const result = Array.from(hourlyMap.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        volume: data.volume,
        transactionCount: data.count,
        averageSize: data.count > 0 ? data.totalAmount / data.count : 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
      
    console.log('✅ 处理完成，生成数据:', result.length, '个时间段');
    return result;
  };

  // 计算交易量趋势
  const calculateVolumeTrends = (data: VolumeData[]): VolumeTrend[] => {
    console.log('🧮 开始计算趋势，数据点数量:', data.length);
    
    if (data.length === 0) {
      console.log('⚠️  没有交易数据，返回空趋势');
      return timePeriods.map(period => ({
        period: period.label,
        current: 0,
        previous: 0,
        change: 0,
        changePercent: 0,
        trend: 'stable' as const
      }));
    }
    
    // 检查数据时间戳是否异常（未来时间）
    const now = Date.now();
    const hasAbnormalTimestamps = data.some(d => d.timestamp > now + 24 * 60 * 60 * 1000);
    
    if (hasAbnormalTimestamps) {
      console.log('⚠️  检测到异常时间戳，使用相对时间计算趋势');
      
      // 对数据按时间戳排序
      const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
      
      return timePeriods.map(period => {
        const periodHours = period.minutes / 60;
        const totalHours = sortedData.length;
        
        // 计算当前周期和上一周期的数据点数量
        const currentPeriodSize = Math.min(Math.ceil(totalHours * 0.4), Math.ceil(periodHours));
        const previousPeriodSize = Math.min(Math.ceil(totalHours * 0.3), Math.ceil(periodHours));
        
        // 取最新的数据作为当前周期
        const currentData = sortedData.slice(-currentPeriodSize);
        // 取倒数第二段数据作为上一周期
        const previousData = sortedData.slice(-(currentPeriodSize + previousPeriodSize), -currentPeriodSize);
        
        const currentVolume = currentData.reduce((sum, d) => sum + d.volume, 0);
      const previousVolume = previousData.reduce((sum, d) => sum + d.volume, 0);
      
      const change = currentVolume - previousVolume;
      
      // 修复百分比计算逻辑，避免异常数值
      let changePercent = 0;
      if (previousVolume === 0 && currentVolume === 0) {
        changePercent = 0; // 都为0，无变化
      } else if (previousVolume === 0) {
        changePercent = currentVolume > 0 ? 100 : 0; // 从0开始，最大显示100%
      } else if (currentVolume === 0) {
        changePercent = -100; // 降到0，显示-100%
      } else {
        const rawPercent = (change / previousVolume) * 100;
        // 限制百分比在合理范围内，避免几万%的异常显示
        changePercent = Math.max(-99.9, Math.min(999.9, rawPercent));
      }
        
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (Math.abs(changePercent) > 5) {
          trend = changePercent > 0 ? 'up' : 'down';
        }

        const result = {
          period: period.label,
          current: currentVolume,
          previous: previousVolume,
          change,
          changePercent,
          trend
        };
        
        console.log(`📈 ${period.label} 相对趋势计算:`, {
          ...result,
          currentDataPoints: currentData.length,
          previousDataPoints: previousData.length
        });
        return result;
      });
    }
    
    // 正常的时间戳处理逻辑
    return timePeriods.map(period => {
      const periodMs = period.minutes * 60 * 1000;
      const currentPeriodStart = now - periodMs;
      const previousPeriodStart = now - (periodMs * 2);

      console.log(`⏰ ${period.label} 时间范围:`, {
        currentStart: new Date(currentPeriodStart).toLocaleString(),
        previousStart: new Date(previousPeriodStart).toLocaleString(),
        now: new Date(now).toLocaleString()
      });

      // 当前周期数据
      const currentData = data.filter(d => 
        d.timestamp >= currentPeriodStart && d.timestamp <= now
      );
      
      // 上一周期数据
      const previousData = data.filter(d => 
        d.timestamp >= previousPeriodStart && d.timestamp < currentPeriodStart
      );

      console.log(`📊 ${period.label} 数据点:`, {
        current: currentData.length,
        previous: previousData.length
      });

      const currentVolume = currentData.reduce((sum, d) => sum + d.volume, 0);
      const previousVolume = previousData.reduce((sum, d) => sum + d.volume, 0);
      
      const change = currentVolume - previousVolume;
      
      // 修复百分比计算逻辑，避免异常数值
      let changePercent = 0;
      if (previousVolume === 0 && currentVolume === 0) {
        changePercent = 0; // 都为0，无变化
      } else if (previousVolume === 0) {
        changePercent = currentVolume > 0 ? 100 : 0; // 从0开始，最大显示100%
      } else if (currentVolume === 0) {
        changePercent = -100; // 降到0，显示-100%
      } else {
        const rawPercent = (change / previousVolume) * 100;
        // 限制百分比在合理范围内，避免几万%的异常显示
        changePercent = Math.max(-99.9, Math.min(999.9, rawPercent));
      }
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(changePercent) > 5) {
        trend = changePercent > 0 ? 'up' : 'down';
      }

      const result = {
        period: period.label,
        current: currentVolume,
        previous: previousVolume,
        change,
        changePercent,
        trend
      };
      
      console.log(`📈 ${period.label} 计算结果:`, result);
      return result;
    });
  };

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  // 格式化百分比，添加合理性说明
  const formatPercentage = (percent: number): { display: string; explanation: string } => {
    const absPercent = Math.abs(percent);
    let display = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
    let explanation = '';
    
    if (absPercent === 0) {
      explanation = '无变化';
    } else if (absPercent === 100 && percent > 0) {
      explanation = '从零开始有交易';
    } else if (absPercent === 100 && percent < 0) {
      explanation = '交易量降至零';
    } else if (absPercent >= 999) {
      display = `${percent >= 0 ? '+' : ''}999%+`;
      explanation = '极大幅度变化';
    } else if (absPercent >= 500) {
      explanation = '异常大幅变化';
    } else if (absPercent >= 100) {
      explanation = '大幅变化';
    } else if (absPercent >= 50) {
      explanation = '显著变化';
    } else if (absPercent >= 20) {
      explanation = '中等变化';
    } else {
      explanation = '小幅变化';
    }
    
    return { display, explanation };
  };

  // 获取趋势颜色
  const getTrendColor = (trend: 'up' | 'down' | 'stable'): string => {
    switch (trend) {
      case 'up': return 'text-green-400';
      case 'down': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  // 获取趋势图标
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4" />;
      case 'down': return <TrendingDown className="w-4 h-4" />;
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  // 检测异常波动
  const detectAnomalies = (): { level: 'normal' | 'warning' | 'critical'; message: string } => {
    const significantChanges = volumeTrends.filter(t => Math.abs(t.changePercent) > 50);
    
    if (significantChanges.length >= 2) {
      return { level: 'critical', message: '检测到多个时间段交易量剧烈波动' };
    }
    
    if (significantChanges.length === 1) {
      return { level: 'warning', message: '检测到交易量异常波动' };
    }
    
    return { level: 'normal', message: '交易量正常' };
  };

  useEffect(() => {
    if (isActive && tokenAddress) {
      fetchVolumeData();
      
      // 每30秒更新一次
      const interval = setInterval(fetchVolumeData, 30000);
      return () => clearInterval(interval);
    }
  }, [tokenAddress, isActive]);

  if (!isActive || !tokenAddress) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">交易量趋势分析</h3>
        </div>
        <p className="text-gray-600">监控已暂停</p>
      </div>
    );
  }

  const anomaly = detectAnomalies();

  return (
    <div className="space-y-6">
      {/* 交易量趋势分析 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">交易量趋势分析</h3>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowOrderDetails(!showOrderDetails)}
            className="flex items-center space-x-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span>订单详情</span>
            {showOrderDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button 
            onClick={fetchVolumeData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 数据统计信息 */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">获取交易数:</span>
            <span className="ml-2 text-gray-800 font-medium">{dataStats.totalFetched}</span>
          </div>
          <div>
            <span className="text-gray-600">有效交易数:</span>
            <span className="ml-2 text-gray-800 font-medium">{dataStats.validTransactions}</span>
          </div>
          <div>
            <span className="text-gray-600">时间范围:</span>
            <span className="ml-2 text-gray-800 font-medium">
              {dataStats.timeRange.start && dataStats.timeRange.end
                ? `${Math.round((dataStats.timeRange.end.getTime() - dataStats.timeRange.start.getTime()) / (1000 * 60 * 60))}小时`
                : '无数据'
              }
            </span>
          </div>
          <div>
            <span className="text-gray-600">数据质量:</span>
            <span className={`ml-2 font-medium ${
              dataStats.validTransactions > 50 ? 'text-green-600' :
              dataStats.validTransactions > 20 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {dataStats.validTransactions > 50 ? '优秀' :
               dataStats.validTransactions > 20 ? '良好' : '较少'}
            </span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto"></div>
          <p className="text-gray-400 mt-2">分析交易量数据...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && volumeTrends.length > 0 && (
        <div className="space-y-4">
          {/* 异常检测提示 */}
          {anomaly.level !== 'normal' && (
            <div className={`border rounded-lg p-3 ${
              anomaly.level === 'critical' 
                ? 'bg-red-50 border-red-200' 
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 ${
                  anomaly.level === 'critical' ? 'text-red-600' : 'text-yellow-600'
                }`} />
                <span className={anomaly.level === 'critical' ? 'text-red-800' : 'text-yellow-800'}>
                  {anomaly.message}
                </span>
              </div>
            </div>
          )}

          {/* 趋势数据 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {volumeTrends.map((trend, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-700 font-medium">{trend.period}</span>
                  <div className={`flex items-center gap-1 ${getTrendColor(trend.trend)}`}>
                    {getTrendIcon(trend.trend)}
                    <span className="text-sm font-medium">
                      {formatPercentage(trend.changePercent).display}
                    </span>
                  </div>
                </div>
                
                {/* 添加百分比解释说明 */}
                <div className="mb-2">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {formatPercentage(trend.changePercent).explanation}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">当前:</span>
                    <span className="text-gray-800">{formatNumber(trend.current)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">上期:</span>
                    <span className="text-gray-700">{formatNumber(trend.previous)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">变化:</span>
                    <span className={getTrendColor(trend.trend)}>
                      {trend.change > 0 ? '+' : ''}{formatNumber(trend.change)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 数据统计 */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">24小时统计</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400 block">总交易量</span>
                <span className="text-white font-medium">
                  {formatNumber(volumeData.reduce((sum, d) => sum + d.volume, 0))}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">交易笔数</span>
                <span className="text-white font-medium">
                  {volumeData.reduce((sum, d) => sum + d.transactionCount, 0)}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">平均交易额</span>
                <span className="text-white font-medium">
                  {formatNumber(
                    volumeData.length > 0 
                      ? volumeData.reduce((sum, d) => sum + d.averageSize, 0) / volumeData.length 
                      : 0
                  )}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">活跃小时数</span>
                <span className="text-white font-medium">
                  {volumeData.filter(d => d.transactionCount > 0).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* 订单详情面板 */}
      {showOrderDetails && (
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-white">交易订单详情</h4>
            <span className="text-sm text-gray-400">
              显示最近 {Math.min(rawTransactions.length, 100)} 笔交易
            </span>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {rawTransactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无交易数据</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rawTransactions.slice(0, 100).map((tx, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-3 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div>
                        <span className="text-gray-400">时间:</span>
                        <span className="ml-2 text-white">
                          {tx.timestamp > 0 
                            ? new Date(tx.timestamp).toLocaleString()
                            : '无效时间'
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">类型:</span>
                        <span className={`ml-2 font-medium ${
                          tx.type === 'buy' ? 'text-green-400' : 
                          tx.type === 'sell' ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          {tx.type === 'buy' ? '买入' : tx.type === 'sell' ? '卖出' : '其他'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">金额:</span>
                        <span className="ml-2 text-white">
                          {tx.amount ? `${tx.amount.toLocaleString()} SOL` : '未知'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">签名:</span>
                        <span className="ml-2 text-blue-400 font-mono text-xs">
                          {tx.signature ? `${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}` : '无'}
                        </span>
                      </div>
                    </div>
                    {tx.description && (
                      <div className="mt-2 pt-2 border-t border-gray-600">
                        <span className="text-gray-400">描述:</span>
                        <span className="ml-2 text-gray-300 text-xs">{tx.description}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {rawTransactions.length > 100 && (
            <div className="mt-4 text-center text-sm text-gray-400">
              显示前100笔交易，共 {rawTransactions.length} 笔
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VolumeAnalysis;