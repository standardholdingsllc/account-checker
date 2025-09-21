'use client';

import { useState } from 'react';

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const runCheck = async () => {
    setIsRunning(true);
    setError(null);
    setLastResult(null);

    try {
      const response = await fetch('/api/check-dormant?manual=true', {
        method: 'GET',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Check failed');
      }

      setLastResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  const getSummary = async () => {
    setIsLoadingSummary(true);
    setError(null);

    try {
      const response = await fetch('/api/summary', {
        method: 'GET',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Summary failed');
      }

      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoadingSummary(false);
    }
  };


  const getResultMessage = () => {
    if (!lastResult) return null;
    
    const { communicationNeeded, closureNeeded } = lastResult.data || {};
    const total = communicationNeeded + closureNeeded;
    
    if (total === 0) {
      return "✅ No dormant accounts found";
    } else {
      return `📋 Found ${total} dormant accounts (${communicationNeeded} need communication, ${closureNeeded} need closure)`;
    }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Header */}
          <div className="mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 text-white rounded-full mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Account Checker
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Automated monitoring system ensuring compliance and operational excellence
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-center w-12 h-12 bg-green-100 text-green-600 rounded-lg mb-4 mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Automated Monitoring</h3>
              <p className="text-gray-600">
                Continuous scanning and analysis during business hours
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-600 rounded-lg mb-4 mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4 7h7m0 0v5m0-5l-7 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-time Alerts</h3>
              <p className="text-gray-600">
                Instant notifications to keep your team informed
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">System Features</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Smart Processing</h4>
                <p className="text-sm text-gray-600">Advanced algorithms for accurate analysis</p>
              </div>
              
              <div className="text-center">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Secure Operations</h4>
                <p className="text-sm text-gray-600">Enterprise-grade security and compliance</p>
              </div>
              
              <div className="text-center">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">High Performance</h4>
                <p className="text-sm text-gray-600">Optimized for speed and reliability</p>
              </div>
            </div>
          </div>

          {/* Manual Trigger Section */}
          <div className="mt-12 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Manual Check</h2>
            <p className="text-gray-600 mb-6">
              Monitor your accounts and trigger checks manually
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={getSummary}
                disabled={isLoadingSummary}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  isLoadingSummary
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105'
                }`}
              >
                {isLoadingSummary ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Summary
                  </span>
                )}
              </button>

              <button
                onClick={runCheck}
                disabled={isRunning}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  isRunning
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg transform hover:scale-105'
                }`}
              >
              {isRunning ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Running Check...
                </span>
              ) : (
                <span className="flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Run Check Now
                </span>
              )}
              </button>
            </div>


            {/* Summary Display */}
            {summary && !error && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-3">Account Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{summary.data.totalAccounts}</div>
                    <div className="text-blue-700">Total Accounts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">{summary.data.upcomingAlerts.communicationSoon.length}</div>
                    <div className="text-amber-700">Communication Soon</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{summary.data.upcomingAlerts.closureSoon.length}</div>
                    <div className="text-red-700">Closure Soon</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-blue-600">
                  Updated: {new Date(summary.data.timestamp).toLocaleString()}
                </div>
              </div>
            )}


            {/* Results Display */}
            {(lastResult || error) && !(summary && !error) && (
              <div className="mt-6 p-4 rounded-lg border">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-red-800">Error:</span>
                    </div>
                    <p className="text-red-700 mt-1">{error}</p>
                  </div>
                )}
                
                {lastResult && !error && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-green-800">Check Completed</span>
                    </div>
                    <p className="text-green-700 mt-1">{getResultMessage()}</p>
                    <p className="text-green-600 text-sm mt-2">
                      Completed at {new Date(lastResult.data.timestamp).toLocaleString()}
                    </p>
                    {lastResult.data.communicationNeeded > 0 || lastResult.data.closureNeeded > 0 ? (
                      <p className="text-green-600 text-sm mt-1">
                        📱 Alerts have been sent to your team's Slack channel
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
            <p className="text-gray-500 text-sm">
              System operational and monitoring active during business hours
            </p>
            <p className="text-gray-400 text-xs mt-2">
              Automated checks run weekdays at 10:00 AM EST
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
