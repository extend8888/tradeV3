import React, { useState, useRef, useEffect } from 'react';
import { 
  Wallet, 
  Plus, 
  Upload, 
  Download, 
  Search, 
  Filter, 
  RefreshCw, 
  Trash2, 
  Eye, 
  EyeOff,
  Copy,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign
} from 'lucide-react';
import { useWalletStore } from '../stores/walletStore';
import { useLogStore } from '../stores/logStore';
import { 
  formatNumber, 
  formatPercentage, 
  truncateAddress, 
  copyToClipboard, 
  downloadFile, 
  readFileAsText,
  cn 
} from '../utils';


/**
 * 钱包管理页面
 * 支持批量导入、余额监控、筛选统计等功能
 */
const Wallets: React.FC = () => {
  const {
    wallets,
    stats,
    importWallet,
    removeWallet,
    updateBalance,
    startBalanceMonitoring,
    stopBalanceMonitoring,
    updateAllBalances,
    setAllTestBalances
  } = useWalletStore();
  
  const { addLog } = useLogStore();
  
  // 状态管理
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'empty'>('all');
  const [sortBy, setSortBy] = useState<'balance' | 'address' | 'name'>('balance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showPrivateKeys, setShowPrivateKeys] = useState(false);
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [newWalletForm, setNewWalletForm] = useState({
    name: '',
    privateKey: ''
  });
  const [batchImportText, setBatchImportText] = useState('');
  const [importMode, setImportMode] = useState<'single' | 'batch' | 'kms'>('single');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 过滤和排序钱包
  const filteredWallets = wallets
    .filter(wallet => {
      // 搜索过滤
      const matchesSearch = 
        (wallet.label || wallet.address).toLowerCase().includes(searchTerm.toLowerCase()) ||
        wallet.address.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 类型过滤
      const matchesFilter = 
        filterType === 'all' ||
        (filterType === 'active' && (wallet.solBalance || 0) > 0) ||
        (filterType === 'empty' && (wallet.solBalance || 0) === 0);
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortBy) {
        case 'balance':
          aVal = a.balance;
          bVal = b.balance;
          break;
        case 'address':
          aVal = a.address;
          bVal = b.address;
          break;
        case 'name':
          aVal = a.label || a.address;
          bVal = b.label || b.address;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  
  // 统计信息
  const walletStats = {
    total: wallets.length,
    active: wallets.filter(w => (w.solBalance || 0) > 0).length,
    empty: wallets.filter(w => (w.solBalance || 0) === 0).length,
    totalBalance: stats.totalBalance,
    averageBalance: wallets.length > 0 ? stats.totalBalance / wallets.length : 0
  };
  
  // 添加单个钱包
  const handleAddWallet = async () => {
    if (!newWalletForm.name.trim() || !newWalletForm.privateKey.trim()) {
      addLog({
        level: 'error',
        category: 'wallet',
        message: '钱包名称和私钥为必填项'
      });
      return;
    }
    
    try {
      await importWallet(newWalletForm.privateKey.trim(), newWalletForm.name.trim());
      setNewWalletForm({ name: '', privateKey: '' });
      addLog({
        level: 'success',
        category: 'wallet',
        message: `钱包 "${newWalletForm.name}" 添加成功`
      });
    } catch (error) {
      addLog({
        level: 'error',
        category: 'wallet',
        message: `添加钱包失败: ${error}`
      });
    }
  };
  
  // 解析批量私钥文本
  const parseBatchPrivateKeys = (text: string): string[] => {
    if (!text.trim()) return [];
    
    // 支持换行和逗号分隔，过滤空字符串
    return text
      .split(/[\n,]+/)
      .map(key => key.trim())
      .filter(key => key.length > 0);
  };
  
  // 批量导入钱包（从文本框）
  const handleBatchImportFromText = async () => {
    const privateKeys = parseBatchPrivateKeys(batchImportText);
    
    if (privateKeys.length === 0) {
      addLog({
        level: 'error',
        category: 'wallet',
        message: '请输入有效的私钥列表'
      });
      return;
    }
    
    setIsImporting(true);
    
    try {
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      
      for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        try {
          // 自动生成钱包名称
          const walletName = `钱包${wallets.length + successCount + 1}`;
          await importWallet(privateKey, walletName);
          successCount++;
          
          // 添加进度日志
          if (i % 5 === 0 || i === privateKeys.length - 1) {
            addLog({
              level: 'info',
              category: 'wallet',
              message: `导入进度: ${i + 1}/${privateKeys.length}`
            });
          }
        } catch (error) {
          errorCount++;
          errors.push(`私钥 ${i + 1}: ${error}`);
        }
      }
      
      // 显示导入结果
      addLog({
        level: successCount > 0 ? 'success' : 'error',
        category: 'wallet',
        message: `批量导入完成: ${successCount} 成功, ${errorCount} 失败`
      });
      
      // 如果有错误，显示详细错误信息
      if (errors.length > 0 && errors.length <= 5) {
        errors.forEach(error => {
          addLog({
            level: 'error',
            category: 'wallet',
            message: error
          });
        });
      }
      
      // 清空文本框
      if (successCount > 0) {
        setBatchImportText('');
      }
      
    } catch (error) {
      addLog({
        level: 'error',
        category: 'wallet',
        message: `批量导入失败: ${error}`
      });
    } finally {
      setIsImporting(false);
    }
  };
  
  // 批量导入钱包（从文件）
  const handleBatchImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    
    try {
      const content = await readFileAsText(file);
      const lines = content.split('\n').filter(line => line.trim());
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const line of lines) {
        try {
          const [name, privateKey] = line.split(',').map(s => s.trim());
          if (name && privateKey) {
            await importWallet(privateKey, name);
            successCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }
      
      addLog({
        level: 'success',
        category: 'wallet',
        message: `文件导入完成: ${successCount} 成功, ${errorCount} 失败`
      });
    } catch (error) {
      addLog({
        level: 'error',
        category: 'wallet',
        message: `导入钱包失败: ${error}`
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // 导出钱包
  const handleExportWallets = () => {
    const walletsToExport = selectedWallets.size > 0 
      ? wallets.filter(w => selectedWallets.has(w.id))
      : wallets;
    
    const csvContent = walletsToExport
      .map(wallet => `${wallet.label || wallet.address},${wallet.privateKey}`)
      .join('\n');
    
    downloadFile(
      csvContent, 
      `wallets_${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv'
    );
    
    addLog({
      level: 'info',
      category: 'wallet',
      message: `已导出 ${walletsToExport.length} 个钱包`
    });
  };
  
  // 删除选中的钱包
  const handleDeleteSelected = () => {
    if (selectedWallets.size === 0) return;
    
    selectedWallets.forEach(walletId => {
      removeWallet(walletId);
    });
    
    addLog({
      level: 'info',
      category: 'wallet',
      message: `已删除 ${selectedWallets.size} 个钱包`
    });
    setSelectedWallets(new Set());
  };
  
  // 复制地址
  const handleCopyAddress = async (address: string) => {
    const success = await copyToClipboard(address);
    if (success) {
      addLog({
        level: 'info',
        category: 'wallet',
        message: '地址已复制到剪贴板'
      });
    }
  };
  
  // 切换钱包选择
  const toggleWalletSelection = (walletId: string) => {
    const newSelection = new Set(selectedWallets);
    if (newSelection.has(walletId)) {
      newSelection.delete(walletId);
    } else {
      newSelection.add(walletId);
    }
    setSelectedWallets(newSelection);
  };
  
  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedWallets.size === filteredWallets.length) {
      setSelectedWallets(new Set());
    } else {
      setSelectedWallets(new Set(filteredWallets.map(w => w.id)));
    }
  };

  // 设置测试余额
   const handleSetTestBalances = () => {
     if (process.env.NODE_ENV === 'development') {
       const success = setAllTestBalances(1.0); // 为每个钱包设置1 SOL
       if (success) {
         addLog({
           level: 'success',
           category: 'wallet',
           message: `已为所有 ${wallets.length} 个钱包设置测试余额: 1.0 SOL`
         });
       }
     } else {
       addLog({
         level: 'warn',
         category: 'wallet',
         message: '测试余额功能仅在开发环境下可用'
       });
     }
   };
   
   // 添加KMS签名钱包导入的处理函数
   const handleKMSImport = () => {
     alert('连接API失败');
   };
  
  // 钱包行组件
  const WalletRow: React.FC<{ wallet: import('../types').Wallet }> = ({ wallet }) => {
    const isSelected = selectedWallets.has(wallet.id);
    const balanceChange = 0; // TODO: 计算余额变化
    
    return (
      <tr className={cn(
        "border-b border-gray-200 hover:bg-gray-50 transition-colors",
        isSelected && "bg-blue-50"
      )}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleWalletSelection(wallet.id)}
            className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
          />
        </td>
        
        <td className="px-4 py-3">
          <div className="flex items-center space-x-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              (wallet.solBalance || 0) > 0 ? "bg-green-500" : "bg-gray-500"
            )} />
            <div>
              <div className="font-medium text-gray-900">{wallet.label || wallet.address.slice(0, 8) + '...'}</div>
              <div className="text-sm text-gray-600">
                {truncateAddress(wallet.address)}
              </div>
            </div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <button
            onClick={() => handleCopyAddress(wallet.address)}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span className="font-mono text-sm">
              {truncateAddress(wallet.address, 8, 6)}
            </span>
            <Copy className="w-4 h-4" />
          </button>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-right">
            <div className="font-medium text-gray-900">
              {formatNumber(wallet.solBalance || 0)} SOL
            </div>
            {balanceChange !== 0 && (
              <div className={cn(
                "text-sm flex items-center justify-end",
                balanceChange > 0 ? "text-green-500" : "text-red-500"
              )}>
                {balanceChange > 0 ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {formatPercentage(Math.abs(balanceChange))}
              </div>
            )}
          </div>
        </td>
        
        <td className="px-4 py-3">
          {showPrivateKeys ? (
            <span className="font-mono text-sm text-gray-600">
              {truncateAddress(wallet.privateKey, 8, 8)}
            </span>
          ) : (
            <span className="text-gray-400">••••••••</span>
          )}
        </td>
        
        <td className="px-4 py-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => updateBalance(wallet.address)}
              className="p-1 text-gray-600 hover:text-gray-900 transition-colors"
              title="刷新余额"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => removeWallet(wallet.id)}
              className="p-1 text-gray-600 hover:text-red-500 transition-colors"
              title="删除钱包"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };
  
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* 页面标题和统计 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">钱包系统</h1>
          <p className="text-gray-600 mt-1">管理您的交易钱包并监控余额</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(walletStats.totalBalance)} SOL
            </div>
            <div className="text-sm text-gray-600">
              总余额
            </div>
          </div>
          
          <button
            onClick={stats.balanceInterval ? stopBalanceMonitoring : startBalanceMonitoring}
            className={cn(
              "px-4 py-2 rounded-lg font-medium transition-colors",
              stats.balanceInterval 
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            )}
          >
            {stats.balanceInterval ? '停止监控' : '开始监控'}
          </button>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">钱包总数</p>
              <p className="text-2xl font-bold text-gray-900">{walletStats.total}</p>
            </div>
            <Wallet className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">活跃钱包</p>
              <p className="text-2xl font-bold text-green-500">{walletStats.active}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">空钱包</p>
              <p className="text-2xl font-bold text-gray-500">{walletStats.empty}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-gray-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">平均余额</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(walletStats.averageBalance)}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>
      
      {/* 操作栏 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* 搜索和过滤 */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索钱包..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">所有钱包</option>
              <option value="active">仅活跃钱包</option>
              <option value="empty">仅空钱包</option>
            </select>
            
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field as any);
                setSortOrder(order as any);
              }}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="balance-desc">余额 (从高到低)</option>
              <option value="balance-asc">余额 (从低到高)</option>
              <option value="name-asc">名称 (A到Z)</option>
              <option value="name-desc">名称 (Z到A)</option>
              <option value="address-asc">地址 (A到Z)</option>
              <option value="address-desc">地址 (Z到A)</option>
            </select>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowPrivateKeys(!showPrivateKeys)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showPrivateKeys ? '隐藏私钥' : '显示私钥'}
            </button>
            
            <button
              onClick={updateAllBalances}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              刷新全部
            </button>

            {/* 开发环境：测试余额按钮 */}
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={handleSetTestBalances}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                title="为所有钱包设置测试余额 (仅开发环境)"
              >
                测试余额
              </button>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleBatchImport}
              className="hidden"
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isImporting ? '导入中...' : '导入'}
            </button>
            
            <button
              onClick={handleExportWallets}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>导出选中</span>
            </button>
            
            {selectedWallets.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除选中 ({selectedWallets.size})</span>
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* 添加钱包表单 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            添加钱包
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setImportMode('single')}
              className={cn(
                "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                importMode === 'single'
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              )}
            >
              单个导入
            </button>
            <button
              onClick={() => setImportMode('batch')}
              className={cn(
                "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                importMode === 'batch'
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              )}
            >
              批量导入
            </button>
            <button
              onClick={() => setImportMode('kms')}
              className={cn(
                "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                importMode === 'kms'
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              )}
            >
              KMS导入
            </button>
          </div>
        </div>
        
        {importMode === 'single' ? (
          /* 单个钱包导入 */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="输入钱包名称"
              value={newWalletForm.name}
              onChange={(e) => setNewWalletForm(prev => ({ ...prev, name: e.target.value }))}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <input
              type="password"
              placeholder="输入私钥"
              value={newWalletForm.privateKey}
              onChange={(e) => setNewWalletForm(prev => ({ ...prev, privateKey: e.target.value }))}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <button
              onClick={handleAddWallet}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              添加钱包
            </button>
          </div>
        ) : importMode === 'batch' ? (
          /* 批量钱包导入 */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                批量导入私钥 (每行一个私钥，支持逗号分隔)
              </label>
              <textarea
                placeholder="请粘贴私钥列表，每行一个私钥...&#10;例如：&#10;5K1234567890abcdef...&#10;L987654321fedcba...&#10;或者：5K1234567890abcdef..., L987654321fedcba..."
                value={batchImportText}
                onChange={(e) => setBatchImportText(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {batchImportText.trim() ? (
                  <span>
                    检测到 {batchImportText.trim().split(/[\n,]+/).filter(line => line.trim()).length} 个私钥
                  </span>
                ) : (
                  <span>支持换行或逗号分隔的私钥列表</span>
                )}
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setBatchImportText('')}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={handleBatchImportFromText}
                  disabled={!batchImportText.trim() || isImporting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  {isImporting ? '导入中...' : '开始导入'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* KMS签名钱包导入 */
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center mr-3">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-orange-800">KMS签名钱包导入</h4>
                  <p className="text-sm text-orange-600">通过KMS服务安全导入钱包</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-orange-700 mb-1">
                    KMS服务地址
                  </label>
                  <input
                    type="text"
                    placeholder="输入KMS服务API地址"
                    className="w-full px-4 py-2 bg-white border border-orange-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-orange-700 mb-1">
                    认证密钥
                  </label>
                  <input
                    type="password"
                    placeholder="输入KMS认证密钥"
                    className="w-full px-4 py-2 bg-white border border-orange-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm text-orange-600">
                    <p>• 确保KMS服务可访问</p>
                    <p>• 验证认证密钥有效性</p>
                  </div>
                  
                  <button
                    onClick={handleKMSImport}
                    className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
                  >
                    连接KMS服务
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* 钱包列表 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedWallets.size === filteredWallets.length && filteredWallets.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                  钱包
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                  地址
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                  余额
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                  私钥
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredWallets.map((wallet) => (
                <WalletRow key={wallet.id} wallet={wallet} />
              ))}
            </tbody>
          </table>
          
          {filteredWallets.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">
                {wallets.length === 0 ? '还没有添加钱包' : '没有钱包匹配您的筛选条件'}
              </p>
              <p className="text-sm">
                {wallets.length === 0 
                  ? '添加您的第一个钱包开始使用'
                  : '尝试调整您的搜索或筛选条件'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallets;