import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = 'blue',
  subtitle,
  trend = 'neutral'
}) => {
  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 text-blue-900',
      green: 'bg-green-50 border-green-200 text-green-900',
      red: 'bg-red-50 border-red-200 text-red-900',
      purple: 'bg-purple-50 border-purple-200 text-purple-900',
      orange: 'bg-orange-50 border-orange-200 text-orange-900',
      indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getIconColor = (color: string) => {
    const colors = {
      blue: 'text-blue-600',
      green: 'text-green-600',
      red: 'text-red-600',
      purple: 'text-purple-600',
      orange: 'text-orange-600',
      indigo: 'text-indigo-600',
      yellow: 'text-yellow-600'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatChange = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div className={`p-4 rounded-lg border ${getColorClasses(color)} transition-all duration-200 hover:shadow-md`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${getIconColor(color)}`} />
          <span className="text-sm font-medium opacity-80">{title}</span>
        </div>
        {change !== undefined && (
          <span className={`text-xs font-bold ${getTrendColor(trend)}`}>
            {formatChange(change)}
          </span>
        )}
      </div>
      
      <div className="mb-1">
        <span className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>
      
      {subtitle && (
        <div className="text-xs opacity-70">
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default StatCard;