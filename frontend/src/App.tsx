import { useState, useEffect } from 'react';
import { isConnected, isAllowed, setAllowed, getAddress, signTransaction } from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';
import confetti from 'canvas-confetti';
import { Moon, Sun } from 'lucide-react';

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || 'CCSUHUIWD7KLPACAVPROOFMUD6D3GPMEXJVXSRFB52BCVQHREKEH2YCV';
const RPC_URL = import.meta.env.VITE_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

// Fee Sponsorship Config
// Set VITE_SPONSOR_SECRET in your .env file to enable gasless transactions.
// The sponsor account pays all XLM transaction fees on behalf of scholars.
const SPONSOR_SECRET = import.meta.env.VITE_SPONSOR_SECRET as string | undefined;
const hasSponsor = !!SPONSOR_SECRET;

// Multi-Signature Logic
interface MultiSigSigner { address: string; label: string; weight: number; }
interface MultiSigConfig {
  isEnabled: boolean;
  signers: MultiSigSigner[];
  medThreshold: number;   // weight needed for deposits < HIGH_VALUE
  highThreshold: number;  // weight needed for deposits >= HIGH_VALUE
  highValueThreshold: number;
}
interface MultiSigProposal {
  id: string;
  amount: number;
  isOnboarding: boolean;
  proposedBy: string;
  proposedByLabel: string;
  proposedAt: number;
  approvals: string[];
  status: 'pending' | 'approved' | 'executed' | 'rejected';
}

const DEFAULT_MULTISIG: MultiSigConfig = {
  isEnabled: true,
  signers: [
    { address: 'G_DEMO_ACCOUNT_123',                                           label: 'NGO Director (You)',  weight: 2 },
    { address: 'GBOJN4A72VBGZJMJBJ7P2UVGKERZRVRTDVZ57CGBLVNBW333WSPPZF5E', label: 'Board Chair',         weight: 1 },
    { address: 'GCCPBOUQK45AYSLFBRJPFA7ROM47XQOOB437XCCHBJ4Q5EVZ4GZMGSR4', label: 'Finance Officer',     weight: 1 },
  ],
  medThreshold: 2,
  highThreshold: 3,
  highValueThreshold: 5000,
};

// Account Abstraction
interface AbstractWallet { type: 'passkey' | 'email'; address: string; label: string; credentialId?: string; }

// Protocol State Management
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

function useProtocolState(walletAddress: string | null, isDemoMode: boolean) {
  const [globalStats, setGlobalStats] = useState<GlobalStats>(DEFAULT_GLOBAL);
  const [studentState, setStudentState] = useState<StudentState>(DEFAULT_STUDENT);

  useEffect(() => {
    const globalKey = isDemoMode ? 'stipestream_demo_global' : 'stipestream_global';
    const savedGlobal = localStorage.getItem(globalKey);
    if (savedGlobal) setGlobalStats(JSON.parse(savedGlobal));
    else if (isDemoMode) setGlobalStats({ tvl: 12500, distributedCount: 42, activeStudents: 15, donorImpact: 'Demo Patron' });

    if (walletAddress) {
      const studentKey = isDemoMode ? `stipestream_demo_student_${walletAddress}` : `stipestream_student_${walletAddress}`;
      const savedStudent = localStorage.getItem(studentKey);
      if (savedStudent) setStudentState(JSON.parse(savedStudent));
      else if (isDemoMode && walletAddress === "G_DEMO_ACCOUNT_123") {
        setStudentState({ payoutAmount: 250, intervalSecs: 2592000, lastClaimTime: 0, totalBalance: 1500, isVerified: true });
      } else {
        setStudentState(DEFAULT_STUDENT);
      }
    }
  }, [walletAddress, isDemoMode]);

  const updateGlobal = (newStats: Partial<GlobalStats>) => {
    const updated = { ...globalStats, ...newStats };
    setGlobalStats(updated);
    const key = isDemoMode ? 'stipestream_demo_global' : 'stipestream_global';
    localStorage.setItem(key, JSON.stringify(updated));
  };

  const updateStudent = (newStudent: Partial<StudentState>) => {
    if (!walletAddress) return;
    const updated = { ...studentState, ...newStudent };
    setStudentState(updated);
    const key = isDemoMode ? `stipestream_demo_student_${walletAddress}` : `stipestream_student_${walletAddress}`;
    localStorage.setItem(key, JSON.stringify(updated));
  };

  const executeRealSorobanTx = async (method: string, args: StellarSdk.xdr.ScVal[] = []) => {
    if (isDemoMode) {
      await new Promise(r => setTimeout(r, 1500)); // Simulate network lag
      return "demo_tx_hash_" + Math.random().toString(36).substring(7);
    }
    if (!walletAddress) throw new Error("Wallet not connected");

    const server = new StellarSdk.rpc.Server(RPC_URL);
    const contract = new StellarSdk.Contract(CONTRACT_ID);

    // Fee Sponsorship: Fee Bump Transaction
    // Inner transaction uses the student's account. Outer FeeBumpTransaction
    // uses the sponsor's account to cover all XLM gas fees.
    const sourceAccount = await server.getAccount(walletAddress);

    // Step 1: Build inner transaction with minimum fee.
    const innerTx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE, // Minimum; sponsor will pay the real fee via fee bump
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    // Step 2: Soroban simulation — calculates resource fees and pads the transaction
    const preparedInnerTx = await server.prepareTransaction(innerTx);

    // Step 3: Student signs the inner transaction with Freighter (authorizing the operation)
    const signResult = await signTransaction(preparedInnerTx.toXDR(), {
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });
    const signedXdr = typeof signResult === 'string' ? signResult : (signResult as any).signedTxXdr;
    const signedInnerTx = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      StellarSdk.Networks.TESTNET
    ) as StellarSdk.Transaction;

    if (hasSponsor && SPONSOR_SECRET) {
      // Step 4 (Sponsored): Build Fee Bump transaction — sponsor is fee_source
      // maxFee covers the fee bump envelope. Must be >= fee of inner tx.
      const sponsorKeypair = StellarSdk.Keypair.fromSecret(SPONSOR_SECRET);

      const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
        sponsorKeypair,          // fee_source: sponsor pays XLM gas
        "10000",                 // max_fee: maximum stroops sponsor will pay for this bump
        signedInnerTx,           // inner_tx: student-signed operation
        StellarSdk.Networks.TESTNET
      );

      // Step 5: Sponsor signs the fee bump envelope
      feeBumpTx.sign(sponsorKeypair);

      // Step 6: Submit the fee bump transaction
      const sendResult = await server.sendTransaction(feeBumpTx as any);
      if (sendResult.status !== "PENDING") throw new Error(`Fee bump failed: ${sendResult.status}`);
      return sendResult.hash;
    } else {
      // Fallback: No sponsor configured — student pays their own fees
      const sendResult = await server.sendTransaction(signedInnerTx as any);
      if (sendResult.status !== "PENDING") throw new Error(`Transaction failed: ${sendResult.status}`);
      return sendResult.hash;
    }
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

