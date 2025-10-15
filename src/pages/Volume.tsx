import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useVolumeStore } from '@/stores/volumeStore';
import { useWalletStore } from '@/stores/walletStore';
import { useLogStore } from '@/stores/logStore';
import { VolumeConfig } from '@/types/volume';
import { cn, formatNumber } from '@/utils';
import { Play, Pause, Square, Settings, TrendingUp, Wallet, Clock, DollarSign, ExternalLink, RefreshCw } from 'lucide-react';

// 格式化时间显示函数
const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分`;
  }
};

const Volume: React.FC = () => {
  const {
    config,
    currentSession,
    orders,
    stats,
    isRunning,
    nextOrderTime,
    selectedWalletId,
    updateConfig,
    setSelectedWallet,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
    refreshData,
    clearOrders
  } = useVolumeStore();

  // 调试：监听订单状态变化
  useEffect(() => {
    console.log('订单列表更新:', orders.map(order => ({
      id: order.id,
      status: order.status,
      type: order.type,
      amount: order.amount,
      createdAt: order.createdAt
    })));
  }, [orders]);

  const { wallets, tokenBalances, updateBalance, updateTokenBalances, updateBatchBalances } = useWalletStore();
  const { addLog } = useLogStore();
  const activeWallets = wallets.filter(w => w.isActive);

  const [countdown, setCountdown] = useState(0);
  
  // 自动选择第一个活跃钱包
  useEffect(() => {
    if (activeWallets.length > 0 && !selectedWalletId) {
      setSelectedWallet(activeWallets[0].id);
    }
  }, [activeWallets, selectedWalletId, setSelectedWallet]);

  // 获取选中的钱包
  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  // 初始化时更新SOL余额和数据
  useEffect(() => {
    const initializeData = async () => {
      try {
        // 使用更高效的批量更新方法
        await updateBatchBalances();
        refreshData();
      } catch (error) {
        console.error('初始化SOL余额更新失败:', error);
        refreshData(); // 即使余额更新失败也要刷新其他数据
      }
    };
    
    initializeData();
  }, [updateBatchBalances, refreshData]);

  // 实时更新倒计时和数据
  useEffect(() => {
    let balanceUpdateCounter = 0;
    
    const interval = setInterval(async () => {
      if (nextOrderTime && isRunning) {
        const remaining = Math.max(0, Math.floor((new Date(nextOrderTime).getTime() - Date.now()) / 1000));
        setCountdown(remaining);
      } else {
        setCountdown(0);
      }
      
      // 每秒刷新数据以更新统计信息
      refreshData();
      
      // 每10秒更新一次SOL余额（避免过于频繁的网络请求）
      balanceUpdateCounter++;
      if (balanceUpdateCounter >= 10) {
        balanceUpdateCounter = 0;
        try {
          await updateBatchBalances();
        } catch (error) {
          console.error('定期SOL余额更新失败:', error);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [nextOrderTime, isRunning, refreshData, updateBatchBalances]);

  const handleConfigChange = (key: keyof VolumeConfig, value: any) => {
    updateConfig({ [key]: value });
    
    // 当代币地址变化时，更新代币余额
    if (key === 'tokenAddress' && value && value.trim()) {
      updateTokenBalances(value.trim());
    }
  };

  const getSessionStatus = () => {
    if (!currentSession) return { text: '未启动', color: 'secondary' };
    if (currentSession.status === 'running') return { text: '运行中', color: 'success' };
    if (currentSession.status === 'paused') return { text: '已暂停', color: 'warning' };
    if (currentSession.status === 'stopped') return { text: '已停止', color: 'secondary' };
    return { text: '未知', color: 'secondary' };
  };

  const status = getSessionStatus();

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">策略交易</h1>
        <div className="flex items-center space-x-2">
          <Badge variant={isRunning ? "default" : "secondary"}>
            {isRunning ? "运行中" : "已停止"}
          </Badge>
          {nextOrderTime && isRunning && (
            <Badge variant="secondary">
              下次执行: {countdown}s
            </Badge>
          )}
        </div>
      </div>

      {/* 余额信息面板 */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="grid grid-cols-4 gap-4">
          {/* SOL账户数量 */}
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {activeWallets.length}
            </div>
            <div className="text-sm text-gray-500">SOL账户数量</div>
          </div>

          {/* SOL总余额 */}
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {activeWallets.reduce((sum, wallet) => sum + (wallet.solBalance || 0), 0).toFixed(4)} SOL
            </div>
            <div className="text-sm text-gray-500">SOL余额</div>
          </div>

          {/* 代币余额 */}
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {config.tokenAddress && tokenBalances.length > 0
                ? tokenBalances
                    .filter(tb => tb.tokenAddress === config.tokenAddress)
                    .reduce((sum, tb) => sum + tb.balance, 0)
                    .toFixed(2)
                : '0'
              }
            </div>
            <div className="text-sm text-gray-500">代币余额</div>
          </div>

          {/* 余额刷新按钮 */}
          <div className="text-center">
            <Button
              onClick={async () => {
                try {
                  // 同时更新SOL余额和代币余额
                  await updateBatchBalances();
                  if (config.tokenAddress) {
                    await updateTokenBalances(config.tokenAddress);
                  }
                  addLog({
                    level: 'success',
                    category: 'wallet',
                    message: '余额刷新成功'
                  });
                } catch (error) {
                  console.error('余额刷新失败:', error);
                  addLog({
                    level: 'error',
                    category: 'wallet',
                    message: '余额刷新失败'
                  });
                }
              }}
              variant="outline"
              size="sm"
              className="w-full h-12 flex flex-col items-center justify-center space-y-1"
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-xs">刷新余额</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 快速状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm text-gray-600">总订单数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm text-gray-600">成功率</p>
              <p className="text-2xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-sm text-gray-600">总交易量</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalVolume.toFixed(4)} SOL</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-sm text-gray-600">运行时间</p>
              <p className="text-2xl font-bold text-gray-900">{formatDuration(stats.runningTime)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 基础配置、控制面板和订单列表 - 三列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 基础配置 */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-2 mb-6">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">基础配置</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-600">代币地址</label>
              <input
                type="text"
                value={config.tokenAddress}
                onChange={(e) => handleConfigChange('tokenAddress', e.target.value)}
                placeholder="输入代币地址"
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 策略选择和目标价 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">策略选择</label>
                <select
                  id="strategy"
                  value={config.strategy}
                  onChange={(e) => handleConfigChange('strategy', e.target.value as 'sideways' | 'bullish' | 'bearish')}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="sideways">横盘震荡</option>
                  <option value="bullish">目标拉升</option>
                  <option value="bearish">目标下跌</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">目标价 (USD)</label>
                <input
                  type="number"
                  step="0.000001"
                  value={config.targetPrice || ''}
                  onChange={(e) => handleConfigChange('targetPrice', parseFloat(e.target.value) || undefined)}
                  placeholder="可选，达到后自动停止"
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500">可选填，设置代币的美元目标价格，达到后自动停止策略交易</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">最小金额 (SOL)</label>
                <input
                  type="number"
                  step="0.001"
                  value={config.minAmount}
                  onChange={(e) => handleConfigChange('minAmount', parseFloat(e.target.value) || 0)}
                  placeholder="0.001"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">最大金额 (SOL)</label>
                <input
                  type="number"
                  step="0.001"
                  value={config.maxAmount}
                  onChange={(e) => handleConfigChange('maxAmount', parseFloat(e.target.value) || 0)}
                  placeholder="0.1"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">最小间隔 (秒)</label>
                <input
                  type="number"
                  value={config.minInterval}
                  onChange={(e) => handleConfigChange('minInterval', parseInt(e.target.value) || 0)}
                  placeholder="5"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">最大间隔 (秒)</label>
                <input
                  type="number"
                  value={config.maxInterval}
                  onChange={(e) => handleConfigChange('maxInterval', parseInt(e.target.value) || 0)}
                  placeholder="30"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">滑点 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.slippage}
                  onChange={(e) => handleConfigChange('slippage', parseFloat(e.target.value) || 0)}
                  placeholder="1.0"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">优先费用 (SOL)</label>
                <input
                  type="number"
                  step="0.00001"
                  value={config.priorityFee}
                  onChange={(e) => handleConfigChange('priorityFee', parseFloat(e.target.value) || 0)}
                  placeholder="0.00001"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={config.enabled}
                onCheckedChange={(checked) => handleConfigChange('enabled', checked)}
              />
              <Label htmlFor="enabled">启用策略交易</Label>
            </div>

            {/* 高级设置 */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center space-x-2">
                <h3 className="text-md font-medium text-gray-900">钱包轮换设置</h3>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="enableWalletRotation"
                  checked={config.enableWalletRotation}
                  onCheckedChange={(checked) => handleConfigChange('enableWalletRotation', checked)}
                />
                <Label htmlFor="enableWalletRotation">启用钱包轮换</Label>
              </div>

              {config.enableWalletRotation && (
                <div className="space-y-4 pl-6 border-l-2 border-blue-100">
                  <div className="space-y-2">
                    <Label htmlFor="walletRotationMode">轮换模式</Label>
                    <select
                      id="walletRotationMode"
                      value={config.walletRotationMode}
                      onChange={(e) => handleConfigChange('walletRotationMode', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="sequential">顺序轮换</option>
                      <option value="random">随机轮换</option>
                      <option value="weighted">权重轮换</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="rotationInterval">轮换间隔 (笔)</Label>
                      <Input
                        id="rotationInterval"
                        type="number"
                        min="1"
                        value={config.rotationInterval}
                        onChange={(e) => handleConfigChange('rotationInterval', parseInt(e.target.value) || 1)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="minWalletBalance">最小余额 (SOL)</Label>
                      <Input
                        id="minWalletBalance"
                        type="number"
                        step="0.001"
                        value={config.minWalletBalance}
                        onChange={(e) => handleConfigChange('minWalletBalance', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="excludeRecentWallets"
                      checked={config.excludeRecentWallets}
                      onCheckedChange={(checked) => handleConfigChange('excludeRecentWallets', checked)}
                    />
                    <Label htmlFor="excludeRecentWallets">排除最近使用的钱包</Label>
                  </div>

                  {config.excludeRecentWallets && (
                    <div className="space-y-2 pl-6">
                      <Label htmlFor="recentWalletCooldown">钱包冷却时间 (分钟)</Label>
                      <Input
                        id="recentWalletCooldown"
                        type="number"
                        min="1"
                        value={config.recentWalletCooldown}
                        onChange={(e) => handleConfigChange('recentWalletCooldown', parseInt(e.target.value) || 1)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* 控制面板 */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-2 mb-6">
            <Play className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">控制面板</h2>
          </div>
          <div className="space-y-4">
            {/* 钱包选择器 */}
            {activeWallets.length > 0 ? (
              <div className="space-y-3">
                <Label htmlFor="wallet-select" className="text-sm font-medium text-gray-700">
                  选择刷量钱包
                </Label>
                <div className="space-y-3">
                  <select
                    id="wallet-select"
                    value={selectedWalletId}
                    onChange={(e) => setSelectedWallet(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {activeWallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.label || `${wallet.address.slice(0, 8)}...`} - {(wallet.solBalance || 0).toFixed(4)} SOL
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* 选中钱包的详细信息 */}
                {selectedWallet && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Wallet className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-gray-900">
                          {selectedWallet.label || '未命名钱包'}
                        </span>
                      </div>
                      <div className="text-lg font-semibold text-gray-900">
                        {(selectedWallet.solBalance || 0).toFixed(4)} SOL
                      </div>
                      <div className="text-xs text-gray-500 break-all">
                        {selectedWallet.address}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  没有可用的活跃钱包。请先在钱包管理页面添加并激活钱包。
                </AlertDescription>
              </Alert>
            )}

            {!config.tokenAddress && (
              <Alert>
                <AlertDescription>
                  请先输入代币地址。
                </AlertDescription>
              </Alert>
            )}

            {!config.enabled && (
              <Alert>
                <AlertDescription>
                  策略交易已禁用。请启用后再开始会话。
                </AlertDescription>
              </Alert>
            )}

            {/* 控制按钮 */}
            <div className="space-y-2">
              {!isRunning ? (
                <button
                  onClick={startSession} 
                  disabled={!config.enabled || !config.tokenAddress || !selectedWallet}
                  className={cn(
                    "w-full px-4 py-2 rounded-lg flex items-center justify-center space-x-2 font-medium transition-colors",
                    !config.enabled || !config.tokenAddress || !selectedWallet
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                  )}
                >
                  <Play className="w-4 h-4" />
                  <span>开始交易</span>
                </button>
              ) : (
                <div className="space-y-2">
                  {currentSession?.status === 'paused' ? (
                    <button
                      onClick={resumeSession} 
                      className="w-full px-4 py-2 rounded-lg flex items-center justify-center space-x-2 font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      <Play className="w-4 h-4" />
                      <span>恢复</span>
                    </button>
                  ) : (
                    <button
                      onClick={pauseSession} 
                      className="w-full px-4 py-2 rounded-lg flex items-center justify-center space-x-2 font-medium transition-colors bg-yellow-600 hover:bg-yellow-700 text-white shadow-sm"
                    >
                      <Pause className="w-4 h-4" />
                      <span>暂停</span>
                    </button>
                  )}
                  <button
                    onClick={stopSession} 
                    className="w-full px-4 py-2 rounded-lg flex items-center justify-center space-x-2 font-medium transition-colors bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  >
                    <Square className="w-4 h-4" />
                    <span>停止</span>
                  </button>
                </div>
              )}
            </div>

            {/* 会话信息 */}
            {currentSession && (
              <div className="space-y-2 pt-4 border-t">
                <h4 className="font-medium">当前会话信息</h4>
                <div className="text-sm space-y-1">
                  <p>状态: <Badge variant={status.color as any}>{status.text}</Badge></p>
                  <p>开始时间: {new Date(currentSession.startTime).toLocaleString()}</p>
                   <p>代币: {currentSession.config.tokenAddress}</p>
                   <p>已执行订单: {currentSession.totalTrades}</p>
                   <p>总成交量: {currentSession.totalVolume.toFixed(4)} SOL</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 订单列表 */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">订单列表</h2>
            <button
              onClick={clearOrders}
              disabled={orders.length === 0}
              className={`px-3 py-1 text-sm rounded-md ${
                orders.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              清空订单
            </button>
          </div>

          <div className="mb-4 text-sm text-gray-500 flex items-center space-x-4">
            <span>待执行: {orders.filter(o => o.status === 'pending').length}</span>
            <span>执行中: {orders.filter(o => o.status === 'executing').length}</span>
            <span>完成: {orders.filter(o => o.status === 'completed').length}</span>
            <span>失败: {orders.filter(o => o.status === 'failed').length}</span>
          </div>

          <div className="min-h-[1000px]">
            {orders.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-2">
                  <Clock className="w-8 h-8 mx-auto" />
                </div>
                <p className="text-gray-500 text-sm">暂无订单</p>
                {!isRunning && (
                  <p className="text-xs text-gray-400 mt-2">
                    点击"开始交易"按钮开始生成订单
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[950px] overflow-y-auto">
                {orders.map((order, index) => (
                  <div key={order.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                          {index + 1}
                        </div>
                        <Badge variant={order.type === 'buy' ? 'default' : 'secondary'}>
                          {order.type === 'buy' ? '买入' : '卖出'}
                        </Badge>
                      </div>
                      <Badge 
                        variant={
                          order.status === 'pending' ? 'outline' :
                          order.status === 'executing' ? 'secondary' :
                          order.status === 'completed' ? 'default' : 'destructive'
                        }
                      >
                        {order.status === 'pending' ? '待执行' :
                         order.status === 'executing' ? '执行中' :
                         order.status === 'completed' ? '已完成' : '失败'}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div className="font-medium">{formatNumber(order.amount)} SOL</div>
                      {order.txHash && (
                        <a
                          href={`https://solscan.io/tx/${order.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center space-x-1 mt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="text-xs">查看交易</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Volume;