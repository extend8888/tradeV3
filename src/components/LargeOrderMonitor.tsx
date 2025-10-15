import React, { useState, useEffect, useRef } from 'react';
import { Target, TrendingUp, TrendingDown, AlertTriangle, Volume2, Clock, ExternalLink, Play, Pause, Settings } from 'lucide-react';
import { getEnhancedTransactions, type EnhancedTransaction } from '@/utils/heliusApi';

// 大单交易接口
interface LargeOrder {
  id: string;
  signature: string;
  type: 'BUY' | 'SELL';
  amount: number;
  amountUSD: number;
  tokenSymbol: string;
  timestamp: number;
  fromAddress: string;
  toAddress: string;
  price: number;
  alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// 监控配置接口
interface MonitorConfig {
  minAmountUSD: number;
  minTokenAmount: number;
  enableSound: boolean;
  enableNotification: boolean;
  refreshInterval: number;
}

// 默认配置
const DEFAULT_CONFIG: MonitorConfig = {
  minAmountUSD: 10000,
  minTokenAmount: 1000,
  enableSound: true,
  enableNotification: true,
  refreshInterval: 5000
};

interface LargeOrderMonitorProps {
  tokenAddress: string;
}

const LargeOrderMonitor: React.FC<LargeOrderMonitorProps> = ({
  tokenAddress
}) => {
  const [largeOrders, setLargeOrders] = useState<LargeOrder[]>([]);
  const [config, setConfig] = useState<MonitorConfig>(DEFAULT_CONFIG);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalBuyVolume, setTotalBuyVolume] = useState(0);
  const [totalSellVolume, setTotalSellVolume] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSignatureRef = useRef<string>('');

