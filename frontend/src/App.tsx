import { useState, useEffect } from 'react';
import { isConnected, isAllowed, setAllowed, getAddress, getNetwork } from '@stellar/freighter-api';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ShieldCheck, Clock, ArrowRight, Loader2, AlertCircle, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';

export default function App() {
  const [hasFreighter, setHasFreighter] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [lastClaimDate, setLastClaimDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initFreighter = async () => {
      try {
        const result = await isConnected();
        const connected = typeof result === 'boolean' ? result : result.isConnected;
        setHasFreighter(connected);
        
        if (connected) {
          const allowed = await isAllowed();
          if (allowed) {
            await fetchUserInfo();
          }
        }
      } catch (err) {
        console.error("Error initializing Freighter:", err);
      }
    };
    initFreighter();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const result = await getAddress();
      if (result && result.address) {
        setWalletAddress(result.address);
        const networkResult = await getNetwork();
        setNetwork(networkResult.network);
      }
    } catch (err) {
      console.error("Error fetching user info:", err);
      setError("Failed to get wallet details. Please try again.");
    }
  };

  const handleConnect = async () => {
    if (!hasFreighter) {
      window.open('https://freighter.app/', '_blank');
      return;
    }

    setIsConnecting(true);
    setError(null);
    try {
      await setAllowed();
      await fetchUserInfo();
    } catch (err) {
      console.error("User denied connection", err);
      setError("Connection request was rejected.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClaim = async () => {
    if (!walletAddress) return;
    setIsClaiming(true);
    setError(null);
    
    // Simulate smart contract interaction
    try {
      // In production, this would be a Soroban contract invocation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setLastClaimDate(new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString());
      // Successful claim animation or notification could be triggered here
    } catch (err) {
      setError("Transaction failed. Please check your connection and try again.");
    } finally {
      setIsClaiming(false);
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[150px]" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-blue-600/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12 md:py-24 relative z-10">
        
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                StipeStream
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-1">Trustless Scholar Disbursements</p>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConnect}
            className={`relative group overflow-hidden px-6 py-3 rounded-full font-medium text-sm transition-all flex items-center gap-2 border ${
              walletAddress 
                ? 'bg-white/5 border-white/10 text-slate-300' 
                : 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.3)]'
            }`}
          >
            {walletAddress ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>{formatAddress(walletAddress)}</span>
                {network && <span className="ml-2 text-xs text-slate-500 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">{network}</span>}
              </>
            ) : isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                <span>{hasFreighter ? 'Connect Wallet' : 'Install Freighter'}</span>
              </>
            )}
            
            {/* Hover shine effect */}
            {!walletAddress && (
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]" />
            )}
          </motion.button>
        </motion.header>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Action Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-8 bg-white/[0.02] border border-white/5 rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden shadow-2xl"
          >
            {/* Card internal glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-8">
                  <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 w-fit">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Time-Lock Open</span>
                  </div>
                </div>

                <h2 className="text-5xl font-light tracking-tight mb-2 text-white">
                  100.00 <span className="text-slate-500 font-medium text-3xl">USDC</span>
                </h2>
                <p className="text-slate-400">Available monthly allowance ready for withdrawal.</p>
              </div>

              <div className="mt-12 pt-8 border-t border-white/5">
                <motion.button
                  whileHover={walletAddress && !isClaiming ? { scale: 1.01 } : {}}
                  whileTap={walletAddress && !isClaiming ? { scale: 0.98 } : {}}
                  onClick={handleClaim}
                  disabled={!walletAddress || isClaiming}
                  className={`w-full py-5 rounded-2xl text-lg font-semibold transition-all relative overflow-hidden flex items-center justify-center gap-3 ${
                    !walletAddress 
                      ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                      : isClaiming
                      ? 'bg-indigo-600/50 text-white cursor-wait border border-indigo-500/30'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-[0_0_30px_rgba(79,70,229,0.3)] border border-white/10'
                  }`}
                >
                  {isClaiming ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Executing Smart Contract...</span>
                    </>
                  ) : !walletAddress ? (
                    <span>Connect Wallet to Claim</span>
                  ) : (
                    <>
                      <span>Withdraw to Wallet</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
                <p className="text-center text-xs text-slate-500 mt-4 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Secure Soroban Network Transaction
                </p>
              </div>
            </div>
          </motion.div>

          {/* History / Info Sidebar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-4 space-y-6"
          >
            {/* Soroban Info Card */}
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-400" />
                Contract Details
              </h3>
              <div className="space-y-4">
                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="text-xs text-slate-500 mb-1">Contract ID</div>
                  <div className="text-sm font-mono text-slate-300 break-all flex items-center justify-between">
                    CC2Y...89F2
                    <ExternalLink className="w-3 h-3 text-slate-500 hover:text-indigo-400 cursor-pointer" />
                  </div>
                </div>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="text-xs text-slate-500 mb-1">Next Unlock</div>
                  <div className="text-sm text-slate-300 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-amber-400" />
                    28 Days, 14 Hrs
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 backdrop-blur-xl h-full">
              <h3 className="text-sm font-semibold text-slate-300 mb-6 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Recent Activity
              </h3>
              <div className="space-y-5 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                
                <AnimatePresence>
                  {lastClaimDate && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0, scale: 0.9 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                    >
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border border-emerald-500 bg-emerald-500/20 shadow flex-shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-white/5 border border-white/5 p-3 rounded-xl shadow-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-emerald-400 text-sm">+100 USDC</span>
                        </div>
                        <div className="text-xs text-slate-500">{lastClaimDate}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white/10 bg-white/5 shadow flex-shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10" />
                  <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-white/5 border border-white/5 p-3 rounded-xl shadow-lg hover:bg-white/10 transition-colors cursor-pointer group-hover:border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-300 text-sm">+100 USDC</span>
                      <ChevronRight className="w-3 h-3 text-slate-500" />
                    </div>
                    <div className="text-xs text-slate-500">Last Month</div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        </main>
      </div>
      
      {/* Global CSS for custom animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}} />
    </div>
  );
}
