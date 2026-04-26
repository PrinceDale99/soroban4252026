import { useState, useEffect } from 'react';
import { isConnected, isAllowed, setAllowed, getAddress, getNetwork, signTransaction } from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';
import confetti from 'canvas-confetti';
import { Moon, Sun } from 'lucide-react';

const CONTRACT_ID = 'CCSUHUIWD7KLPACAVPROOFMUD6D3GPMEXJVXSRFB52BCVQHREKEH2YCV';
const RPC_URL = 'https://soroban-testnet.stellar.org';

// --- Protocol State Management ---
interface GlobalStats {
  tvl: number;
  distributedCount: number;
  activeStudents: number;
  donorImpact: string;
}

interface StudentState {
  payoutAmount: number;
  intervalSecs: number;
  lastClaimTime: number;
  totalBalance: number;
  isVerified: boolean;
}

const DEFAULT_GLOBAL: GlobalStats = {
  tvl: 0,
  distributedCount: 0,
  activeStudents: 0,
  donorImpact: 'New Supporter'
};

const DEFAULT_STUDENT: StudentState = {
  payoutAmount: 0,
  intervalSecs: 2592000,
  lastClaimTime: 0,
  totalBalance: 0,
  isVerified: false
};

function useProtocolState(walletAddress: string | null) {
  const [globalStats, setGlobalStats] = useState<GlobalStats>(DEFAULT_GLOBAL);
  const [studentState, setStudentState] = useState<StudentState>(DEFAULT_STUDENT);

  useEffect(() => {
    const savedGlobal = localStorage.getItem('stipestream_global');
    if (savedGlobal) setGlobalStats(JSON.parse(savedGlobal));

    if (walletAddress) {
      const savedStudent = localStorage.getItem(`stipestream_student_${walletAddress}`);
      if (savedStudent) setStudentState(JSON.parse(savedStudent));
      else setStudentState(DEFAULT_STUDENT);
    }
  }, [walletAddress]);

  const updateGlobal = (newStats: Partial<GlobalStats>) => {
    const updated = { ...globalStats, ...newStats };
    setGlobalStats(updated);
    localStorage.setItem('stipestream_global', JSON.stringify(updated));
  };

  const updateStudent = (newStudent: Partial<StudentState>) => {
    if (!walletAddress) return;
    const updated = { ...studentState, ...newStudent };
    setStudentState(updated);
    localStorage.setItem(`stipestream_student_${walletAddress}`, JSON.stringify(updated));
  };

  const executeRealSorobanTx = async (method: string, args: StellarSdk.xdr.ScVal[] = []) => {
    if (!walletAddress) throw new Error("Wallet not connected");
    const server = new StellarSdk.rpc.Server(RPC_URL);
    const contract = new StellarSdk.Contract(CONTRACT_ID);
    const sourceAccount = await server.getAccount(walletAddress);
    
    let tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: StellarSdk.Networks.TESTNET,
    })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

    const preparedTx = await server.prepareTransaction(tx);
    const signedXdr = await signTransaction(preparedTx.toXDR(), { network: 'TESTNET' });
    const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(signedXdr as string, StellarSdk.Networks.TESTNET);
    const sendResult = await server.sendTransaction(signedTransaction as any);
    
    if (sendResult.status !== "PENDING") throw new Error(`Failed to send: ${sendResult.status}`);
    return sendResult.hash;
  };

  const donorDeposit = async (amount: number, isNewStudent: boolean) => {
    try {
      const amountVal = StellarSdk.nativeToScVal(amount, { type: 'i128' });
      await executeRealSorobanTx('deposit', [amountVal]);
      
      updateGlobal({
        tvl: globalStats.tvl + amount,
        activeStudents: isNewStudent ? globalStats.activeStudents + 1 : globalStats.activeStudents,
        donorImpact: amount >= 10000 ? 'Visionary' : amount >= 1000 ? 'Patron' : 'Supporter'
      });
      if (walletAddress && studentState.totalBalance === 0) {
        updateStudent({ payoutAmount: Math.floor(amount / 6), totalBalance: amount, isVerified: true });
      } else if (walletAddress) {
        updateStudent({ totalBalance: studentState.totalBalance + amount });
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const studentClaim = async () => {
    if (!walletAddress || studentState.totalBalance < studentState.payoutAmount) return false;
    try {
      await executeRealSorobanTx('claim');
      const now = Math.floor(Date.now() / 1000);
      updateGlobal({
        tvl: Math.max(0, globalStats.tvl - studentState.payoutAmount),
        distributedCount: globalStats.distributedCount + 1
      });
      updateStudent({
        lastClaimTime: now,
        totalBalance: studentState.totalBalance - studentState.payoutAmount
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const verifyStudent = () => { updateStudent({ isVerified: true }); return true; };

  return { globalStats, studentState, donorDeposit, studentClaim, verifyStudent };
}

// --- Main Application ---
export default function App() {
  const [hasFreighter, setHasFreighter] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [view, setView] = useState<'landing' | 'student' | 'donor'>('landing');

  // Dark Mode State - Default to light unless explicitly saved as dark
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [txModal, setTxModal] = useState<{ show: boolean, status: 'pending' | 'success' | 'failed', message: string }>({ show: false, status: 'pending', message: '' });

  const { globalStats, studentState, donorDeposit, studentClaim, verifyStudent } = useProtocolState(walletAddress);

  useEffect(() => {
    const initFreighter = async () => {
      try {
        const result = await isConnected();
        const connected = typeof result === 'boolean' ? result : result.isConnected;
        setHasFreighter(connected);
        if (connected) {
          const allowedResult = await isAllowed();
          const allowed = typeof allowedResult === 'boolean' ? allowedResult : allowedResult.isAllowed;
          if (allowed) await fetchUserInfo();
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
      if (result && result.address) setWalletAddress(result.address);
    } catch (err) {
      console.error("Error fetching user info:", err);
    }
  };

  const handleConnect = async () => {
    setShowConnectModal(false);
    if (!hasFreighter) { window.open('https://freighter.app/', '_blank'); return; }
    try {
      const result = await setAllowed();
      const allowed = typeof result === 'boolean' ? result : result.isAllowed;
      if (allowed) await fetchUserInfo();
    } catch (err) { console.error("User denied connection", err); }
  };

  const formatAddress = (address: string) => address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '';

  const triggerTx = async (actionName: string, actionFn?: () => Promise<boolean> | boolean) => {
    setTxModal({ show: true, status: 'pending', message: `Please sign the transaction in your Freighter wallet...` });
    let success = true;
    if (actionFn) {
      try {
        const res = await actionFn();
        if (res === false) success = false;
      } catch(e) { success = false; }
    }
    if (success) {
      setTxModal({ show: true, status: 'success', message: `${actionName} confirmed! View on Stellar Explorer.` });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#E63946', '#1D4ED8', '#FACC15'] });
    } else {
      setTxModal({ show: true, status: 'failed', message: `Transaction failed or rejected. Please check your balance or permissions.` });
    }
  };

  return (
    <div className="min-h-screen bg-bauhaus-bg dark:bg-gray-950 text-bauhaus-black dark:text-gray-100 font-sans flex flex-col selection:bg-bauhaus-yellow relative transition-colors duration-300">
      
      {/* Responsive Bauhaus Header */}
      <header className="w-full flex flex-col md:flex-row border-b-4 md:border-b-8 border-bauhaus-black dark:border-gray-800 bg-bauhaus-white dark:bg-gray-900 sticky top-0 z-40 transition-colors duration-300">
        <div className="bg-bauhaus-red p-4 md:p-6 flex items-center justify-center cursor-pointer w-full md:w-auto md:min-w-[200px]" onClick={() => setView('landing')}>
          <div className="text-bauhaus-white text-xl md:text-2xl font-black uppercase tracking-[0.2em] leading-none text-center">
            Stipe<br className="hidden md:block"/>Stream
          </div>
        </div>
        
        <div className="flex-grow p-4 md:p-6 flex justify-center md:justify-start items-center overflow-x-auto border-b-4 border-bauhaus-black md:border-b-0 dark:border-gray-800">
          <nav className="flex gap-4 md:gap-8 text-[10px] md:text-xs font-bold tracking-[0.1em] md:tracking-[0.3em] uppercase">
            <button onClick={() => setView('landing')} className={`hover:text-bauhaus-red transition-colors whitespace-nowrap ${view === 'landing' ? 'text-bauhaus-red border-b-4 border-bauhaus-red pb-1' : ''}`}>Home</button>
            <button onClick={() => setView('student')} className={`hover:text-bauhaus-blue transition-colors whitespace-nowrap ${view === 'student' ? 'text-bauhaus-blue border-b-4 border-bauhaus-blue pb-1' : ''}`}>Scholar</button>
            <button onClick={() => setView('donor')} className={`hover:text-bauhaus-yellow transition-colors whitespace-nowrap ${view === 'donor' ? 'text-bauhaus-yellow border-b-4 border-bauhaus-yellow pb-1' : ''}`}>Sponsor</button>
          </nav>
        </div>

        <div className="bg-bauhaus-yellow dark:bg-yellow-500 p-2 md:p-6 flex items-center justify-center w-full md:w-auto gap-3 md:gap-4">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 border-2 md:border-4 border-bauhaus-black dark:border-gray-900 rounded-full hover:bg-white/20 transition-colors shrink-0">
            {isDarkMode ? <Sun className="w-4 h-4 text-gray-900" /> : <Moon className="w-4 h-4 text-bauhaus-black" />}
          </button>
          <button 
            onClick={() => walletAddress ? null : setShowConnectModal(true)}
            className="flex-grow md:w-auto bg-bauhaus-black dark:bg-gray-900 text-bauhaus-white font-bold text-[10px] md:text-xs tracking-[0.1em] md:tracking-[0.2em] uppercase px-3 py-2 md:px-4 md:py-3 hover:bg-gray-800 dark:hover:bg-black transition-colors truncate"
          >
            {walletAddress ? formatAddress(walletAddress) : 'Connect Wallet'}
          </button>
        </div>
      </header>

      <main className="flex-grow bauhaus-container w-full">
        {view === 'landing' && <LandingView setView={setView} globalStats={globalStats} />}
        {view === 'student' && <StudentDashboard triggerTx={triggerTx} state={studentState} verifyFn={verifyStudent} claimFn={studentClaim} walletAddress={walletAddress} />}
        {view === 'donor' && <DonorDashboard triggerTx={triggerTx} depositFn={donorDeposit} globalStats={globalStats} />}
      </main>

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-bauhaus-white dark:bg-gray-900 border-4 md:border-8 border-bauhaus-black dark:border-gray-700 p-6 md:p-8 w-full max-w-md">
            <h2 className="text-xl md:text-2xl font-black uppercase mb-4 tracking-widest text-bauhaus-blue dark:text-blue-400">Connect Wallet</h2>
            <p className="text-[10px] md:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-6">StipeStream is exclusively built on Stellar Soroban.</p>
            <div className="space-y-4">
              <button onClick={handleConnect} className="w-full border-4 border-bauhaus-black dark:border-gray-700 p-4 font-bold uppercase tracking-widest hover:bg-bauhaus-black hover:text-white dark:hover:bg-gray-800 transition-colors flex justify-between items-center text-xs md:text-sm">
                <span>Freighter Wallet</span>
                {hasFreighter ? <span className="w-3 h-3 bg-green-500 rounded-full"></span> : <span className="text-[10px] text-gray-400">Install</span>}
              </button>
            </div>
            <button onClick={() => setShowConnectModal(false)} className="mt-8 text-[10px] md:text-xs font-bold uppercase tracking-widest underline w-full text-center hover:text-bauhaus-red">Cancel</button>
          </div>
        </div>
      )}

      {/* Tx Modal */}
      {txModal.show && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`border-4 md:border-8 border-bauhaus-black dark:border-gray-700 p-6 md:p-10 w-full max-w-md ${txModal.status === 'success' ? 'bg-bauhaus-white dark:bg-gray-900' : txModal.status === 'failed' ? 'bg-bauhaus-red text-white' : 'bg-bauhaus-yellow dark:bg-yellow-500 text-bauhaus-black'}`}>
            <h2 className="text-2xl md:text-3xl font-black uppercase mb-4 tracking-widest">
              {txModal.status === 'pending' ? 'Sign Tx...' : txModal.status === 'success' ? 'Success!' : 'Failed'}
            </h2>
            <p className="font-bold text-xs md:text-sm tracking-widest uppercase opacity-80 mb-8">{txModal.message}</p>
            {txModal.status !== 'pending' && (
              <button onClick={() => setTxModal({ ...txModal, show: false })} className="bg-bauhaus-black dark:bg-gray-800 text-bauhaus-white font-bold uppercase tracking-[0.2em] px-8 py-4 w-full text-xs md:text-sm">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Views ---

function LandingView({ setView, globalStats }: { setView: (v: any) => void, globalStats: GlobalStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 animate-in fade-in duration-700">
      
      <div className="col-span-1 md:col-span-9 flex flex-col justify-center mb-4 md:mb-8 border-l-4 md:border-l-8 border-bauhaus-red pl-6 md:pl-16 py-8 md:py-12">
        <h3 className="text-bauhaus-red dark:text-red-400 font-bold tracking-[0.2em] md:tracking-[0.4em] uppercase mb-4 md:mb-6 text-[10px] md:text-sm">Why Web3? Because transparency matters.</h3>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black uppercase leading-tight md:leading-[1.1]">
          Transparent, Global Scholarships Powered by the Blockchain.
        </h1>
        <p className="mt-6 md:mt-8 text-sm md:text-lg font-bold uppercase tracking-widest max-w-2xl text-gray-600 dark:text-gray-400">
          Faster cross-border payments. Absolute transparency. Programmable milestones without the crypto jargon.
        </p>
      </div>

      <div className="col-span-1 md:col-span-3 flex items-center justify-center hidden md:flex">
        <div className="w-full h-full min-h-[200px] md:min-h-[300px] bg-bauhaus-blue rounded-full"></div>
      </div>

      <div className="col-span-1 md:col-span-12 mt-4 md:mt-8 mb-2 md:mb-4 border-t-4 md:border-t-8 border-bauhaus-black dark:border-gray-800 pt-6 md:pt-8">
        <h2 className="text-xl md:text-2xl font-black uppercase tracking-[0.2em] md:mb-8 text-center md:text-left">Live Treasury Stats</h2>
      </div>

      <div className="col-span-1 md:col-span-4 bg-bauhaus-white dark:bg-gray-800 border-l-4 md:border-l-8 border-bauhaus-blue p-6 md:p-10 shadow-lg md:shadow-none">
        <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gray-400 mb-4 md:mb-6">Total Funds Locked (TVL)</div>
        <div className="text-3xl md:text-5xl font-black mb-1 md:mb-2 text-bauhaus-blue dark:text-blue-400">{globalStats.tvl.toLocaleString()}</div>
        <div className="text-xs md:text-sm font-bold tracking-widest text-bauhaus-black dark:text-gray-300">USDC</div>
      </div>

      <div className="col-span-1 md:col-span-4 bg-bauhaus-black dark:bg-gray-900 text-bauhaus-white p-6 md:p-10 shadow-lg md:shadow-none">
        <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gray-400 mb-4 md:mb-6">Scholarships Distributed</div>
        <div className="text-3xl md:text-5xl font-black mb-1 md:mb-2 text-bauhaus-yellow">{globalStats.distributedCount.toLocaleString()}</div>
        <div className="text-xs md:text-sm font-bold tracking-widest text-gray-300">SUCCESSFUL CLAIMS</div>
      </div>

      <div className="col-span-1 md:col-span-4 bg-bauhaus-yellow dark:bg-yellow-500 p-6 md:p-10 flex flex-col justify-between shadow-lg md:shadow-none">
        <div>
          <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-bauhaus-black mb-4 md:mb-6">Active Students</div>
          <div className="text-3xl md:text-5xl font-black mb-1 md:mb-2 text-bauhaus-black">{globalStats.activeStudents.toLocaleString()}</div>
        </div>
        <button onClick={() => setView('donor')} className="bg-bauhaus-black dark:bg-gray-900 text-bauhaus-white font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs px-4 md:px-6 py-3 md:py-4 hover:bg-gray-800 transition-colors mt-6 md:mt-8 w-full">
          Fund a Scholar
        </button>
      </div>

      <div className="col-span-1 md:col-span-12 border-4 border-bauhaus-black dark:border-gray-800 py-6 md:py-8 mt-8 md:mt-12 flex justify-center items-center bg-bauhaus-white dark:bg-gray-800 px-4 md:px-8">
        <div className="text-center">
          <span className="font-black uppercase tracking-widest text-[10px] md:text-xs text-gray-400 block mb-1 md:mb-2 text-center">Built On</span>
          <span className="text-sm md:text-xl font-bold uppercase tracking-wider text-bauhaus-black dark:text-white block text-center">Stellar Soroban</span>
        </div>
      </div>
    </div>
  );
}

function StudentDashboard({ triggerTx, state, verifyFn, claimFn, walletAddress }: { triggerTx: any, state: StudentState, verifyFn: any, claimFn: any, walletAddress: string | null }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const unlockTime = state.lastClaimTime + state.intervalSecs;
      const remaining = Math.max(0, unlockTime - now);
      setTimeLeft(state.lastClaimTime === 0 ? 0 : remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "Ready";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    return `${d}d ${h}h`;
  };

  const isClaimReady = walletAddress && state.isVerified && timeLeft === 0 && state.totalBalance >= state.payoutAmount && state.payoutAmount > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-0 animate-in fade-in duration-700 bg-bauhaus-white dark:bg-gray-800 shadow-2xl border-4 md:border-8 border-bauhaus-black dark:border-gray-700">
      <div className="col-span-1 md:col-span-7 p-6 md:p-12 border-b-4 md:border-b-0 md:border-r-8 border-bauhaus-black dark:border-gray-700 bg-bauhaus-bg dark:bg-gray-900">
        <h1 className="text-3xl md:text-4xl font-black uppercase mb-8 md:mb-12 leading-none text-bauhaus-blue dark:text-blue-400">Scholar<br/>Dashboard</h1>
        
        <div className="mb-8 md:mb-12 bg-bauhaus-white dark:bg-gray-800 border-4 border-bauhaus-black dark:border-gray-700 p-6 md:p-8">
          <h2 className="text-lg md:text-xl font-black uppercase tracking-[0.2em] mb-4">DID / KYC Profile</h2>
          <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-6">zk-Proof Verification: Prove student status securely on-chain.</p>
          
          {state.isVerified ? (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-bauhaus-blue rounded-full flex items-center justify-center text-white font-black text-lg md:text-xl">✓</div>
              <div>
                <div className="font-bold uppercase tracking-widest text-xs md:text-sm">Verified Scholar</div>
                <div className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">University Program</div>
              </div>
            </div>
          ) : (
            <button onClick={() => triggerTx('Identity Verification', verifyFn)} className="bg-bauhaus-blue dark:bg-blue-600 text-white font-bold uppercase tracking-widest text-xs py-3 md:py-4 px-4 w-full border-2 border-bauhaus-black dark:border-gray-900">
              Verify Student ID
            </button>
          )}
        </div>

        <div>
          <h2 className="text-lg md:text-xl font-black uppercase tracking-[0.2em] mb-4 md:mb-6">Tranche Progress</h2>
          <div className="space-y-4 md:space-y-6">
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div><span className="text-[10px] md:text-xs font-bold inline-block uppercase text-bauhaus-red dark:text-red-400 tracking-widest">Available Balance</span></div>
                <div className="text-right"><span className="text-[10px] md:text-xs font-bold inline-block text-bauhaus-red dark:text-red-400">{state.totalBalance} USDC</span></div>
              </div>
              <div className="overflow-hidden h-3 md:h-4 mb-4 text-xs flex rounded-none bg-gray-200 dark:bg-gray-700 border-2 border-bauhaus-black dark:border-gray-600">
                <div style={{ width: "100%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-bauhaus-red"></div>
              </div>
            </div>
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div><span className="text-[10px] md:text-xs font-bold inline-block uppercase text-bauhaus-blue dark:text-blue-400 tracking-widest">Next Unlock Timer</span></div>
                <div className="text-right"><span className="text-[10px] md:text-xs font-bold inline-block text-bauhaus-blue dark:text-blue-400">{formatTime(timeLeft)}</span></div>
              </div>
              <div className="overflow-hidden h-3 md:h-4 mb-4 text-xs flex rounded-none bg-gray-200 dark:bg-gray-700 border-2 border-bauhaus-black dark:border-gray-600">
                <div style={{ width: state.lastClaimTime === 0 ? "100%" : `${Math.max(0, 100 - (timeLeft / state.intervalSecs) * 100)}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-bauhaus-blue transition-all duration-1000"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-1 md:col-span-5 flex flex-col">
        <div className="p-6 md:p-12 flex-grow bg-bauhaus-white dark:bg-gray-800">
          <h2 className="text-lg md:text-xl font-black tracking-[0.2em] uppercase mb-6 md:mb-8">Claim Funds</h2>
          
          <div className="bg-bauhaus-yellow dark:bg-yellow-500 border-4 border-bauhaus-black dark:border-gray-700 p-6 md:p-8 text-center mb-6 md:mb-8 text-bauhaus-black">
            <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest mb-2">Available to Withdraw</div>
            <div className="text-4xl md:text-5xl font-black mb-2">{state.payoutAmount.toLocaleString()}</div>
            <div className="text-xs md:text-sm font-bold tracking-widest uppercase mb-4">USDC</div>
            <div className="text-[10px] md:text-xs font-black tracking-[0.2em] bg-bauhaus-white dark:bg-gray-100 inline-block px-3 py-1 md:px-4 md:py-2 border-2 border-bauhaus-black text-bauhaus-black">
              ~ ${state.payoutAmount.toLocaleString()} USD
            </div>
          </div>

          <div className="text-center mb-6 md:mb-8">
             <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 mb-2">Gas Fee Handling</p>
             <p className="text-[10px] md:text-xs font-bold text-bauhaus-blue dark:text-blue-400 uppercase tracking-widest border border-bauhaus-blue p-2 inline-block">
               Gas sponsored by StipeStream. You pay 0 XLM.
             </p>
          </div>

          <button 
            onClick={() => triggerTx('Scholarship Claim', claimFn)} 
            disabled={!isClaimReady}
            className={`w-full font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-xs md:text-sm py-4 md:py-6 transition-colors border-4 border-bauhaus-black dark:border-gray-700 mb-6 ${isClaimReady ? 'bg-bauhaus-red text-white hover:bg-[#d62828] cursor-pointer' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
          >
            {isClaimReady ? `Claim ${state.payoutAmount} USDC via Smart Contract` : !state.isVerified ? 'Verify ID First' : state.payoutAmount === 0 ? 'No Stipend Active' : 'Locked'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DonorDashboard({ triggerTx, depositFn, globalStats }: { triggerTx: any, depositFn: any, globalStats: GlobalStats }) {
  const [amount, setAmount] = useState<number>(1000);

  const handleDeposit = async () => { return await depositFn(amount, true); };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 animate-in fade-in duration-700">
      <div className="col-span-1 md:col-span-12 flex flex-col md:flex-row items-start md:items-center justify-between mb-4 border-b-4 md:border-b-8 border-bauhaus-black dark:border-gray-800 pb-6 md:pb-8">
        <h1 className="text-2xl sm:text-4xl md:text-7xl font-black uppercase leading-none text-bauhaus-red dark:text-red-400">Sponsor<br className="hidden md:block"/>Dashboard</h1>
        <div className="mt-2 md:mt-0 text-left md:text-right">
          <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gray-500 dark:text-gray-400 mb-1 md:mb-2">Your Impact</div>
          <div className="text-lg md:text-2xl font-black uppercase tracking-widest text-bauhaus-black dark:text-white">{globalStats.donorImpact}</div>
        </div>
      </div>

      <div className="col-span-1 md:col-span-12 bg-bauhaus-white dark:bg-gray-800 p-6 md:p-12 border-4 border-bauhaus-black dark:border-gray-700 overflow-hidden">
        <h2 className="text-lg md:text-xl font-bold tracking-[0.2em] uppercase mb-8 md:mb-12">Fund Allocation</h2>
        
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
           <div className="bg-bauhaus-blue dark:bg-blue-800 p-4 md:p-6 text-center text-white w-full border-4 border-bauhaus-black dark:border-gray-900">
             <div className="text-[10px] md:text-xs font-bold tracking-widest uppercase mb-1 md:mb-2">Treasury Volume</div>
             <div className="text-xl md:text-2xl font-black">{globalStats.tvl.toLocaleString()} USDC</div>
           </div>
           
           <div className="hidden lg:block w-8 h-1 bg-bauhaus-black dark:bg-gray-600"></div>
           <div className="lg:hidden w-1 h-6 bg-bauhaus-black dark:bg-gray-600"></div>

           <div className="flex flex-col sm:flex-row lg:flex-col gap-4 w-full">
             <div className="bg-bauhaus-white dark:bg-gray-900 border-4 border-bauhaus-black dark:border-gray-700 p-3 md:p-4 text-center flex-1">
                <div className="text-[10px] md:text-xs font-bold tracking-widest uppercase text-bauhaus-red dark:text-red-400">Available</div>
                <div className="font-black text-xs md:text-base">{Math.floor(globalStats.tvl * 0.8).toLocaleString()} USDC</div>
             </div>
             <div className="bg-bauhaus-white dark:bg-gray-900 border-4 border-bauhaus-black dark:border-gray-700 p-3 md:p-4 text-center flex-1">
                <div className="text-[10px] md:text-xs font-bold tracking-widest uppercase text-bauhaus-yellow dark:text-yellow-500">Distributed</div>
                <div className="font-black text-xs md:text-base">{globalStats.distributedCount.toLocaleString()} Claims</div>
             </div>
           </div>

           <div className="hidden lg:block w-8 h-1 bg-bauhaus-black dark:bg-gray-600"></div>
           <div className="lg:hidden w-1 h-6 bg-bauhaus-black dark:bg-gray-600"></div>

           <div className="bg-bauhaus-red dark:bg-red-700 text-white p-4 md:p-6 text-center w-full border-4 border-bauhaus-black dark:border-gray-900">
             <div className="text-[10px] md:text-xs font-bold tracking-widest uppercase mb-1 md:mb-2">Active Students</div>
             <div className="text-lg md:text-2xl font-black">{globalStats.activeStudents.toLocaleString()} Scholars</div>
           </div>
        </div>
      </div>

      <div className="col-span-1 md:col-span-8 bg-bauhaus-blue dark:bg-blue-800 text-white p-6 md:p-12 border-4 border-bauhaus-black dark:border-gray-700">
        <h2 className="text-lg md:text-xl font-bold tracking-[0.2em] uppercase mb-6 md:mb-8">One-Click Funding</h2>
        <div className="flex flex-col sm:flex-row gap-6">
           <div className="flex-1">
             <label className="block text-[10px] md:text-xs font-bold tracking-[0.1em] md:tracking-[0.2em] uppercase mb-2 md:mb-4 text-bauhaus-yellow">Select Pool</label>
             <select className="w-full bg-transparent border-b-4 border-white p-2 md:p-4 text-sm md:text-xl font-bold focus:outline-none appearance-none">
               <option className="text-black">General Scholarship</option>
               <option className="text-black">STEM Scholars</option>
             </select>
           </div>
           <div className="flex-1">
             <label className="block text-[10px] md:text-xs font-bold tracking-[0.1em] md:tracking-[0.2em] uppercase mb-2 md:mb-4 text-bauhaus-red dark:text-red-300">Deposit Amount (USDC)</label>
             <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="w-full bg-transparent border-b-4 border-white p-2 md:p-4 text-sm md:text-xl font-bold focus:outline-none" />
           </div>
        </div>
        <button onClick={() => triggerTx('Smart Contract Deposit', handleDeposit)} className="mt-6 md:mt-12 bg-bauhaus-yellow text-bauhaus-black font-black uppercase tracking-[0.1em] md:tracking-[0.2em] py-3 md:py-6 px-4 md:px-12 border-4 border-bauhaus-black hover:bg-white transition-colors cursor-pointer w-full text-[10px] md:text-sm">
          Fund Protocol via Soroban
        </button>
      </div>

      <div className="col-span-1 md:col-span-4 bg-bauhaus-yellow dark:bg-yellow-500 text-bauhaus-black p-6 md:p-12 border-4 border-bauhaus-black dark:border-gray-700 flex flex-col justify-center items-center text-center">
        <h2 className="text-lg md:text-xl font-bold tracking-[0.2em] uppercase mb-6 md:mb-8">Impact NFT</h2>
        <div className="w-32 h-32 md:w-48 md:h-48 border-4 md:border-8 border-bauhaus-black bg-bauhaus-white relative mb-6 md:mb-8 overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1/2 bg-bauhaus-red group-hover:h-3/4 transition-all duration-1000"></div>
          <div className="absolute bottom-0 right-0 w-1/2 h-full bg-bauhaus-blue group-hover:w-3/4 transition-all duration-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 md:w-16 md:h-16 bg-bauhaus-yellow rounded-full border-4 border-bauhaus-black flex items-center justify-center font-black text-xs md:text-base">{globalStats.activeStudents}</div>
        </div>
        <p className="text-[10px] md:text-xs font-bold tracking-widest uppercase leading-relaxed md:leading-loose px-2">
          This digital badge updates dynamically as you fund more students (currently {globalStats.activeStudents}).
        </p>
      </div>
    </div>
  );
}
