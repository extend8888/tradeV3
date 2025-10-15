import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard,
  Wallet,
  TrendingUp,
  FileText,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Activity,
  Zap,
  BarChart3,
  Shield,
  Users,
  ChevronDown,
  Check
} from 'lucide-react';
import { cn } from '../utils';
import { useRPCStore } from '../stores/rpcStore';
import { useWalletStore } from '../stores/walletStore';
import { useTradeStore } from '../stores/tradeStore';
import { useLogStore } from '../stores/logStore';
import { useChainStore, type ChainType } from '../stores/chainStore';

/**
 * 导航菜单项配置
 */
const navigationItems = [
  {
    name: '健康监控',
    href: '/',
    icon: Shield,
    description: '系统状态和健康监控'
  },
  {
    name: '监控系统',
    href: '/monitor',
    icon: Activity,
    description: '代币监控和分析'
  },
  {
    name: '钱包系统',
    href: '/wallets',
    icon: Wallet,
    description: '管理钱包和余额'
  },
  {
    name: '批量交易',
    href: '/trading',
    icon: TrendingUp,
    description: '执行交易和管理订单'
  },
  {
    name: '策略交易',
    href: '/volume',
    icon: BarChart3,
    description: '自动化交易量生成'
  },
  {
    name: '日志记录',
    href: '/logs',
    icon: FileText,
    description: '查看系统日志和活动'
  },
  {
    name: '系统设置',
    href: '/settings',
    icon: Settings,
    description: '配置系统偏好设置'
  }
];

interface NavigationProps {
  className?: string;
}

/**
 * 导航组件
 * 提供侧边栏导航和状态指示器
 */
