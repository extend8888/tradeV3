import React, { useEffect, useState } from 'react';
import { Activity, Server, Wallet, TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useRPCStore } from '../stores/rpcStore';
import { useWalletStore } from '../stores/walletStore';
import { useTradeStore } from '../stores/tradeStore';
import { useLogStore } from '../stores/logStore';
import { formatNumber, formatPercentage, formatTime, cn } from '../utils';
import { RPCNode } from '../types';

/**
 * 主控制台页面
 * 显示系统概览、RPC状态监控、钱包统计等信息
 */
const Dashboard: React.FC = () => {
  const {
    nodes,
    currentNode,
    isConnected,
    connectionStatus,
    startHealthCheck,
    stopHealthCheck,
    testConnection
  } = useRPCStore();
  
  const {
    wallets,
    totalBalance,
    startBalanceMonitoring,
    stopBalanceMonitoring
  } = useWalletStore();
  
  const {
    orders,
    config: tradeConfig
  } = useTradeStore();
  
  const {
    logs,
    addLog
  } = useLogStore();
  
  const [systemStats, setSystemStats] = useState({
    totalWallets: 0,
    activeWallets: 0,
    totalOrders: 0,
    successfulOrders: 0,
    failedOrders: 0,
    totalVolume: 0
  });
  
  // 初始化监控（已禁用自动余额刷新）
  useEffect(() => {
    startHealthCheck();
    // startBalanceMonitoring(); // 已禁用自动余额刷新
    
    return () => {
      stopHealthCheck();
      stopBalanceMonitoring();
    };
  }, []);
  
  // 计算系统统计
  useEffect(() => {
    const activeWallets = wallets.filter(w => (w.solBalance || 0) > 0).length;
    const successfulOrders = orders.filter(o => o.status === 'completed').length;
    const failedOrders = orders.filter(o => o.status === 'failed').length;
    const totalVolume = orders
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + (o.amount * (o.price || 0)), 0);
    
    setSystemStats({
      totalWallets: wallets.length,
      activeWallets,
      totalOrders: orders.length,
      successfulOrders,
      failedOrders,
      totalVolume
    });
  }, [wallets, orders]);
  
  // RPC节点状态卡片
  const RPCStatusCard: React.FC<{ node: RPCNode }> = ({ node }) => {
    const isActive = currentNode?.id === node.id;
    const statusColor = node.status === 'connected' ? 'text-green-500' : 
                       node.status === 'testing' ? 'text-yellow-500' : 'text-red-500';
    const statusIcon = node.status === 'connected' ? CheckCircle : 
                      node.status === 'testing' ? Activity : XCircle;
    const StatusIcon = statusIcon;
    
    return (
      <div className={cn(
        "p-4 rounded-lg border transition-all duration-200 hover:shadow-md shadow-sm",
        isActive ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <StatusIcon className={cn("w-4 h-4", statusColor)} />
            <span className="font-medium text-gray-900">{node.name}</span>
            {isActive && (
              <span className="px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                Active
              </span>
            )}
          </div>
          <span className={cn("text-sm font-medium", statusColor)}>
            {node.status}
          </span>
        </div>
        
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Latency:</span>
            <span className={cn(
              node.latency < 100 ? "text-green-500" :
              node.latency < 300 ? "text-yellow-500" : "text-red-500"
            )}>
              {node.latency}ms
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last Check:</span>
            <span>{node.lastChecked ? formatTime(node.lastChecked) : 'Never'}</span>
          </div>
        </div>
        
        <div className="mt-3 text-xs text-gray-500 truncate">
          {node.url}
        </div>
      </div>
    );
  };
  
  // 统计卡片组件
  const StatCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
    change?: number;
  }> = ({ title, value, icon: Icon, color, change }) => (
    <div className="p-6 rounded-lg bg-white border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change !== undefined && (
            <p className={cn(
              "text-sm mt-1",
              change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-gray-500"
            )}>
              {change > 0 ? '+' : ''}{formatPercentage(change)}
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-full", color)}>
          <Icon className={cn(
            "w-6 h-6",
            color.includes("blue") ? "text-blue-600" :
            color.includes("green") ? "text-green-600" :
            color.includes("purple") ? "text-purple-600" :
            color.includes("emerald") ? "text-emerald-600" : "text-gray-600"
          )} />
        </div>
      </div>
    </div>
  );
  
  // 最近日志组件
  const RecentLogs: React.FC = () => {
    const recentLogs = logs.slice(-5).reverse();
    
    return (
      <div className="space-y-2">
        {recentLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            暂无最近日志
          </div>
        ) : (
          recentLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 border border-gray-200"
            >
              <div className={cn(
                "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                log.level === 'error' ? "bg-red-500" :
                log.level === 'warn' ? "bg-yellow-500" :
                log.level === 'success' ? "bg-green-500" : "bg-blue-500"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {log.category}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 break-words">
                  {log.message}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };
  
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">健康监控</h1>
          <p className="text-gray-600 mt-1">系统状态和健康监控</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={cn(
            "flex items-center space-x-2 px-3 py-2 rounded-lg",
            isConnected ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-red-500"
            )} />
            <span className="text-sm font-medium">
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="钱包总数"
          value={systemStats.totalWallets}
          icon={Wallet}
          color="bg-blue-50"
        />
        <StatCard
          title="活跃钱包"
          value={systemStats.activeWallets}
          icon={Activity}
          color="bg-green-50"
        />
        <StatCard
          title="总余额"
          value={`${formatNumber(totalBalance)} SOL`}
          icon={TrendingUp}
          color="bg-purple-50"
        />
        <StatCard
          title="成功率"
          value={systemStats.totalOrders > 0 ? 
            formatPercentage((systemStats.successfulOrders / systemStats.totalOrders) * 100) : '0%'
          }
          icon={CheckCircle}
          color="bg-emerald-50"
        />
      </div>
      
      {/* 主要内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* RPC节点状态 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Server className="w-5 h-5 mr-2 text-gray-700" />
                RPC节点状态
              </h2>
              <button
                onClick={() => currentNode && testConnection(currentNode.id)}
                disabled={!currentNode}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                测试连接
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nodes.map((node) => (
                <RPCStatusCard key={node.id} node={node} />
              ))}
            </div>
            
            {nodes.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>未配置RPC节点</p>
                <p className="text-sm mt-1">添加RPC节点以开始监控</p>
              </div>
            )}
          </div>
        </div>
        
        {/* 最近日志 */}
        <div>
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center mb-6">
              <AlertCircle className="w-5 h-5 mr-2 text-gray-700" />
              最近日志
            </h2>
            <RecentLogs />
          </div>
        </div>
      </div>
      
      {/* 交易统计 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center mb-6">
          <TrendingUp className="w-5 h-5 mr-2 text-gray-700" />
          交易统计
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {systemStats.totalOrders}
            </div>
            <div className="text-gray-600">总订单数</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {systemStats.successfulOrders}
            </div>
            <div className="text-gray-600">成功</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600 mb-2">
              {systemStats.failedOrders}
            </div>
            <div className="text-gray-600">失败</div>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">总交易量:</span>
            <span className="text-xl font-semibold text-gray-900">
              {formatNumber(systemStats.totalVolume)} SOL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;