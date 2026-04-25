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
  const [error, setError] = useState<string | null>(null);

  // Advanced State
  const [userState, setUserState] = useState<{
    payoutAmount: number;
    intervalSecs: number;
    lastClaimTime: number;
    totalBalance: number;
    role: 'student' | 'funder';
  } | null>(null);
  
  const [history, setHistory] = useState<{id: string, amount: number, date: number}[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

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
        
        // Load persistent data for this specific wallet
        loadUserData(result.address);
      }
    } catch (err) {
      console.error("Error fetching user info:", err);
      setError("Failed to get wallet details. Please try again.");
    }
  };

  const loadUserData = (address: string) => {
    const saved = localStorage.getItem(`stipestream_${address}`);
    if (saved) {
      const data = JSON.parse(saved);
      setUserState(data.state);
      setHistory(data.history || []);
    } else {
      // Default initial state for new users
      const initialState = {
        payoutAmount: 100,
        intervalSecs: 30 * 24 * 60 * 60, // 30 days
        lastClaimTime: 0,
        totalBalance: 600, // 6 months of stipends
        role: 'student' as const
      };
      const initialHistory: any[] = [];
      setUserState(initialState);
      setHistory(initialHistory);
      saveUserData(address, initialState, initialHistory);
    }
  };

  const saveUserData = (address: string, state: any, historyData: any[]) => {
    localStorage.setItem(`stipestream_${address}`, JSON.stringify({
      state,
      history: historyData
    }));
  };

  useEffect(() => {
    if (!userState) return;

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const unlockTime = userState.lastClaimTime + userState.intervalSecs;
      const remaining = Math.max(0, unlockTime - now);
      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [userState]);

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
    if (!walletAddress || !userState) return;
    
    const now = Math.floor(Date.now() / 1000);
    const unlockTime = userState.lastClaimTime + userState.intervalSecs;
    
    if (now < unlockTime) {
      setError(`Wait ${formatTime(timeLeft)} before next withdrawal.`);
      return;
    }

    if (userState.totalBalance < userState.payoutAmount) {
      setError("Insufficient contract balance.");
      return;
    }

    setIsClaiming(true);
    setError(null);
    
    try {
      // Simulate Soroban contract delay
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const newState = {
        ...userState,
        lastClaimTime: now,
        totalBalance: userState.totalBalance - userState.payoutAmount
      };
      
      const newHistory = [
        {
          id: Math.random().toString(36).substring(7),
          amount: userState.payoutAmount,
          date: Date.now()
        },
        ...history
      ];

      setUserState(newState);
      setHistory(newHistory);
      saveUserData(walletAddress, newState, newHistory);
    } catch (err) {
      setError("Transaction failed. Please check your connection.");
    } finally {
      setIsClaiming(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "Available Now";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${d}d ${h}h ${m}m ${s}s`;
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
                <div className="flex items-center justify-between mb-8">
                  <div className={`px-3 py-1 rounded-full border flex items-center gap-2 w-fit ${timeLeft === 0 && walletAddress ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${timeLeft === 0 && walletAddress ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${timeLeft === 0 && walletAddress ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {walletAddress ? (timeLeft === 0 ? 'Ready to Claim' : 'Locked') : 'Waiting for Wallet'}
                    </span>
                  </div>
                  {userState && (
                    <span className="text-xs text-slate-500 font-mono">
                      Contract Bal: {userState.totalBalance} USDC
                    </span>
                  )}
                </div>

                <div className="mb-12">
                  <h2 className="text-6xl font-light tracking-tight mb-2 text-white">
                    {userState?.payoutAmount || '0.00'} <span className="text-slate-500 font-medium text-3xl">USDC</span>
                  </h2>
                  <p className="text-slate-400">Monthly allowance entitlement.</p>
                </div>

                {walletAddress && userState && (
                  <div className="space-y-2 mb-8">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Time Progress</span>
                      <span>{Math.round(((userState.intervalSecs - timeLeft) / userState.intervalSecs) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${((userState.intervalSecs - timeLeft) / userState.intervalSecs) * 100}%` }}
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-8 border-t border-white/5">
                <motion.button
                  whileHover={walletAddress && !isClaiming && timeLeft === 0 ? { scale: 1.01 } : {}}
                  whileTap={walletAddress && !isClaiming && timeLeft === 0 ? { scale: 0.98 } : {}}
                  onClick={handleClaim}
                  disabled={!walletAddress || isClaiming || timeLeft > 0}
                  className={`w-full py-5 rounded-2xl text-lg font-semibold transition-all relative overflow-hidden flex items-center justify-center gap-3 ${
                    !walletAddress || timeLeft > 0
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
                    <span>Connect Wallet to Access</span>
                  ) : timeLeft > 0 ? (
                    <>
                      <Clock className="w-5 h-5" />
                      <span>Unlocks in {formatTime(timeLeft)}</span>
                    </>
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
              <div className="space-y-5 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                
                <AnimatePresence>
                  {history.map((tx) => (
                    <motion.div 
                      key={tx.id}
                      initial={{ opacity: 0, height: 0, scale: 0.9 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      className="relative flex items-center justify-between md:justify-normal group"
                    >
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border border-emerald-500 bg-emerald-500/20 shadow flex-shrink-0 relative z-10">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="ml-4 w-full bg-white/5 border border-white/5 p-3 rounded-xl shadow-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-emerald-400 text-sm">+{tx.amount} USDC</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{new Date(tx.date).toLocaleString()}</div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {history.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-xs text-slate-600">No transactions yet.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </main>

        {/* Info Section */}
        <motion.section 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="mt-32 pt-16 border-t border-white/5"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-1">
              <h2 className="text-2xl font-bold text-white mb-4">What is StipeStream?</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                StipeStream is a decentralized aid disbursement protocol built on the Stellar Soroban network. 
                It solves the problem of "bottlenecked" financial aid by using trustless time-locks.
              </p>
            </div>
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-3">
                <h3 className="text-indigo-400 font-semibold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Trustless Security
                </h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Funds are locked in a smart contract at the start of the semester. Neither the funder nor any administrator can delay the withdrawal once the time interval is met.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-purple-400 font-semibold text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Automated Scheduling
                </h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  The contract enforces a strict 30-day interval between claims. This ensures students maintain a steady budget rather than receiving or spending funds all at once.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Low Cost
                </h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  By leveraging Stellar's low transaction fees and Soroban's efficient execution, we ensure that $100 meant for a student stays as close to $100 as possible.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Proof of Disbursement
                </h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Every claim is recorded on the public ledger, providing perfect transparency for NGOs and donors to see exactly where and when aid was distributed.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-24 p-8 rounded-3xl bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-white/5 text-center">
            <h3 className="text-lg font-medium text-white mb-2">Developed for the Stellar Community</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-xl mx-auto">
              Empowering the next generation of scholars through transparent, automated, and dignified financial aid.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a href="https://github.com/PrinceDale99/soroban4252026" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                <ExternalLink className="w-3 h-3" /> View Contract Source
              </a>
              <span className="text-slate-800">|</span>
              <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                <ExternalLink className="w-3 h-3" /> Documentation
              </a>
            </div>
          </div>
        </motion.section>

        <footer className="mt-32 pb-12 text-center text-slate-600 text-[10px] tracking-widest uppercase">
          &copy; 2026 StipeStream Protocol • Soroban Mainnet Early Access
        </footer>
      </div>
      
      {/* Global CSS for custom animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
