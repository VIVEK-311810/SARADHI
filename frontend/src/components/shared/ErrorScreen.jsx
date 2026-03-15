import React from 'react';
import { AlertTriangle, WifiOff, Lock, ServerCrash, FileQuestion } from 'lucide-react';
import { Button } from '../ui/button';

const ERROR_CONFIG = {
  network: {
    Icon: WifiOff,
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
    defaultTitle: 'Connection Problem',
    defaultMessage: 'Unable to reach the server. Check your internet connection and try again.',
  },
  auth: {
    Icon: Lock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    defaultTitle: 'Authentication Required',
    defaultMessage: 'Your session may have expired. Please sign in again.',
  },
  notfound: {
    Icon: FileQuestion,
    iconBg: 'bg-primary-100 dark:bg-primary-900/30',
    iconColor: 'text-primary-600 dark:text-primary-400',
    defaultTitle: 'Not Found',
    defaultMessage: "The resource you're looking for doesn't exist or has been removed.",
  },
  server: {
    Icon: ServerCrash,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    defaultTitle: 'Server Error',
    defaultMessage: 'Something went wrong on our end. Please try again in a moment.',
  },
  generic: {
    Icon: AlertTriangle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    defaultTitle: 'Something Went Wrong',
    defaultMessage: 'An unexpected error occurred.',
  },
};

const ErrorScreen = ({
  errorType = 'generic',
  title,
  message,
  onRetry,
  onGoHome,
  fullPage = false,
  className = '',
}) => {
  const config = ERROR_CONFIG[errorType] ?? ERROR_CONFIG.generic;
  const { Icon, iconBg, iconColor, defaultTitle, defaultMessage } = config;

  const content = (
    <div className="text-center w-full max-w-sm mx-auto px-4">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${iconBg}`}>
        <Icon className={`w-8 h-8 ${iconColor}`} />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        {title ?? defaultTitle}
      </h2>
      <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mb-8">
        {message ?? defaultMessage}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onRetry && (
          <Button onClick={onRetry} className="w-full sm:w-auto">
            Try Again
          </Button>
        )}
        {onGoHome && (
          <Button variant="outline" onClick={onGoHome} className="w-full sm:w-auto">
            Go Home
          </Button>
        )}
        {!onRetry && !onGoHome && (
          <Button
            onClick={() => { window.location.href = '/auth'; }}
            className="w-full sm:w-auto"
          >
            Return to Login
          </Button>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      {content}
    </div>
  );
};

export default ErrorScreen;