// Helpers
const formatAddress = (address: string) => address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '';
const formatCompact = (num: number) => Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);

// Main Application Component
export default function App() {
  const [hasFreighter, setHasFreighter] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [view, setView] = useState<'landing' | 'student' | 'donor'>('landing');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);

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

  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showLargeDonationConfirm, setShowLargeDonationConfirm] = useState<{ show: boolean, amount: number, callback: () => void }>({ show: false, amount: 0, callback: () => {} });
  const [txModal, setTxModal] = useState<{ show: boolean, status: 'pending' | 'success' | 'failed', message: string }>({ show: false, status: 'pending', message: '' });
  const { globalStats, studentState, donorDeposit, studentClaim, verifyStudent } = useProtocolState(walletAddress, isDemoMode);

  // --- Multi-Sig State ---
  const msKey = isDemoMode ? 'stipestream_demo_proposals' : 'stipestream_proposals';
  const [multiSigConfig] = useState<MultiSigConfig>(() => {
    const s = localStorage.getItem('stipestream_multisig_config'); return s ? JSON.parse(s) : DEFAULT_MULTISIG;
  });
  const [proposals, setProposals] = useState<MultiSigProposal[]>(() => {
    const s = localStorage.getItem(msKey); return s ? JSON.parse(s) : [];
  });
  const saveProposals = (next: MultiSigProposal[]) => {
    setProposals(next); localStorage.setItem(msKey, JSON.stringify(next));
  };
  const signerWeight = (addr: string) => multiSigConfig.signers.find(s => s.address === addr)?.weight ?? 0;
  const proposalWeight = (p: MultiSigProposal) => p.approvals.reduce((s, a) => s + signerWeight(a), 0);
  const requiredWeight = (amount: number) => amount >= multiSigConfig.highValueThreshold ? multiSigConfig.highThreshold : multiSigConfig.medThreshold;
  const createProposal = (amount: number, isOnboarding: boolean) => {
    const addr = walletAddress || 'unknown';
    const lbl = multiSigConfig.signers.find(s => s.address === addr)?.label || 'Admin';
    const p: MultiSigProposal = { id: 'p_' + Date.now(), amount, isOnboarding, proposedBy: addr, proposedByLabel: lbl, proposedAt: Date.now(), approvals: [addr], status: 'pending' };
    const w = signerWeight(addr); const r = requiredWeight(amount);
    if (w >= r) p.status = 'approved';
    saveProposals([...proposals, p]); return p;
  };
  const approveProposal = (id: string) => {
    if (!walletAddress) return;
    const next = proposals.map(p => {
      if (p.id !== id || p.status !== 'pending' || p.approvals.includes(walletAddress)) return p;
      const approvals = [...p.approvals, walletAddress];
      const w = approvals.reduce((s, a) => s + signerWeight(a), 0);
      return { ...p, approvals, status: w >= requiredWeight(p.amount) ? 'approved' as const : 'pending' as const };
    }); saveProposals(next);
  };
  const rejectProposal = (id: string) => saveProposals(proposals.map(p => p.id === id ? { ...p, status: 'rejected' as const } : p));
  const executeProposal = async (id: string) => {
    const p = proposals.find(x => x.id === id);
    if (!p || p.status !== 'approved') return;
    await triggerTx('Multi-Sig Deposit', () => donorDeposit(p.amount, p.isOnboarding));
    saveProposals(proposals.map(x => x.id === id ? { ...x, status: 'executed' as const } : x));
  };

  // Account Abstraction State
  const [, setAbstractWallet] = useState<AbstractWallet | null>(() => {
    const s = localStorage.getItem('stipestream_abstract_wallet'); return s ? JSON.parse(s) : null;
  });
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const connectWithPasskey = async () => {
    if (!window.PublicKeyCredential) { alert('Passkeys not supported in this browser.'); return; }
    try {
      const existId = localStorage.getItem('stipestream_passkey_id');
      if (existId) {
        try {
          await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ id: Uint8Array.from(atob(existId), c => c.charCodeAt(0)), type: 'public-key' }], timeout: 60000, userVerification: 'preferred' } });
          const saved = localStorage.getItem('stipestream_abstract_wallet');
          if (saved) { const w: AbstractWallet = JSON.parse(saved); setAbstractWallet(w); setWalletAddress(w.address); setShowConnectModal(false); return; }
        } catch (_) { localStorage.removeItem('stipestream_passkey_id'); }
      }
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'StipeStream', id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'scholar@stipestream.app', displayName: 'StipeStream Scholar' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' }, timeout: 60000,
      } }) as PublicKeyCredential;
      const kp = StellarSdk.Keypair.random();
      const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      localStorage.setItem('stipestream_passkey_id', credId);
      localStorage.setItem(`stipestream_abs_secret_${kp.publicKey()}`, kp.secret());
      const w: AbstractWallet = { type: 'passkey', address: kp.publicKey(), label: 'Passkey Scholar', credentialId: credId };
      localStorage.setItem('stipestream_abstract_wallet', JSON.stringify(w));
      setAbstractWallet(w); setWalletAddress(kp.publicKey()); setShowConnectModal(false);
      fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`).catch(() => {});
    } catch (err: any) { if (err?.name !== 'NotAllowedError') console.error('Passkey error:', err); }
  };
  const connectWithEmail = (email: string) => {
    const norm = email.toLowerCase().trim();
    const stored = localStorage.getItem(`stipestream_email_kp_${norm}`);
    const kp = stored ? StellarSdk.Keypair.fromSecret(stored) : StellarSdk.Keypair.random();
    if (!stored) localStorage.setItem(`stipestream_email_kp_${norm}`, kp.secret());
    const w: AbstractWallet = { type: 'email', address: kp.publicKey(), label: norm };
    localStorage.setItem('stipestream_abstract_wallet', JSON.stringify(w));
    setAbstractWallet(w); setWalletAddress(kp.publicKey());
    setShowConnectModal(false); setShowEmailForm(false); setEmailInput('');
    fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`).catch(() => {});
  };

  useEffect(() => {
    (window as any).confirmLargeDonation = (amount: number, callback: () => void) => {
      setShowLargeDonationConfirm({ show: true, amount, callback });
    };
  }, []);

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
      if (result && result.address) {
        setWalletAddress(result.address);
        
        // Fetch XLM Balance from Horizon Testnet
        try {
          const horizonServer = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
          const account = await horizonServer.loadAccount(result.address);
          const nativeBalance = account.balances.find(b => b.asset_type === 'native')?.balance;
          if (nativeBalance) setXlmBalance(nativeBalance);
        } catch (balErr) {
          console.error("Error fetching XLM balance:", balErr);
          setXlmBalance("0.00"); // Default if account not found/funded
        }
      }
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


  const triggerTx = async (actionName: string, actionFn?: () => Promise<boolean> | boolean) => {
    const pendingMsg = isDemoMode ? `Simulating ${actionName} on Soroban...` : `Awaiting Freighter Signature for ${actionName}...`;
    setTxModal({ show: true, status: 'pending', message: pendingMsg });
    let success = true;
    if (actionFn) {
      try {
        const res = await actionFn();
        if (res === false) success = false;
      } catch (e) { success = false; }
    }
    if (success) {
      setTxModal({ show: true, status: 'success', message: `${actionName} confirmed! View on Stellar Explorer.` });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#E63946', '#1D4ED8', '#FACC15'] });
      // Refresh balance after successful transaction
      await fetchUserInfo();
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
            Stipe<br className="hidden md:block" />Stream
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
          <div className="flex flex-col gap-1">
            <button 
              onClick={() => {
                if (!isDemoMode) setShowDemoModal(true);
                setIsDemoMode(!isDemoMode);
                if (!walletAddress && !isDemoMode) setWalletAddress("G_DEMO_ACCOUNT_123");
              }} 
              className={`px-3 py-2 border-2 border-bauhaus-black dark:border-gray-900 font-black text-[8px] md:text-[10px] uppercase tracking-widest transition-colors ${isDemoMode ? 'bg-bauhaus-red text-white' : 'bg-bauhaus-white text-bauhaus-black hover:bg-gray-100'}`}
            >
              {isDemoMode ? 'Demo ON' : 'Demo Mode'}
            </button>
            {isDemoMode && (
              <button 
                onClick={() => {
                  const currentIndex = DEFAULT_MULTISIG.signers.findIndex(s => s.address === walletAddress);
                  const nextIndex = (currentIndex + 1) % DEFAULT_MULTISIG.signers.length;
                  setWalletAddress(DEFAULT_MULTISIG.signers[nextIndex].address);
                }}
                className="bg-bauhaus-blue text-white text-[7px] font-black uppercase tracking-tighter py-1 border-2 border-bauhaus-black hover:bg-blue-700 transition-all"
              >
                Cycle Role ↻
              </button>
            )}
          </div>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 border-2 md:border-4 border-bauhaus-black dark:border-gray-900 rounded-full hover:bg-white/20 transition-colors shrink-0">
            {isDarkMode ? <Sun className="w-4 h-4 text-gray-900" /> : <Moon className="w-4 h-4 text-bauhaus-black" />}
          </button>
          <button 
            onClick={() => {
              if (walletAddress === "G_DEMO_ACCOUNT_123") {
                setWalletAddress(null);
                setIsDemoMode(false);
              } else if (walletAddress) {
                setShowDisconnectConfirm(true);
              } else {
                setShowConnectModal(true);
              }
            }}
            className="flex-grow md:w-auto bg-bauhaus-black dark:bg-gray-900 text-bauhaus-white font-bold text-[10px] md:text-xs tracking-[0.1em] md:tracking-[0.2em] uppercase px-3 py-2 md:px-4 md:py-3 hover:bg-bauhaus-red dark:hover:bg-red-700 transition-colors truncate group relative grid"
            title={walletAddress ? "Click to Disconnect" : "Connect Wallet"}
          >
            <div className="col-start-1 row-start-1 transition-opacity duration-200 group-hover:opacity-0 pointer-events-none">
              {walletAddress ? (
                isDemoMode && walletAddress === "G_DEMO_ACCOUNT_123" ? (
                  "DEMO WALLET"
                ) : (
                  <span className="flex items-center gap-2">
                    {xlmBalance && <span className="text-bauhaus-yellow">{parseFloat(xlmBalance).toFixed(2)} XLM</span>}
                    <span>{formatAddress(walletAddress)}</span>
                  </span>
                )
              ) : 'Connect Wallet'}
            </div>
            <div className="col-start-1 row-start-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex items-center justify-center">
              {walletAddress === "G_DEMO_ACCOUNT_123" ? "Exit Demo" : (walletAddress ? "Disconnect" : "Connect Wallet")}
            </div>
          </button>
        </div>
      </header>

      <main className="flex-grow bauhaus-container w-full">
        {view === 'landing' && <LandingView setView={setView} globalStats={globalStats} />}
        {view === 'student' && <StudentDashboard triggerTx={triggerTx} state={studentState} verifyFn={verifyStudent} claimFn={studentClaim} walletAddress={walletAddress} isDemoMode={isDemoMode} />}
        {view === 'donor' && <DonorDashboard triggerTx={triggerTx} depositFn={donorDeposit} globalStats={globalStats} multiSigConfig={multiSigConfig} proposals={proposals} walletAddress={walletAddress} createProposal={createProposal} approveProposal={approveProposal} rejectProposal={rejectProposal} executeProposal={executeProposal} proposalWeight={proposalWeight} requiredWeight={requiredWeight} />}
      </main>

      {/* Demo Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-bauhaus-white dark:bg-gray-900 border-8 border-bauhaus-red p-8 md:p-12 w-full max-w-lg text-center animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-bauhaus-red rounded-full mx-auto mb-8 flex items-center justify-center text-white text-4xl font-black">!</div>
            <h2 className="text-3xl font-black uppercase mb-6 tracking-tighter text-bauhaus-red">Entering Demo Mode</h2>
            <p className="font-bold text-sm md:text-base uppercase tracking-widest leading-relaxed mb-10 text-bauhaus-black dark:text-white">
              Demo mode allows you to explore StipeStream without spending real XLM or USDC. 
              <br/><br/>
              <span className="text-bauhaus-blue dark:text-blue-400">Transactions are simulated on-chain. This will NOT affect your real wallet balance or increase/decrease your actual funds.</span>
            </p>
            <button onClick={() => setShowDemoModal(false)} className="bg-bauhaus-black dark:bg-gray-800 text-bauhaus-white font-black uppercase tracking-[0.3em] px-12 py-5 w-full hover:bg-gray-700 transition-all border-4 border-bauhaus-black">
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-bauhaus-white dark:bg-gray-900 border-8 border-bauhaus-black dark:border-gray-800 p-8 md:p-10 w-full max-w-sm text-center">
            <h2 className="text-xl md:text-2xl font-black uppercase mb-6 tracking-widest text-bauhaus-red">Disconnect?</h2>
            <p className="text-[10px] md:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-8">
              Are you sure you want to sign out and end your session?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  setWalletAddress(null);
                  setXlmBalance(null);
                  setView('landing');
                  setIsDemoMode(false);
                  setShowDisconnectConfirm(false);
                }} 
                className="bg-bauhaus-red text-white font-bold uppercase tracking-widest py-4 hover:bg-red-700 transition-colors border-2 border-bauhaus-black"
              >
                Yes
              </button>
              <button 
                onClick={() => setShowDisconnectConfirm(false)} 
                className="bg-bauhaus-black text-white font-bold uppercase tracking-widest py-4 hover:bg-gray-800 transition-colors border-2 border-bauhaus-black"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large Donation Confirmation Modal */}
      {showLargeDonationConfirm.show && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-bauhaus-white dark:bg-gray-900 border-8 border-bauhaus-yellow p-8 md:p-12 w-full max-w-lg text-center animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-bauhaus-yellow rounded-full mx-auto mb-8 flex items-center justify-center text-bauhaus-black text-4xl font-black">?</div>
            <h2 className="text-3xl font-black uppercase mb-6 tracking-tighter text-bauhaus-black dark:text-white">High Value Donation</h2>
            <p className="font-bold text-sm md:text-base uppercase tracking-widest leading-relaxed mb-10 text-bauhaus-black dark:text-white">
              You are about to deposit <span className="text-bauhaus-blue dark:text-blue-400">{showLargeDonationConfirm.amount.toLocaleString()} USDC</span>.
              <br/><br/>
              Are you sure you want to proceed with this amount?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  showLargeDonationConfirm.callback();
                  setShowLargeDonationConfirm({ ...showLargeDonationConfirm, show: false });
                }} 
                className="bg-bauhaus-yellow text-bauhaus-black font-black uppercase tracking-widest py-5 w-full hover:bg-white transition-all border-4 border-bauhaus-black"
              >
                Confirm
              </button>
              <button 
                onClick={() => setShowLargeDonationConfirm({ ...showLargeDonationConfirm, show: false })} 
                className="bg-bauhaus-black text-white font-black uppercase tracking-widest py-5 w-full hover:bg-gray-800 transition-all border-4 border-bauhaus-black"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Modal — Account Abstraction + Freighter */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-bauhaus-white dark:bg-gray-900 border-4 md:border-8 border-bauhaus-black dark:border-gray-700 p-6 md:p-8 w-full max-w-md">
            <h2 className="text-xl md:text-2xl font-black uppercase mb-2 tracking-widest text-bauhaus-blue dark:text-blue-400">Connect Wallet</h2>
            <p className="text-[10px] md:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-6">StipeStream is built on Stellar Soroban.</p>
            <div className="space-y-3">
              {/* Freighter */}
              <button onClick={handleConnect} className="w-full border-4 border-bauhaus-black dark:border-gray-700 p-4 font-bold uppercase tracking-widest hover:bg-bauhaus-black hover:text-white dark:hover:bg-gray-800 transition-colors flex justify-between items-center text-xs md:text-sm">
                <span>🦔 Freighter Wallet</span>
                {hasFreighter ? <span className="w-3 h-3 bg-green-500 rounded-full"></span> : <span className="text-[10px] text-gray-400">Install</span>}
              </button>
              {/* Passkey — Account Abstraction */}
              <button onClick={connectWithPasskey} className="w-full border-4 border-bauhaus-blue dark:border-blue-500 p-4 font-bold uppercase tracking-widest hover:bg-bauhaus-blue hover:text-white transition-colors flex justify-between items-center text-xs md:text-sm">
                <span>🔑 Passkey (No Extension)</span>
                <span className="text-[8px] bg-bauhaus-blue text-white px-2 py-0.5 font-black tracking-widest">NEW</span>
              </button>
              {/* Email — Account Abstraction */}
              {!showEmailForm ? (
                <button onClick={() => setShowEmailForm(true)} className="w-full border-4 border-bauhaus-yellow dark:border-yellow-400 p-4 font-bold uppercase tracking-widest hover:bg-bauhaus-yellow hover:text-bauhaus-black transition-colors flex justify-between items-center text-xs md:text-sm">
                  <span>✉️ Email (Smart Wallet)</span>
                  <span className="text-[8px] bg-bauhaus-yellow text-bauhaus-black px-2 py-0.5 font-black tracking-widest">BETA</span>
                </button>
              ) : (
                <div className="border-4 border-bauhaus-yellow dark:border-yellow-400 p-4">
                  <input type="email" placeholder="scholar@example.com" value={emailInput} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && emailInput && connectWithEmail(emailInput)} className="w-full bg-transparent border-b-2 border-bauhaus-black dark:border-gray-400 p-2 font-bold text-sm focus:outline-none mb-3" autoFocus />
                  <button onClick={() => emailInput && connectWithEmail(emailInput)} className="w-full bg-bauhaus-yellow text-bauhaus-black font-black uppercase tracking-widest py-3 border-2 border-bauhaus-black text-xs hover:bg-white transition-colors">Continue with Email</button>
                </div>
              )}
            </div>
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">⚡ Account Abstraction: Passkey & Email options create a self-custodied Stellar keypair stored locally. No browser extension required.</p>
            </div>
            <button onClick={() => { setShowConnectModal(false); setShowEmailForm(false); setEmailInput(''); }} className="mt-6 text-[10px] md:text-xs font-bold uppercase tracking-widest underline w-full text-center hover:text-bauhaus-red">Cancel</button>
          </div>
        </div>
      )}

      {/* Tx Modal */}
      {txModal.show && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`border-4 md:border-8 border-bauhaus-black dark:border-gray-700 p-6 md:p-10 w-full max-w-md ${txModal.status === 'success' ? 'bg-bauhaus-white dark:bg-gray-900' : txModal.status === 'failed' ? 'bg-bauhaus-red text-white' : 'bg-bauhaus-yellow dark:bg-yellow-500 text-bauhaus-black'}`}>
            <h2 className="text-2xl md:text-3xl font-black uppercase mb-4 tracking-widest">
              {txModal.status === 'pending' ? (isDemoMode ? 'Simulating Tx...' : 'Sign Tx...') : txModal.status === 'success' ? 'Success!' : 'Failed'}
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

