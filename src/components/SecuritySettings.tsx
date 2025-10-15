import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Settings, Info } from 'lucide-react';
import { riskManager } from '@/services/riskManager';
import { useVolumeStore } from '@/stores/volumeStore';

interface SecuritySettingsProps {
  onClose?: () => void;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({ onClose }) => {
  const { config, updateConfig } = useVolumeStore();
  const [thresholds, setThresholds] = useState(riskManager.getThresholds());
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 获取当前风险评估 - 直接使用 riskManager
  const currentRisk = config ? riskManager.assessRisk(config) : { level: 'low' as const, score: 0, factors: [], recommendations: [], maxSafeVolume: 0, estimatedDetectionRisk: 0 };
  const recommendations = currentRisk.recommendations;

  const handleThresholdChange = (key: string, value: number) => {
    const newThresholds = { ...thresholds, [key]: value };
    setThresholds(newThresholds);
    riskManager.updateThresholds(newThresholds);
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getRiskLevelIcon = (level: string) => {
    switch (level) {
      case 'low': return <CheckCircle className="w-4 h-4" />;
      case 'medium': return <AlertTriangle className="w-4 h-4" />;
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Shield className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">安全设置</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      {/* 当前风险状态 */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3">当前风险状态</h3>
        <div className={`p-4 rounded-lg border ${getRiskLevelColor(currentRisk.level)}`}>
          <div className="flex items-center space-x-2 mb-2">
            {getRiskLevelIcon(currentRisk.level)}
            <span className="font-medium capitalize">
              {currentRisk.level === 'low' ? '低风险' : 
               currentRisk.level === 'medium' ? '中等风险' : '高风险'}
            </span>
            <span className="text-sm">
              (风险评分: {currentRisk.score.toFixed(1)}/100)
            </span>
          </div>
          {currentRisk.factors.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-1">风险因素:</p>
              <ul className="list-disc list-inside space-y-1">
                {currentRisk.factors.map((factor, index) => (
                  <li key={index}>{factor}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 安全建议 */}
      {recommendations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">安全建议</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-blue-800">{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 风险阈值设置 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900">风险阈值设置</h3>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <Settings className="w-4 h-4" />
            <span>{showAdvanced ? '隐藏高级设置' : '显示高级设置'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 基础设置 */}
          <div className="space-y-4">


            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最大并发会话数
              </label>
              <input
                type="number"
                value={thresholds.maxConcurrentSessions}
                onChange={(e) => handleThresholdChange('maxConcurrentSessions', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
                max="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最小交易间隔 (秒)
              </label>
              <input
                type="number"
                value={thresholds.minTradeInterval}
                onChange={(e) => handleThresholdChange('minTradeInterval', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
              />
            </div>
          </div>

          {/* 高级设置 */}
          {showAdvanced && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最大失败率 (%)
                </label>
                <input
                  type="number"
                  value={thresholds.maxFailureRate}
                  onChange={(e) => handleThresholdChange('maxFailureRate', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                  step="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最大钱包使用率 (%)
                </label>
                <input
                  type="number"
                  value={thresholds.maxWalletUsage}
                  onChange={(e) => handleThresholdChange('maxWalletUsage', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="100"
                  step="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  网络拥堵阈值
                </label>
                <input
                  type="number"
                  value={thresholds.networkCongestionThreshold}
                  onChange={(e) => handleThresholdChange('networkCongestionThreshold', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 安全功能开关 */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3">安全功能</h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.enableRiskMonitoring}
              onChange={(e) => updateConfig({ enableRiskMonitoring: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">启用实时风险监控</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.autoStopOnHighRisk}
              onChange={(e) => updateConfig({ autoStopOnHighRisk: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">高风险时自动停止</span>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.enableAuditLog}
              onChange={(e) => updateConfig({ enableAuditLog: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">启用审计日志</span>
          </label>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => {
            // 重置为默认值
            const defaultThresholds = {
              maxConcurrentSessions: 3,
              minTradeInterval: 30,
              maxFailureRate: 20,
              maxWalletUsage: 80,
              networkCongestionThreshold: 0.8,
            };
            setThresholds(defaultThresholds);
            riskManager.updateThresholds(defaultThresholds);
          }}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          重置默认
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          保存设置
        </button>
      </div>
    </div>
  );
};

export default SecuritySettings;