const Navigation: React.FC<NavigationProps> = ({ className }) => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false);
  const chainDropdownRef = useRef<HTMLDivElement>(null);
  
  // 状态管理
  const { isConnected, currentNode } = useRPCStore();
  const { wallets } = useWalletStore();
  const { orders } = useTradeStore();
  const { logs } = useLogStore();
  const { selectedChain, setSelectedChain, getActiveChains, getChainConfig } = useChainStore();
  
  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chainDropdownRef.current && !chainDropdownRef.current.contains(event.target as Node)) {
        setIsChainDropdownOpen(false);
      }
    };

    if (isChainDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChainDropdownOpen]);
  
  // 计算统计数据
  const stats = {
    connectedWallets: wallets.filter(w => w.solBalance !== undefined).length,
    activeOrders: orders.filter(o => o.status === 'pending' || o.status === 'executing').length,
    recentErrors: logs.filter(l => l.level === 'error' && 
      Date.now() - new Date(l.timestamp).getTime() < 3600000).length // 1小时内的错误
  };
  
  // 检查当前路径是否激活
  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };
  
  // 状态指示器组件
  const StatusIndicator: React.FC<{ 
    status: 'online' | 'offline' | 'warning' | 'error';
    label: string;
    value?: string | number;
  }> = ({ status, label, value }) => {
    const statusColors = {
      online: 'bg-green-500',
      offline: 'bg-gray-500',
      warning: 'bg-yellow-500',
      error: 'bg-red-500'
    };
    
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center space-x-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            statusColors[status]
          )} />
          <span className="text-xs text-gray-600">{label}</span>
        </div>
        {value !== undefined && (
          <span className="text-xs text-gray-900 font-medium">{value}</span>
        )}
      </div>
    );
  };
  
  // 导航内容
  const NavigationContent = () => (
    <>
      {/* Logo和标题 */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src="/Ma7424_5_200x200.jpg" alt="SocratesTrader Logo" className="w-8 h-8 object-cover rounded-lg" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold text-gray-900">SocratesTrader</h1>
              <p className="text-xs text-gray-500">v2.0</p>
            </div>
          )}
        </div>
        
        {/* 桌面端折叠按钮 */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:block p-1 text-gray-600 hover:text-gray-900 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        
        {/* 移动端关闭按钮 */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden p-1 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* 状态面板 */}
      {!isCollapsed && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center space-x-2">
            <Activity className="w-4 h-4" />
            <span>系统状态</span>
          </h3>
          
          <div className="space-y-1">
            <StatusIndicator
              status={isConnected ? 'online' : 'offline'}
              label="RPC连接"
              value={currentNode?.name || '无'}
            />
            
            <StatusIndicator
              status={stats.connectedWallets > 0 ? 'online' : 'offline'}
              label="已连接钱包"
              value={stats.connectedWallets}
            />
            
            <StatusIndicator
              status={stats.activeOrders > 0 ? 'warning' : 'online'}
              label="活跃订单"
              value={stats.activeOrders}
            />
            
            <StatusIndicator
              status={stats.recentErrors > 0 ? 'error' : 'online'}
              label="最近错误"
              value={stats.recentErrors}
            />
          </div>
        </div>
      )}
      
      {/* 链选择器 */}
      {!isCollapsed && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center space-x-2">
            <BarChart3 className="w-4 h-4" />
            <span>区块链网络</span>
          </h3>
          
          <div className="relative" ref={chainDropdownRef}>
            <button
              onClick={() => setIsChainDropdownOpen(!isChainDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getChainConfig(selectedChain).color }}
                />
                <span className="font-medium">{getChainConfig(selectedChain).displayName}</span>
                <span className="text-xs text-gray-500">({selectedChain})</span>
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-gray-400 transition-transform",
                isChainDropdownOpen && "rotate-180"
              )} />
            </button>
            
            {isChainDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                {getActiveChains().map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => {
                      setSelectedChain(chain.id);
                      setIsChainDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg",
                      selectedChain === chain.id && "bg-blue-50 text-blue-700"
                    )}
                  >
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: chain.color }}
                      />
                      <span className="font-medium">{chain.displayName}</span>
                      <span className="text-xs text-gray-500">({chain.id})</span>
                    </div>
                    {selectedChain === chain.id && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 导航菜单 */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
                  active
                    ? "bg-blue-600 text-white shadow-lg"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon className={cn(
                  "w-5 h-5 flex-shrink-0",
                  active ? "text-white" : "text-gray-600 group-hover:text-gray-900"
                )} />
                
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs opacity-75 truncate">
                      {item.description}
                    </div>
                  </div>
                )}
                
                {/* 活动指示器 */}
                {active && (
                  <div className="w-2 h-2 bg-white rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* 底部信息 */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center space-x-3 p-3 bg-gray-100 rounded-lg">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">安全模式</div>
              <div className="text-xs text-gray-500">所有数据已加密</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
  
  return (
    <>
      {/* 移动端菜单按钮 */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      
      {/* 移动端遮罩 */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
      
      {/* 侧边栏 */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200 transition-all duration-300",
        isCollapsed ? "w-16" : "w-64",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        className
      )}>
        <NavigationContent />
      </aside>
      
      {/* 快速统计浮动面板 (仅在折叠状态下显示) */}
      {isCollapsed && (
        <div className="hidden lg:block fixed left-20 top-20 z-30">
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xl">
            <div className="flex items-center space-x-2 mb-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-gray-900">快速统计</span>
            </div>
            
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between space-x-3">
                <span className="text-gray-600">RPC</span>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isConnected ? "bg-green-500" : "bg-red-500"
                )} />
              </div>
              
              <div className="flex items-center justify-between space-x-3">
                <span className="text-gray-600">钱包</span>
                <span className="text-gray-900 font-medium">{stats.connectedWallets}</span>
              </div>
              
              <div className="flex items-center justify-between space-x-3">
                <span className="text-gray-600">订单</span>
                <span className="text-gray-900 font-medium">{stats.activeOrders}</span>
              </div>
              
              {stats.recentErrors > 0 && (
                <div className="flex items-center justify-between space-x-3">
                  <span className="text-red-400">错误</span>
                  <span className="text-red-400 font-medium">{stats.recentErrors}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navigation;