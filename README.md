# StipeStream

**One-Line Description:** An automated, time-locked Soroban smart contract that guarantees on-time monthly stipend distributions for university scholars.

## What is StipeStream?
StipeStream is a decentralized aid disbursement protocol built on the Stellar Soroban network. It empowers NGOs, alumni funds, and educational institutions to lock stipends in a smart contract, allowing students to claim their allowance trustlessly and automatically on a strict schedule.

## The Problem it Solves
**Problem:** A low-income university scholar in Metro Manila (and globally) faces food insecurity and risks dropping out because their monthly living allowance from a local NGO is chronically delayed by bureaucratic accounting bottlenecks. The cost of friction includes severe cash flow disruptions leading to skipped meals, late rent penalties, or taking out high-interest short-term loans.

## Target Users
- **Funder (NGOs / Alumni Associations):** Organizations that want a transparent, zero-administrative-overhead way to disburse funds to students predictably.
- **Students (Scholars):** Low-income students who rely on scheduled aid to pay rent, buy groceries, and afford commuting without facing uncertain delays.

## Why Stellar?
- **Low Fees:** Distributing $100 in aid should not cost $10 in network fees. Stellar's fraction-of-a-cent transaction fees ensure the maximum amount of aid reaches the scholar.
- **Fast Settlement:** Students receive their USDC in under 5 seconds, allowing them to offramp it immediately.
- **Soroban Smart Contracts:** The time-lock conditions and exact payout amounts are immutably written into Soroban contracts, guaranteeing that funders cannot arbitrarily delay the schedule, nor can students claim early.

## How it Works
**Solution:** An NGO or alumni fund locks the entire semester's stipend in a Soroban smart contract at the start of the term. This empowers the student to trustlessly withdraw exactly one month's allowance (in USDC) every 30 days without waiting for any human approval. 

1. **Initialization:** The funder (NGO) initializes the contract with the student's address and the agreed stipend amount.
2. **Funding:** The funder deposits a large sum (e.g., for a full semester) into the contract's vault.
3. **Claiming:** The student connects their wallet (e.g., Freighter) and withdraws one month's allowance exactly every 30 days. The time-lock strictly prevents early withdrawals.

## Architecture
StipeStream utilizes a hybrid architecture matching modern Web3 standards:
- **Frontend Layer:** A high-performance, neo-brutalist React application (built with Vite and TailwindCSS) hosted on GitHub Pages. It uses `@stellar/freighter-api` to connect directly to the user's wallet.
- **Contract Layer:** A Rust-based Soroban smart contract deployed on the Stellar Testnet. This contract acts as the trustless escrow vault.
- **Ledger Layer:** The Stellar Network processes the USDC transfers and maintains an immutable public ledger of all disbursements.

## Project Structure
```text
stipestream/
├── contracts/               # Soroban smart contracts
│   └── hello-world/         
│       ├── Cargo.toml       # Contract dependencies
│       └── src/
│           ├── lib.rs       # Core smart contract logic
│           └── test.rs      # Unit tests
├── frontend/                # React Web Application
│   ├── src/
│   │   ├── App.tsx          # Main application logic & UI
│   │   └── index.css        # Neo-brutalist global styling
│   ├── tailwind.config.js   # Custom design tokens
│   └── package.json         # Frontend dependencies
├── .github/workflows/       # CI/CD pipelines (GitHub Pages deployment)
└── README.md                # Project documentation
```

## Contract Functions
The core logic resides in a Soroban contract tracking a `StipendState` with the following key functions:
- `initialize(funder: Address, student: Address, token: Address, payout_amount: i128, interval_secs: u64)`: Sets up the initial parameters and binds the student and funder.
- `deposit(amount: i128)`: Called by the funder to lock funds into the contract's vault.
- `claim()`: Called by the student. The contract checks if `current_time >= last_claim_time + interval_secs`. If true, it transfers `payout_amount` of USDC to the student and updates `last_claim_time`.

## Status Lifecycle
1. **Unfunded / Pending:** The contract is initialized but has no USDC balance.
2. **Active / Locked:** The contract is funded. The student is currently waiting for the `interval_secs` timer to run out.
3. **Ready to Claim:** The time-lock has expired. The student can click "Claim" to withdraw their stipend.
4. **Depleted:** The contract vault has less balance than the `payout_amount`, requiring the funder to deposit more or marking the end of the scholarship term.

## Smart Contract Details

**Contract ID:** `CCSUHUIWD7KLPACAVPROOFMUD6D3GPMEXJVXSRFB52BCVQHREKEH2YCV`

**Deployed Smart Contract Link:** 
[View on Stellar Lab (Testnet)](https://lab.stellar.org/r/testnet/contract/CCSUHUIWD7KLPACAVPROOFMUD6D3GPMEXJVXSRFB52BCVQHREKEH2YCV)

*(Recommended) Screenshot of the deployed contract:*

![Deployed Contract Screenshot](./stellar_lab_screenshot.png)

## Web Application Interface
Here is the neo-brutalist inspired UI for StipeStream, designed for a frictionless user experience:

### Home Dashboard
![Home](./site_home.png)

### Secure Stipend Entry
![Stipends](./site_stipends.png)

### Transaction Ledger
![History](./site_history.png)

## Timeline
Can be easily built, customized, and demoed via a simple web frontend within a 48-hour bootcamp.

## Stellar Features Used
* **Soroban Smart Contracts:** Leveraging `Env::ledger().timestamp()` for secure, un-cheatable time-locked conditions.
* **Stellar Assets (USDC):** Using the stellar asset contract standard to transfer native/bridged stablecoins efficiently.
* **Freighter Wallet Integration:** Seamless connection and signing using the standard `@stellar/freighter-api`.

## Vision and Purpose
To automate social aid and educational grants, ensuring funds reach students exactly when they need them without heavy administrative overhead or delays. 

## Prerequisites
* Rust toolchain (`rustup target add wasm32-unknown-unknown`)
* Soroban CLI (`cargo install --locked soroban-cli` or Stellar CLI)
* Node.js v18+ (for frontend development)
* A Stellar Freighter Wallet browser extension

## Detailed Setup & Quickstart

**1. Clone the Repository**
```bash
git clone https://github.com/PrinceDale99/StripeSpend.git
cd StripeSpend
```

**2. How to Build the Contract**
```bash
cargo build --target wasm32-unknown-unknown --release
# OR
soroban contract build
```

**3. How to Test the Contract**
```bash
cargo test
```

**4. How to Deploy to Testnet**
```bash
# Generate an identity and fund it
soroban config identity generate default
soroban keys fund default --network testnet

# Deploy the WASM
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stipestream.wasm \
  --source default \
  --network testnet
```

**5. Start the Web Frontend**
```bash
cd frontend
npm install
npm run dev
```

**6. CLI Invocation (Simulate MVP Function)**
*(Assuming enough time has passed since initialization)*
```bash
soroban contract invoke \
  --id CCSUHUIWD7KLPACAVPROOFMUD6D3GPMEXJVXSRFB52BCVQHREKEH2YCV \
  --source <STUDENT_SECRET_KEY> \
  --network testnet \
  -- \
  claim
```

## License
MIT License