  // 初始化音频
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
  }, []);

  // 播放提示音
  const playAlert = () => {
    if (config.enableSound && audioRef.current) {
      audioRef.current.play().catch(console.error);
    }
  };

  // 发送通知
  const sendNotification = (order: LargeOrder) => {
    if (config.enableNotification && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(`大单${order.type === 'BUY' ? '买入' : '卖出'}预警`, {
          body: `${order.tokenSymbol}: $${order.amountUSD.toLocaleString()} (${order.amount.toLocaleString()} tokens)`,
          icon: '/favicon.ico'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  };

  // 分析交易类型和金额
  const analyzeTransaction = (tx: EnhancedTransaction): LargeOrder | null => {
    if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) return null;

    // 查找与目标代币相关的转账
    const relevantTransfer = tx.tokenTransfers.find(transfer => 
      transfer.mint === tokenAddress
    );

    if (!relevantTransfer) return null;

    const tokenAmount = relevantTransfer.tokenAmount;
    const currentPrice = 0.001; // 默认价格，实际应该从props或API获取
    const amountUSD = tokenAmount * currentPrice;

    // 检查是否满足监控条件
    if (amountUSD < config.minAmountUSD && tokenAmount < config.minTokenAmount) {
      return null;
    }

    // 判断交易类型（简化逻辑）
    const type: 'BUY' | 'SELL' = tx.description.toLowerCase().includes('buy') || 
                                 tx.description.toLowerCase().includes('swap') ? 'BUY' : 'SELL';

    // 确定预警级别
    let alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (amountUSD >= 100000) alertLevel = 'CRITICAL';
    else if (amountUSD >= 50000) alertLevel = 'HIGH';
    else if (amountUSD >= 25000) alertLevel = 'MEDIUM';

    return {
      id: tx.signature,
      signature: tx.signature,
      type,
      amount: tokenAmount,
      amountUSD,
      tokenSymbol: 'TOKEN', // 默认符号，实际应该从API获取
      timestamp: tx.timestamp,
      fromAddress: relevantTransfer.fromUserAccount,
      toAddress: relevantTransfer.toUserAccount,
      price: currentPrice,
      alertLevel
    };
  };

  // 获取大单交易
  const fetchLargeOrders = async () => {
    if (!tokenAddress || !isMonitoring) return;

    setLoading(true);
    try {
      const transactions = await getEnhancedTransactions(tokenAddress, 50);
      const newOrders: LargeOrder[] = [];
      let buyVolume = 0;
      let sellVolume = 0;

      for (const tx of transactions) {
        const order = analyzeTransaction(tx);
        if (order) {
          // 避免重复添加
          if (order.signature !== lastSignatureRef.current && 
              !largeOrders.some(existing => existing.signature === order.signature)) {
            newOrders.push(order);
            
            // 触发预警
            if (order.alertLevel === 'HIGH' || order.alertLevel === 'CRITICAL') {
              playAlert();
              sendNotification(order);
            }
          }

          // 统计交易量
          if (order.type === 'BUY') {
            buyVolume += order.amountUSD;
          } else {
            sellVolume += order.amountUSD;
          }
        }
      }

      if (newOrders.length > 0) {
        setLargeOrders(prev => [...newOrders, ...prev].slice(0, 100)); // 保留最新100条
        lastSignatureRef.current = newOrders[0].signature;
      }

      setTotalBuyVolume(buyVolume);
      setTotalSellVolume(sellVolume);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('获取大单交易失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 开始/停止监控
  const toggleMonitoring = () => {
    if (isMonitoring) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsMonitoring(false);
    } else {
      setIsMonitoring(true);
      fetchLargeOrders(); // 立即获取一次
      intervalRef.current = setInterval(fetchLargeOrders, config.refreshInterval);
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 更新配置时重启监控
  useEffect(() => {
    if (isMonitoring && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchLargeOrders, config.refreshInterval);
    }
  }, [config.refreshInterval]);

  // 格式化地址
  const formatAddress = (address: string): string => {
    if (!address || address.length <= 10) return address || 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  // 获取预警级别颜色
  const getAlertColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* 监控控制面板 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">大单监控</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">监控阈值 (USD)</label>
            <input
              type="number"
              value={config.minAmountUSD}
              onChange={(e) => setConfig(prev => ({ ...prev, minAmountUSD: Number(e.target.value) }))}
              placeholder="最小金额"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">刷新间隔 (秒)</label>
            <input
              type="number"
              value={config.refreshInterval / 1000}
              onChange={(e) => setConfig(prev => ({ ...prev, refreshInterval: Number(e.target.value) * 1000 }))}
              placeholder="刷新间隔"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={toggleMonitoring}
              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                isMonitoring 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isMonitoring ? (
                <><Pause className="w-4 h-4" />停止监控</>
              ) : (
                <><Play className="w-4 h-4" />开始监控</>
              )}
            </button>
          </div>
        </div>
        
        {/* 监控状态 */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-sm font-medium text-gray-700">
              {isMonitoring ? '监控中...' : '未监控'}
            </span>
          </div>
          <span className="text-sm text-gray-500">
            已检测到 {largeOrders.length} 笔大单
          </span>
        </div>
      </div>

      {/* 大单列表 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Volume2 className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-800">大单交易记录</h3>
        </div>
        
        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{largeOrders.length}</div>
            <div className="text-sm text-blue-600">总大单数</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {largeOrders.filter(order => order.type === 'BUY').length}
            </div>
            <div className="text-sm text-green-600">买入订单</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {largeOrders.filter(order => order.type === 'SELL').length}
            </div>
            <div className="text-sm text-red-600">卖出订单</div>
          </div>
        </div>

        {/* 状态信息 */}
        {lastUpdate && (
          <div className="text-sm text-gray-500 mb-4">
            最后更新: {lastUpdate.toLocaleString('zh-CN')}
            {loading && <span className="ml-2">🔄 更新中...</span>}
          </div>
        )}

        {/* 大单列表 */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {largeOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无大单交易记录</p>
              <p className="text-sm">当检测到符合条件的大额交易时，将在此显示</p>
            </div>
          ) : (
            largeOrders.map((order) => (
              <div key={order.signature} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      order.type === 'BUY' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {order.type === 'BUY' ? '买入' : '卖出'}
                    </span>
                    <span className="font-medium">${formatNumber(order.amountUSD)}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(order.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">代币数量:</span>
                    <span className="ml-2 font-medium">{formatNumber(order.amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">价格:</span>
                    <span className="ml-2 font-medium">${order.price.toFixed(6)}</span>
                  </div>
                </div>
                
                <div className="mt-2 text-xs text-gray-500">
                  <span>钱包: {formatAddress(order.fromAddress)}</span>
                  <a 
                    href={`https://solscan.io/tx/${order.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 text-blue-600 hover:underline flex items-center gap-1"
                  >
                    查看交易 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LargeOrderMonitor;