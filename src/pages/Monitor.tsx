import React, { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, Activity, AlertTriangle, Search, Clock, Database, Users, TrendingDown, DollarSign, Zap, FileText, Shield, BarChart3, Target, Eye, AlertCircle } from 'lucide-react';
import LargeOrderMonitor from '../components/LargeOrderMonitor';
import VolumeAnalysis from '../components/VolumeAnalysis';
import AnomalyAlert from '../components/AnomalyAlert';
import ApiHealthIndicator from '../components/ApiHealthIndicator';
import ErrorBoundary from '../components/ErrorBoundary';

import { 
  collectMonitorData, 
  type MonitorData,
  type TokenInfo,
  type HolderAnalysis,
  type PriorityFeeData,
  type TokenMetadata
} from '../utils/heliusApi';
import { holderChangeStorage, type HolderData, type HolderChange } from '../utils/holderChangeStorage';

const Monitor: React.FC = () => {
  const [tokenAddress, setTokenAddress] = useState('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [holderChanges, setHolderChanges] = useState<Map<string, HolderChange>>(new Map());
  const [activeTab, setActiveTab] = useState<'overview' | 'large-orders' | 'volume' | 'alerts'>('overview');

  // 获取代币数据
  const fetchTokenData = async (address: string = tokenAddress) => {
    if (!address) return;
    
    console.log(`🔍 开始获取代币数据: ${address}`);
    setLoading(true);
    setError(null);
    
    // 清空旧数据和缓存
    setMonitorData(null);
    setLastUpdate(null);
    
    // 清除可能的浏览器缓存
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('🗑️ 已清除浏览器缓存');
      } catch (cacheError) {
        console.log('⚠️ 清除缓存失败:', cacheError);
      }
    }
    
    try {
      const data = await collectMonitorData(address);
      
      // 处理持仓变化数据
      if (data.holderAnalysis && data.holderAnalysis.topHolders) {
        const currentHolders: HolderData[] = data.holderAnalysis.topHolders.map(holder => ({
          address: holder.address,
          balance: holder.balance,
          percentage: holder.percentage,
          rank: holder.rank
        }));
        
        // 计算变化
        const changes = holderChangeStorage.calculateChanges(address, currentHolders);
        setHolderChanges(changes);
        
        // 保存当前数据
        holderChangeStorage.saveSnapshot(address, currentHolders);
      }
      
      setMonitorData(data);
      setLastUpdate(new Date());
      console.log(`✅ 代币数据获取成功:`, data);
    } catch (err) {
      console.error('❌ 获取代币数据失败:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
      // 清空数据
      setMonitorData(null);
      setLastUpdate(null);
    } finally {
      setLoading(false);
    }
  };

  // 处理地址输入
  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenAddress.trim()) {
      fetchTokenData(tokenAddress.trim());
    }
  };

  // 格式化数字
  const formatNumber = (num: number, decimals: number = 2): string => {
    if (num >= 1e9) return (num / 1e9).toFixed(decimals) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(decimals) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(decimals) + 'K';
    return num.toFixed(decimals);
  };

  // 格式化地址
  const formatAddress = (address: string): string => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 初始加载
  useEffect(() => {
    fetchTokenData();
  }, []);

  return (
    <ErrorBoundary componentName="代币监控系统">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="text-blue-600" />
            代币监控系统
          </h1>
          
          {/* 搜索表单 */}
          <form onSubmit={handleAddressSubmit} className="flex gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="输入代币地址 (例如: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              <Search size={20} />
              {loading ? '查询中...' : '查询'}
            </button>
            <button
              type="button"
              onClick={() => fetchTokenData(tokenAddress)}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              {loading ? '刷新中...' : '刷新'}
            </button>
          </form>
          
          {lastUpdate && (
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Clock size={16} />
              最后更新: {lastUpdate.toLocaleString('zh-CN')}
            </p>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
            <AlertTriangle className="text-red-600" size={20} />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* API健康状态指示器 */}
        <div className="mb-6">
          <ApiHealthIndicator />
        </div>

        {/* 全局加载状态指示器 */}
        {loading && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span>正在获取代币数据，请稍候...</span>
          </div>
        )}

        {/* 监控数据 */}
        {monitorData && !loading && (
          <>
            {/* 功能选项卡 */}
            <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'overview'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    概览监控
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('large-orders')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'large-orders'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    大单监控
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('volume')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'volume'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    交易量分析
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('alerts')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'alerts'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    异常预警
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {/* 概览监控 */}
              {activeTab === 'overview' && (
                <>
            {/* API健康状态 */}
            <ApiHealthIndicator className="mb-6" />
            
            {/* 基础信息卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Activity size={20} />
                  代币信息
                </h3>
                <p className="text-2xl font-bold text-blue-600">
                  {monitorData.tokenMetadata?.symbol || monitorData.tokenInfo.symbol || 'Unknown'}
                </p>
                <p className="text-gray-600">
                  {monitorData.tokenMetadata?.name || monitorData.tokenInfo.name || 'Unknown Token'}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  地址: {formatAddress(monitorData.tokenInfo.address)}
                </p>
              </div>
              
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Database size={20} />
                  供应量
                </h3>
                <p className="text-2xl font-bold text-purple-600">
                  {formatNumber(monitorData.tokenInfo.totalSupply)}
                </p>
                <p className="text-sm text-gray-600">总供应量</p>
              </div>
              
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <TrendingUp size={20} />
                  市值
                </h3>
                <p className="text-2xl font-bold text-orange-600">
                  {monitorData.priceData && monitorData.tokenInfo ? 
                    `$${formatNumber(monitorData.priceData.price * monitorData.tokenInfo.totalSupply)}` : 
                    '暂无数据'
                  }
                </p>
                <p className="text-sm text-gray-600">总市值</p>
              </div>
            </div>

            {/* RPC状态 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">RPC状态</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">状态</p>
                  <p className={`font-semibold ${
                    monitorData.rpcHealth.status === 'ok' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {monitorData.rpcHealth.status}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">响应时间</p>
                  <p className="font-semibold text-blue-600">{monitorData.rpcHealth.responseTime}ms</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">区块高度</p>
                  <p className="font-semibold text-purple-600">
                    {monitorData.rpcHealth.blockHeight.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* 前10大户持仓分析 */}
            {monitorData.holderAnalysis && monitorData.holderAnalysis.topHolders && monitorData.holderAnalysis.topHolders.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users size={20} />
                  前10大户持仓分析
                </h3>
                
                {monitorData.holderAnalysis.rpcLimited && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-2 rounded mb-4">
                    ⚠️ RPC限制，无法获取详细持仓数据
                  </div>
                )}
                
                {monitorData.holderAnalysis.estimatedFromSupply && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded mb-4">
                    ℹ️ 数据基于供应量估算
                  </div>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">排名</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">地址</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">持仓量</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">占比</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">变化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitorData.holderAnalysis.topHolders.map((holder, index) => {
                        const change = holderChanges.get(holder.address);
                        const changeDisplay = change ? holderChangeStorage.formatChange(change) : { text: '--', color: 'text-gray-400' };
                        
                        return (
                          <tr key={holder.address} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                index < 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {holder.rank}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-xs">
                              {formatAddress(holder.address)}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {formatNumber(holder.balance)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-semibold ${
                                holder.percentage > 5 ? 'text-red-600' : 
                                holder.percentage > 1 ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                {holder.percentage.toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-semibold text-xs ${changeDisplay.color}`}>
                                {changeDisplay.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* 持仓集中度统计 */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">前10持仓占比</p>
                    <p className="font-semibold text-lg text-blue-600">
                      {monitorData.holderAnalysis.concentration.top10Percentage.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">前50持仓占比</p>
                    <p className="font-semibold text-lg text-purple-600">
                      {monitorData.holderAnalysis.concentration.top50Percentage.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">巨鲸数量 (&gt;1%)</p>
                    <p className="font-semibold text-lg text-red-600">
                      {monitorData.holderAnalysis.distribution.whales}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">大户数量 (0.1%-1%)</p>
                    <p className="font-semibold text-lg text-orange-600">
                      {monitorData.holderAnalysis.distribution.large}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 最近交易 */}
            {monitorData.enhancedTransactions && monitorData.enhancedTransactions.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">最近交易记录</h3>
                <div className="space-y-4">
                  {monitorData.enhancedTransactions.slice(0, 5).map((tx, index) => (
                    <div key={tx.signature} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-gray-800">{tx.type}</span>
                        <span className="text-sm text-gray-500">
                          {new Date(tx.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <p className="text-gray-600 mb-1">{tx.description}</p>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>签名: {formatAddress(tx.signature)}</span>
                        <span>费用: {tx.fee} lamports</span>
                      </div>
                      {tx.tokenTransfers && tx.tokenTransfers.length > 0 && (
                        <p className="text-sm text-blue-600 mt-1">
                          代币转账: {tx.tokenTransfers.length} 笔
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 优先级费用 */}
            {monitorData.priorityFees && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">网络优先级费用 (lamports)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">最低</p>
                    <p className="font-semibold text-green-600">{monitorData.priorityFees.min}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">低</p>
                    <p className="font-semibold text-blue-600">{monitorData.priorityFees.low}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">中等</p>
                    <p className="font-semibold text-yellow-600">{monitorData.priorityFees.medium}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">高</p>
                    <p className="font-semibold text-orange-600">{monitorData.priorityFees.high}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">极高</p>
                    <p className="font-semibold text-red-600">{monitorData.priorityFees.veryHigh}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">最大</p>
                    <p className="font-semibold text-red-800">{monitorData.priorityFees.unsafeMax}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 代币元数据 */}
            {monitorData.tokenMetadata && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">代币元数据</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-600">名称: </span>
                        <span className="font-semibold">{monitorData.tokenMetadata.name}</span>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">符号: </span>
                        <span className="font-semibold">{monitorData.tokenMetadata.symbol}</span>
                      </div>
                      {monitorData.tokenMetadata.description && (
                        <div>
                          <span className="text-sm text-gray-600">描述: </span>
                          <p className="text-sm mt-1">
                            {monitorData.tokenMetadata.description.slice(0, 200)}
                            {monitorData.tokenMetadata.description.length > 200 ? '...' : ''}
                          </p>
                        </div>
                      )}
                      {monitorData.tokenMetadata.externalUrl && (
                        <div>
                          <span className="text-sm text-gray-600">官网: </span>
                          <a 
                            href={monitorData.tokenMetadata.externalUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {monitorData.tokenMetadata.externalUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  {monitorData.tokenMetadata.image && (
                    <div className="flex justify-center">
                      <img 
                        src={monitorData.tokenMetadata.image} 
                        alt={monitorData.tokenMetadata.name}
                        className="w-32 h-32 object-cover rounded-lg"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

                {/* 预警信息 */}
                {monitorData.alerts && monitorData.alerts.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                    <h3 className="text-xl font-semibold text-yellow-800 mb-4 flex items-center gap-2">
                      <AlertTriangle size={20} />
                      预警信息
                    </h3>
                    <ul className="space-y-2">
                      {monitorData.alerts.map((alert, index) => (
                        <li key={index} className="text-yellow-700 flex items-center gap-2">
                          <AlertTriangle size={16} />
                          {alert}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* 大单监控 */}
            {activeTab === 'large-orders' && (
              <ErrorBoundary componentName="大单监控">
                <LargeOrderMonitor tokenAddress={tokenAddress} />
              </ErrorBoundary>
            )}

            {/* 交易量分析 */}
            {activeTab === 'volume' && (
              <ErrorBoundary componentName="交易量分析">
                <VolumeAnalysis tokenAddress={tokenAddress} isActive={true} />
              </ErrorBoundary>
            )}

            {/* 异常预警 */}
            {activeTab === 'alerts' && (
              <ErrorBoundary componentName="异常预警">
                <AnomalyAlert tokenAddress={tokenAddress} isActive={true} />
              </ErrorBoundary>
            )}
          </div>
        </>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
};

export default Monitor;