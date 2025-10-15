import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Server, 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Check, 
  AlertCircle, 
  Wifi, 
  WifiOff,
  RefreshCw,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Download,
  Upload,
  RotateCcw
} from 'lucide-react';
import { useRPCStore } from '../stores/rpcStore';
import { useLogStore } from '../stores/logStore';
import { 
  formatNumber, 
  cn 
} from '../utils';
import { RPCNode } from '../types';
import { DEFAULT_RPC_NODES } from '../constants';

/**
 * 设置页面
 * 包含RPC节点管理、系统配置等功能
 */
const Settings: React.FC = () => {
  const {
    nodes,
    currentNode,
    isConnected,
    addNode,
    updateNode,
    removeNode,
    setCurrentNode,
    testConnection
  } = useRPCStore();
  
  const { addLog, exportLogs, clearLogs } = useLogStore();
  
  // 状态管理
  const [activeTab, setActiveTab] = useState<'rpc' | 'general' | 'security' | 'data'>('rpc');
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingNodes, setTestingNodes] = useState<Set<string>>(new Set());
  const [showApiKey, setShowApiKey] = useState(false);
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    wsEndpoint: '', // 添加WebSocket端点字段
    apiKey: ''
  });
  
  // 通用设置状态
  const [generalSettings, setGeneralSettings] = useState({
    autoRefresh: true,
    refreshInterval: 30000,
    maxLogEntries: 1000,
    enableNotifications: true,
    darkMode: true,
    language: 'en'
  });
  
  // 安全设置状态
  const [securitySettings, setSecuritySettings] = useState({
    encryptWallets: true,
    autoLock: false,
    lockTimeout: 300000, // 5分钟
    requirePassword: false
  });
  
  // 重置表单
  const resetForm = () => {
    setFormData({ name: '', url: '', wsEndpoint: '', apiKey: '' });
    setEditingNode(null);
    setShowAddForm(false);
  };
  
  // 开始编辑节点
  const startEditNode = (node: RPCNode) => {
    setFormData({
      name: node.name,
      url: node.url,
      wsEndpoint: node.wsEndpoint || '',
      apiKey: node.apiKey || ''
    });
    setEditingNode(node.id);
    setShowAddForm(false);
  };
  
  // 保存节点
  const handleSaveNode = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      addLog({ level: 'error', category: 'system', message: '节点名称和URL为必填项' });
      return;
    }
    
    try {
      const nodeData = {
        name: formData.name.trim(),
        url: formData.url.trim(),
        wsEndpoint: formData.wsEndpoint.trim() || undefined,
        apiKey: formData.apiKey.trim() || undefined
      };
      
      if (editingNode) {
        await updateNode(editingNode, nodeData);
        addLog({ level: 'success', category: 'rpc', message: `已更新RPC节点: ${nodeData.name}` });
      } else {
        await addNode({
          ...nodeData,
          latency: 0,
          isActive: false,
          status: 'disconnected' as const,
          priority: 1
        });
        addLog({ level: 'success', category: 'rpc', message: `已添加RPC节点: ${nodeData.name}` });
      }
      
      resetForm();
    } catch (error) {
      addLog({ level: 'error', category: 'rpc', message: `保存节点失败: ${error}` });
    }
  };
  
  // 删除节点
  const handleDeleteNode = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    if (window.confirm(`确定要删除"${node.name}"吗？`)) {
      try {
        await removeNode(nodeId);
        addLog({ level: 'success', category: 'rpc', message: `已删除RPC节点: ${node.name}` });
      } catch (error) {
        addLog({ level: 'error', category: 'rpc', message: `删除节点失败: ${error}` });
      }
    }
  };
  
  // 测试节点连接
  const handleTestNode = async (nodeId: string) => {
    setTestingNodes(prev => new Set(prev).add(nodeId));
    
    try {
      const result = await testConnection(nodeId);
      const node = nodes.find(n => n.id === nodeId);
      
      if (result.success) {
        addLog({ level: 'success', category: 'rpc', message: `${node?.name}连接测试通过: ${result.latency}ms` });
      } else {
        addLog({ level: 'error', category: 'rpc', message: `${node?.name}连接测试失败: ${result.error}` });
      }
    } catch (error) {
      addLog({ level: 'error', category: 'rpc', message: `测试失败: ${error}` });
    } finally {
      setTestingNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  };
  
  // 重置为默认节点
  const handleResetToDefaults = () => {
    if (window.confirm('这将重置所有RPC节点为默认设置。是否继续？')) {
      // 清除现有节点并添加默认节点
      nodes.forEach(node => {
        if (!DEFAULT_RPC_NODES.find(defaultNode => defaultNode.url === node.url)) {
          removeNode(node.id);
        }
      });
      
      DEFAULT_RPC_NODES.forEach(defaultNode => {
        if (!nodes.find(node => node.url === defaultNode.url)) {
          addNode(defaultNode);
        }
      });
      
      addLog({ level: 'info', category: 'rpc', message: '已重置RPC节点为默认设置' });
    }
  };
  
  // 导出配置
  const handleExportConfig = () => {
    const config = {
      rpcNodes: nodes,
      generalSettings,
      securitySettings,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socrates-trader-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog({ level: 'success', category: 'system', message: '配置导出成功' });
  };
  
  // 导入配置
  const handleImportConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string);
        
        // 导入RPC节点
        if (config.rpcNodes && Array.isArray(config.rpcNodes)) {
          config.rpcNodes.forEach((node: any) => {
            if (node.name && node.url) {
              addNode({
                name: node.name,
                url: node.url,
                apiKey: node.apiKey,
                latency: 0,
                isActive: false,
                status: 'disconnected' as const,
                priority: 1
              });
            }
          });
        }
        
        // 导入其他设置
        if (config.generalSettings) {
          setGeneralSettings(prev => ({ ...prev, ...config.generalSettings }));
        }
        
        if (config.securitySettings) {
          setSecuritySettings(prev => ({ ...prev, ...config.securitySettings }));
        }
        
        addLog({ level: 'success', category: 'system', message: '配置导入成功' });
      } catch (error) {
        addLog({ level: 'error', category: 'system', message: `配置导入失败: ${error}` });
      }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // 重置文件输入
  };
  
  // 标签页配置
  const tabs = [
    { id: 'rpc', name: 'RPC节点', icon: Server },
    { id: 'general', name: '通用设置', icon: SettingsIcon },
    { id: 'security', name: '安全设置', icon: Lock },
    { id: 'data', name: '数据管理', icon: Download }
  ] as const;
  
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">系统设置</h1>
          <p className="text-gray-600 mt-1">配置系统偏好设置和连接</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportConfig}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>导出配置</span>
          </button>
          
          <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>导入配置</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportConfig}
              className="hidden"
            />
          </label>
        </div>
      </div>
      
      {/* 标签页导航 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                  isActive
                    ? "border-blue-500 text-blue-500"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>
      
      {/* 标签页内容 */}
      <div className="space-y-6">
        {/* RPC节点管理 */}
        {activeTab === 'rpc' && (
          <div className="space-y-6">
            {/* 节点列表 */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">RPC节点</h2>
                
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleResetToDefaults}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors flex items-center space-x-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>重置为默认</span>
                  </button>
                  
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>添加节点</span>
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                {/* 添加/编辑表单 */}
                {(showAddForm || editingNode) && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-300">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      {editingNode ? '编辑节点' : '添加新节点'}
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="text"
                          placeholder="节点名称"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <input
                          type="url"
                          placeholder="RPC地址 (HTTP/HTTPS)"
                          value={formData.url}
                          onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="url"
                          placeholder="WebSocket地址 (可选，留空自动推断)"
                          value={formData.wsEndpoint}
                          onChange={(e) => setFormData(prev => ({ ...prev, wsEndpoint: e.target.value }))}
                          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <div className="relative">
                          <input
                            type={showApiKey ? "text" : "password"}
                            placeholder="API密钥（可选）"
                            value={formData.apiKey}
                            onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                            className="w-full px-3 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700"
                          >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-gray-600">
                        <p className="mb-1">提示: WebSocket地址用于实时订阅交易状态</p>
                        <p className="mb-1">• 标准RPC: 留空会自动从HTTP地址推断 (https:// → wss://)</p>
                        <p>• 特殊RPC (如zan.top): 需手动填写正确的WebSocket地址</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 mt-4">
                      <button
                        onClick={handleSaveNode}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                      >
                        <Save className="w-4 h-4" />
                        <span>保存</span>
                      </button>
                      
                      <button
                        onClick={resetForm}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors flex items-center space-x-2"
                      >
                        <X className="w-4 h-4" />
                        <span>取消</span>
                      </button>
                    </div>
                  </div>
                )}
                
                {/* 节点列表 */}
                <div className="space-y-3">
                  {nodes.map((node) => (
                    <div
                      key={node.id}
                      className={cn(
                        "p-4 rounded-lg border transition-all duration-200",
                        currentNode?.id === node.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-300 bg-white hover:border-gray-400"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <button
                            onClick={() => setCurrentNode(node.id)}
                            className={cn(
                              "w-4 h-4 rounded-full border-2 transition-colors",
                              currentNode?.id === node.id
                                ? "border-blue-500 bg-blue-500"
                                : "border-gray-400 hover:border-blue-400"
                            )}
                          />
                          
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium text-gray-900">{node.name}</h3>
                              {currentNode?.id === node.id && isConnected && (
                                <div className="flex items-center space-x-1">
                                  <Wifi className="w-4 h-4 text-green-500" />
                                  <span className="text-xs text-green-500">已连接</span>
                                </div>
                              )}
                              {currentNode?.id === node.id && !isConnected && (
                                <div className="flex items-center space-x-1">
                                  <WifiOff className="w-4 h-4 text-red-500" />
                                  <span className="text-xs text-red-500">未连接</span>
                                </div>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{node.url}</p>
                            {node.wsEndpoint && (
                              <p className="text-xs text-gray-500">WS: {node.wsEndpoint}</p>
                            )}
                            {node.latency && (
                              <p className="text-xs text-gray-500">
                                延迟: {formatNumber(node.latency)}ms
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleTestNode(node.id)}
                            disabled={testingNodes.has(node.id)}
                            className="p-2 text-blue-500 hover:text-blue-400 disabled:text-gray-500 transition-colors"
                            title="测试连接"
                          >
                            <RefreshCw className={cn(
                              "w-4 h-4",
                              testingNodes.has(node.id) && "animate-spin"
                            )} />
                          </button>
                          
                          <button
                            onClick={() => startEditNode(node)}
                            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                            title="编辑节点"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteNode(node.id)}
                            className="p-2 text-red-500 hover:text-red-400 transition-colors"
                            title="删除节点"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {nodes.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>未配置RPC节点</p>
                      <p className="text-sm mt-1">添加一个节点开始使用</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 通用设置 */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">通用设置</h2>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    刷新间隔 (毫秒)
                  </label>
                  <input
                    type="number"
                    value={generalSettings.refreshInterval}
                    onChange={(e) => setGeneralSettings(prev => ({
                      ...prev,
                      refreshInterval: parseInt(e.target.value) || 30000
                    }))}
                    min="1000"
                    step="1000"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    最大日志条目
                  </label>
                  <input
                    type="number"
                    value={generalSettings.maxLogEntries}
                    onChange={(e) => setGeneralSettings(prev => ({
                      ...prev,
                      maxLogEntries: parseInt(e.target.value) || 1000
                    }))}
                    min="100"
                    step="100"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="autoRefresh"
                    checked={generalSettings.autoRefresh}
                    onChange={(e) => setGeneralSettings(prev => ({
                      ...prev,
                      autoRefresh: e.target.checked
                    }))}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="autoRefresh" className="text-sm text-gray-700">
                    启用自动刷新
                  </label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="enableNotifications"
                    checked={generalSettings.enableNotifications}
                    onChange={(e) => setGeneralSettings(prev => ({
                      ...prev,
                      enableNotifications: e.target.checked
                    }))}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="enableNotifications" className="text-sm text-gray-700">
                    启用通知
                  </label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="darkMode"
                    checked={generalSettings.darkMode}
                    onChange={(e) => setGeneralSettings(prev => ({
                      ...prev,
                      darkMode: e.target.checked
                    }))}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="darkMode" className="text-sm text-gray-700">
                    深色模式
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 安全设置 */}
        {activeTab === 'security' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">安全设置</h2>
            
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="encryptWallets"
                    checked={securitySettings.encryptWallets}
                    onChange={(e) => setSecuritySettings(prev => ({
                      ...prev,
                      encryptWallets: e.target.checked
                    }))}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="encryptWallets" className="text-sm text-gray-700">
                    加密钱包数据
                  </label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="autoLock"
                    checked={securitySettings.autoLock}
                    onChange={(e) => setSecuritySettings(prev => ({
                      ...prev,
                      autoLock: e.target.checked
                    }))}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="autoLock" className="text-sm text-gray-700">
                    自动锁定应用
                  </label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="requirePassword"
                    checked={securitySettings.requirePassword}
                    onChange={(e) => setSecuritySettings(prev => ({
                      ...prev,
                      requirePassword: e.target.checked
                    }))}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="requirePassword" className="text-sm text-gray-700">
                    敏感操作需要密码
                  </label>
                </div>
              </div>
              
              {securitySettings.autoLock && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    锁定超时 (分钟)
                  </label>
                  <input
                    type="number"
                    value={securitySettings.lockTimeout / 60000}
                    onChange={(e) => setSecuritySettings(prev => ({
                      ...prev,
                      lockTimeout: (parseInt(e.target.value) || 5) * 60000
                    }))}
                    min="1"
                    max="60"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* 数据管理 */}
        {activeTab === 'data' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">数据管理</h2>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">导出数据</h3>
                  
                  <button
                    onClick={() => exportLogs('json')}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>导出日志</span>
                  </button>
                  
                  <button
                    onClick={handleExportConfig}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>导出配置</span>
                  </button>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">清除数据</h3>
                  
                  <button
                    onClick={() => {
                      if (window.confirm('确定要清除所有日志吗？')) {
                        clearLogs();
                        addLog({ level: 'info', category: 'system', message: 'All logs cleared' });
                      }
                    }}
                    className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>清除所有日志</span>
                  </button>
                  
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-yellow-500 font-medium">警告</p>
                        <p className="text-xs text-yellow-400 mt-1">
                          清除数据无法撤销。请确保先导出重要数据。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;