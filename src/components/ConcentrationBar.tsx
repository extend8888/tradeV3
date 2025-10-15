import React from 'react';

interface ConcentrationBarProps {
  percentage: number;
  label: string;
  color?: string;
  showPercentage?: boolean;
}

const ConcentrationBar: React.FC<ConcentrationBarProps> = ({ 
  percentage, 
  label, 
  color = 'bg-blue-500',
  showPercentage = true 
}) => {
  const getColorIntensity = (value: number) => {
    if (value >= 80) return 'bg-red-500';
    if (value >= 60) return 'bg-orange-500';
    if (value >= 40) return 'bg-yellow-500';
    if (value >= 20) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const barColor = color === 'bg-blue-500' ? getColorIntensity(percentage) : color;

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {showPercentage && (
          <span className="text-sm font-bold text-gray-900">
            {percentage.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
};

export default ConcentrationBar;