// Views

function LandingView({ setView, globalStats }: { setView: (v: any) => void, globalStats: GlobalStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 animate-in fade-in duration-700">

      <div className="col-span-1 md:col-span-9 flex flex-col justify-center mb-4 md:mb-8 border-l-4 md:border-l-8 border-bauhaus-red pl-6 md:pl-16 py-8 md:py-12">
        <h3 className="text-bauhaus-red dark:text-red-400 font-bold tracking-[0.2em] md:tracking-[0.4em] uppercase mb-4 md:mb-6 text-[10px] md:text-sm">Why Web3? Because transparency matters.</h3>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black uppercase leading-tight md:leading-[1.1]">
          Transparent, Global Scholarships Powered by the Blockchain.
        </h1>
        <p className="mt-6 md:mt-8 text-sm md:text-lg font-bold uppercase tracking-widest max-w-2xl text-gray-600 dark:text-gray-400">
          Absolute transparency.
        </p>
      </div>

      <div className="col-span-1 md:col-span-3 flex items-center justify-center hidden md:flex">
        <div className="w-full h-full min-h-[200px] md:min-h-[300px] bg-bauhaus-blue rounded-full"></div>
      </div>

      <div className="col-span-1 md:col-span-12 mt-4 md:mt-8 mb-2 md:mb-4 border-t-4 md:border-t-8 border-bauhaus-black dark:border-gray-800 pt-6 md:pt-8">
        <h2 className="text-xl md:text-2xl font-black uppercase tracking-[0.2em] md:mb-8 text-center md:text-left">Live Treasury Stats</h2>
      </div>

      <div className="col-span-1 md:col-span-4 bg-bauhaus-white dark:bg-gray-800 border-l-4 md:border-l-8 border-bauhaus-blue p-6 md:p-10 shadow-lg md:shadow-none overflow-hidden">
        <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gray-400 mb-4 md:mb-6">Total Funds Locked (TVL)</div>
        <div className="text-3xl md:text-5xl font-black mb-1 md:mb-2 text-bauhaus-blue dark:text-blue-400 truncate" title={globalStats.tvl.toLocaleString()}>{formatCompact(globalStats.tvl)}</div>
        <div className="text-xs md:text-sm font-bold tracking-widest text-bauhaus-black dark:text-gray-300">USDC</div>
      </div>

      <div className="col-span-1 md:col-span-4 bg-bauhaus-black dark:bg-gray-900 text-bauhaus-white p-6 md:p-10 shadow-lg md:shadow-none overflow-hidden">
        <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gray-400 mb-4 md:mb-6">Scholarships Distributed</div>
        <div className="text-3xl md:text-5xl font-black mb-1 md:mb-2 text-bauhaus-yellow truncate" title={globalStats.distributedCount.toLocaleString()}>{formatCompact(globalStats.distributedCount)}</div>
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

function StudentDashboard({ triggerTx, state, verifyFn, claimFn, walletAddress, isDemoMode }: { triggerTx: any, state: StudentState, verifyFn: any, claimFn: any, walletAddress: string | null, isDemoMode: boolean }) {
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
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const isClaimReady = walletAddress && state.isVerified && timeLeft === 0 && state.totalBalance >= state.payoutAmount && state.payoutAmount > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-0 animate-in fade-in duration-700 bg-bauhaus-white dark:bg-gray-800 shadow-2xl border-4 md:border-8 border-bauhaus-black dark:border-gray-700">
      <div className="col-span-1 md:col-span-7 p-6 md:p-12 border-b-4 md:border-b-0 md:border-r-8 border-bauhaus-black dark:border-gray-700 bg-bauhaus-bg dark:bg-gray-900">
        <h1 className="text-3xl md:text-4xl font-black uppercase mb-8 md:mb-12 leading-none text-bauhaus-blue dark:text-blue-400">Scholar<br />Dashboard</h1>

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

          {/* Fee Sponsorship Status Badge */}
          <div className="mb-6 md:mb-8 border-2 border-bauhaus-black dark:border-gray-600 p-4">
            <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500 mb-3 text-center">Gas Fee Handling</p>
            <div className="flex items-center gap-3 justify-center">
              {/* Animated pulse indicator */}
              <span className={`relative flex h-3 w-3 shrink-0`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isDemoMode
                    ? 'bg-bauhaus-yellow'
                    : hasSponsor
                    ? 'bg-green-400'
                    : 'bg-gray-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  isDemoMode
                    ? 'bg-bauhaus-yellow'
                    : hasSponsor
                    ? 'bg-green-500'
                    : 'bg-gray-500'
                }`}></span>
              </span>
              <div className="text-left">
                <p className={`text-[10px] md:text-xs font-black uppercase tracking-widest ${
                  isDemoMode
                    ? 'text-bauhaus-yellow dark:text-yellow-400'
                    : hasSponsor
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {isDemoMode
                    ? 'Fee Bump: Simulated'
                    : hasSponsor
                    ? '✓ Fee Bump Active — You Pay 0 XLM'
                    : 'Student Pays Fees (No Sponsor Set)'}
                </p>
                <p className="text-[8px] md:text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">
                  {isDemoMode
                    ? 'Demo mode bypasses real gas'
                    : hasSponsor
                    ? 'Sponsor account covers all XLM gas via FeeBumpTransaction'
                    : 'Set VITE_SPONSOR_SECRET to enable sponsorship'}
                </p>
              </div>
            </div>
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

function DonorDashboard({ triggerTx, depositFn, globalStats, multiSigConfig, proposals, walletAddress, createProposal, approveProposal, rejectProposal, executeProposal, proposalWeight, requiredWeight }: { triggerTx: any, depositFn: any, globalStats: GlobalStats, multiSigConfig: MultiSigConfig, proposals: MultiSigProposal[], walletAddress: string | null, createProposal: any, approveProposal: any, rejectProposal: any, executeProposal: any, proposalWeight: any, requiredWeight: any }) {
  const [amount, setAmount] = useState<number>(1000);
  const [isOnboarding, setIsOnboarding] = useState(true);

  const handleDeposit = async () => {
    // Multi-sig: create a proposal instead of executing directly
    const p = createProposal(amount, isOnboarding);
    if (p.status === 'approved') {
      // Proposer has enough weight alone — execute immediately
      return await depositFn(amount, isOnboarding);
    }
    // Otherwise proposal is pending; other signers must approve
    return true;
  };

  const pendingProposals = proposals.filter((p: MultiSigProposal) => p.status === 'pending' || p.status === 'approved');

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 animate-in fade-in duration-700">
      <div className="col-span-1 md:col-span-12 flex flex-col md:flex-row items-start md:items-center justify-between mb-4 border-b-4 md:border-b-8 border-bauhaus-black dark:border-gray-800 pb-6 md:pb-8">
        <h1 className="text-2xl sm:text-4xl md:text-7xl font-black uppercase leading-none text-bauhaus-red dark:text-red-400">Sponsor <br className="hidden md:block" />Dashboard</h1>
        <div className="mt-2 md:mt-0 text-left md:text-right">
          <div className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gray-500 dark:text-gray-400 mb-1 md:mb-2">Your Impact</div>
          <div className="text-lg md:text-2xl font-black uppercase tracking-widest text-bauhaus-black dark:text-white">{globalStats.donorImpact}</div>
        </div>
      </div>

      {/* ── Multi-Sig Council Panel ── */}
      <div className="col-span-1 md:col-span-12 border-4 border-bauhaus-black dark:border-gray-700 bg-bauhaus-white dark:bg-gray-900">
        <div className="bg-bauhaus-black dark:bg-gray-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-black uppercase tracking-[0.3em] text-xs md:text-sm">🔐 Multi-Sig Council</h2>
          <span className="text-bauhaus-yellow font-black text-[10px] uppercase tracking-widest">{multiSigConfig.medThreshold}-of-{multiSigConfig.signers.reduce((s,x)=>s+x.weight,0)} Governance</span>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 border-b-4 border-bauhaus-black dark:border-gray-700">
          {multiSigConfig.signers.map(s => {
            const isCurrentUser = walletAddress === s.address;
            return (
              <div key={s.address} className={`p-4 border-4 ${isCurrentUser ? 'border-bauhaus-red bg-bauhaus-red/5' : 'border-bauhaus-black dark:border-gray-600'} flex items-center gap-3`}>
                <div className={`w-10 h-10 flex items-center justify-center font-black text-lg border-4 border-bauhaus-black shrink-0 ${isCurrentUser ? 'bg-bauhaus-red text-white' : 'bg-bauhaus-yellow text-bauhaus-black'}`}>{s.weight}</div>
                <div>
                  <div className="font-black text-xs uppercase tracking-widest">{s.label}{isCurrentUser && <span className="ml-1 text-bauhaus-red">✦</span>}</div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.address.slice(0,6)}…{s.address.slice(-4)}</div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Weight: {s.weight} pt{s.weight !== 1 ? 's' : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4 flex flex-wrap gap-6 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          <span>🟡 Med ops (&lt;{multiSigConfig.highValueThreshold.toLocaleString()} USDC): <strong className="text-bauhaus-black dark:text-white">{multiSigConfig.medThreshold} weight</strong></span>
          <span>🔴 High ops (≥{multiSigConfig.highValueThreshold.toLocaleString()} USDC): <strong className="text-bauhaus-black dark:text-white">{multiSigConfig.highThreshold} weight</strong></span>
        </div>
      </div>

      {/* ── Pending Proposals ── */}
      {pendingProposals.length > 0 && (
        <div className="col-span-1 md:col-span-12 border-4 border-bauhaus-yellow dark:border-yellow-400 bg-bauhaus-white dark:bg-gray-900">
          <div className="bg-bauhaus-yellow px-6 py-4">
            <h2 className="text-bauhaus-black font-black uppercase tracking-[0.3em] text-xs md:text-sm">⏳ Pending Proposals ({pendingProposals.length})</h2>
          </div>
          <div className="divide-y-4 divide-bauhaus-black dark:divide-gray-700">
            {pendingProposals.map((p: MultiSigProposal) => {
              const w = proposalWeight(p); const r = requiredWeight(p.amount);
              const pct = Math.min(100, Math.round((w / r) * 100));
              const alreadyApproved = walletAddress ? p.approvals.includes(walletAddress) : false;
              return (
                <div key={p.id} className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div>
                      <span className={`inline-block px-3 py-1 text-[9px] font-black uppercase tracking-widest border-2 mr-3 ${ p.status === 'approved' ? 'bg-green-500 text-white border-green-700' : 'bg-bauhaus-yellow text-bauhaus-black border-bauhaus-black'}`}>{p.status}</span>
                      <span className="font-black text-sm">{p.amount.toLocaleString()} USDC</span>
                      <span className="ml-2 text-[10px] font-bold text-gray-400 uppercase">{p.isOnboarding ? '+ New Scholar' : 'Refill'}</span>
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">By {p.proposedByLabel} · {new Date(p.proposedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                      <span>Approval Weight</span><span>{w}/{r} pts</span>
                    </div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 border-2 border-bauhaus-black dark:border-gray-600">
                      <div className="h-full bg-bauhaus-blue transition-all duration-700" style={{width:`${pct}%`}}></div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {multiSigConfig.signers.map(s => (
                        <span key={s.address} className={`text-[9px] px-2 py-0.5 font-black uppercase border ${ p.approvals.includes(s.address) ? 'bg-bauhaus-blue text-white border-bauhaus-blue' : 'border-gray-300 dark:border-gray-600 text-gray-400'}`}>{s.label} ({s.weight})</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {p.status === 'approved' ? (
                      <button onClick={() => executeProposal(p.id)} className="bg-green-500 text-white font-black uppercase tracking-widest px-6 py-3 border-2 border-green-700 hover:bg-green-600 transition-colors text-[10px]">🚀 Execute Deposit</button>
                    ) : !alreadyApproved ? (
                      <button onClick={() => approveProposal(p.id)} className="bg-bauhaus-blue text-white font-black uppercase tracking-widest px-6 py-3 border-2 border-bauhaus-black hover:bg-blue-700 transition-colors text-[10px]">✓ Approve</button>
                    ) : (
                      <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center">✓ You approved</span>
                    )}
                    {p.status !== 'approved' && <button onClick={() => rejectProposal(p.id)} className="bg-bauhaus-red text-white font-black uppercase tracking-widest px-6 py-3 border-2 border-bauhaus-black hover:bg-red-700 transition-colors text-[10px]">✕ Reject</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              <div className="text-[10px] md:text-xs font-bold tracking-widest uppercase text-bauhaus-yellow dark:text-yellow-500 bg-bauhaus-black dark:bg-black px-2 py-1 mb-1 inline-block">Distributed</div>
              <div className="font-black text-xs md:text-base text-bauhaus-black dark:text-bauhaus-yellow">{globalStats.distributedCount.toLocaleString()} Claims</div>
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
        <div className="flex flex-col sm:flex-row gap-6 mb-6 md:mb-8">
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

        <div className="flex items-center gap-4 mb-8 md:mb-10 bg-white/10 p-4 border-2 border-white/20">
          <input 
            type="checkbox" 
            id="onboard" 
            checked={isOnboarding} 
            onChange={(e) => setIsOnboarding(e.target.checked)}
            className="w-6 h-6 accent-bauhaus-yellow cursor-pointer"
          />
          <label htmlFor="onboard" className="font-bold uppercase tracking-widest text-[10px] md:text-xs cursor-pointer select-none">
            Onboard new scholar with this donation
          </label>
        </div>

        <button 
          onClick={() => {
            const execute = () => triggerTx('Smart Contract Deposit', handleDeposit);
            if (amount >= 5000) {
              // We need to pass the trigger function to the parent's modal state
              // But since we are inside DonorDashboard, we should probably handle it via a prop
              // For simplicity in this structure, I'll update the parent's trigger
              (window as any).confirmLargeDonation(amount, execute);
            } else {
              execute();
            }
          }} 
          className="bg-bauhaus-yellow text-bauhaus-black font-black uppercase tracking-[0.1em] md:tracking-[0.2em] py-3 md:py-6 px-4 md:px-12 border-4 border-bauhaus-black hover:bg-white transition-colors cursor-pointer w-full text-[10px] md:text-sm"
        >
          Fund Protocol via Soroban
          {amount >= 5000
            ? <span className="block text-[8px] tracking-widest opacity-70">≥ {multiSigConfig.highThreshold} weight required (high-value)</span>
            : <span className="block text-[8px] tracking-widest opacity-70">≥ {multiSigConfig.medThreshold} weight required → creates proposal</span>
          }
        </button>
        
        {/* Iteration 1: Bulk Onboarding Placeholder (Based on David Miller Feedback) */}
        <button 
          onClick={() => alert("Bulk Onboarding (CSV) is currently in development for Version 2.0. Stay tuned!")}
          className="mt-4 bg-transparent text-white/60 font-bold uppercase tracking-widest py-3 px-4 border-2 border-white/20 hover:border-white/40 hover:text-white transition-all w-full text-[8px] md:text-[10px] cursor-pointer flex items-center justify-center gap-2"
        >
          <span>📁 Bulk Onboard (CSV)</span>
          <span className="bg-bauhaus-yellow text-bauhaus-black px-2 py-0.5 rounded-none text-[6px]">BETA</span>
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
