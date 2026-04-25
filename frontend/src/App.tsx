import { useState } from 'react'

function App() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [lastClaim, setLastClaim] = useState<string | null>(null);

  const handleConnect = () => {
    setWalletConnected(true);
  };

  const handleClaim = () => {
    setClaiming(true);
    setTimeout(() => {
      setClaiming(false);
      setLastClaim(new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString());
    }, 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-8">
      {/* Header */}
      <header className="w-full max-w-3xl flex justify-between items-center mb-16 border-b border-gray-200 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">StipeStream</h1>
          <p className="text-sm text-gray-500 mt-1">Automated Scholar Disbursements</p>
        </div>
        <button 
          onClick={handleConnect}
          className={`px-6 py-3 font-medium text-sm transition-colors border ${
            walletConnected 
              ? 'bg-gray-100 text-gray-900 border-gray-200 cursor-default' 
              : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800 shadow-solid'
          }`}
        >
          {walletConnected ? 'GDUX...8A3E' : 'Connect Wallet'}
        </button>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-3xl space-y-8">
        {/* Status Card */}
        <section className="bg-white border border-gray-200 p-8 shadow-solid">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-2">Current Status</h2>
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-xl font-medium text-gray-900">Ready to Claim</span>
              </div>
              <p className="text-gray-600 mt-4 max-w-md">
                Your monthly allowance is unlocked. Ensure your wallet is connected to the Stellar network before proceeding.
              </p>
            </div>
            
            <div className="mt-8 md:mt-0 text-left md:text-right">
              <span className="block text-sm text-gray-500 mb-1">Available Amount</span>
              <span className="text-4xl font-bold tracking-tight text-gray-900">100<span className="text-2xl text-gray-400 ml-1">USDC</span></span>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-100">
            <button
              onClick={handleClaim}
              disabled={!walletConnected || claiming}
              className={`w-full py-4 text-base font-semibold border transition-colors flex justify-center items-center ${
                !walletConnected 
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : claiming
                  ? 'bg-blue-50 text-blue-700 border-blue-200 cursor-wait'
                  : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-solid'
              }`}
            >
              {claiming ? (
                <span className="flex items-center space-x-2">
                  <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Processing Transaction...</span>
                </span>
              ) : 'Claim 100 USDC'}
            </button>
          </div>
        </section>

        {/* Claim History */}
        <section className="bg-white border border-gray-200 p-8 shadow-solid">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-6">Recent Disbursements</h3>
          <div className="space-y-4">
            {lastClaim && (
              <div className="flex justify-between items-center py-4 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">Monthly Allowance</span>
                  <span className="text-sm text-gray-500 mt-1">{lastClaim}</span>
                </div>
                <div className="text-right">
                  <span className="text-green-600 font-medium">+100 USDC</span>
                  <a href="#" className="block text-sm text-blue-600 hover:underline mt-1">View Tx</a>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center py-4 border-b border-gray-100 last:border-0 last:pb-0">
              <div className="flex flex-col">
                <span className="text-gray-900 font-medium">Monthly Allowance</span>
                <span className="text-sm text-gray-500 mt-1">30 Days Ago</span>
              </div>
              <div className="text-right">
                <span className="text-green-600 font-medium">+100 USDC</span>
                <a href="#" className="block text-sm text-blue-600 hover:underline mt-1">View Tx</a>
              </div>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-gray-100 last:border-0 last:pb-0">
              <div className="flex flex-col">
                <span className="text-gray-900 font-medium">Monthly Allowance</span>
                <span className="text-sm text-gray-500 mt-1">60 Days Ago</span>
              </div>
              <div className="text-right">
                <span className="text-green-600 font-medium">+100 USDC</span>
                <a href="#" className="block text-sm text-blue-600 hover:underline mt-1">View Tx</a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
