# StipeStream System Architecture

StipeStream is a decentralized aid disbursement protocol built on the Stellar network. It utilizes Soroban smart contracts for automated, time-locked fund distribution.

## 1. Smart Contract Layer (Soroban)
The core logic resides in a Rust-based Soroban smart contract.

### **Core Components:**
*   **Instance Storage**: Stores the `StipendState` (Funder, Student, Token, Payout Amount, Interval).
*   **Authorization**: Uses `require_auth()` for both the `fund` (Funder) and `claim` (Student) operations.
*   **Time-Lock Logic**:
    ```rust
    if current_time < state.last_claim_time + state.interval_secs {
        panic!("Too early to claim stipend");
    }
    ```
*   **Inter-Contract Calls**: Utilizes the `token::Client` to interact with the Stellar Asset Contract (SAC) for USDC transfers.

## 2. Frontend Layer (React + Vite)
A premium, Bauhaus-inspired React application handles user interaction and wallet connectivity.

### **State Management:**
*   **Protocol Hooks**: Custom `useProtocolState` hook for fetching on-chain TVL and scholarship statuses.
*   **Wallet Integration**: Utilizes `@stellar/freighter-api` for secure transaction signing.
*   **Demo Mode**: Uses a simulated environment with separate `localStorage` persistence to allow risk-free exploration.

## 3. Data Flow
1.  **Funding**: The NGO (Sponsor) initializes the contract and deposits USDC.
2.  **Verification**: The Scholar connects their Freighter wallet.
3.  **Distribution**: Every 30 days, the Scholar triggers the `claim` function. The Soroban contract verifies the timestamp and transfers USDC directly to the Scholar's wallet.

## 4. Design System
*   **Aesthetic**: Bauhaus-inspired (Primary colors, heavy borders, minimalist geometry).
*   **Responsiveness**: Mobile-first grid system using Tailwind CSS.
*   **Accessibility**: Full Dark/Light mode support with persistent user preferences.
