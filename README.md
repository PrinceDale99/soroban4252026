# StipeStream

**One-Line Description:** An automated, time-locked Soroban smart contract that guarantees on-time monthly stipend distributions for university scholars.

## Problem & Solution
**Problem:** A low-income university scholar in Metro Manila faces food insecurity because their ₱7,000 monthly living allowance from a local NGO is chronically delayed by bureaucratic accounting bottlenecks.
**Solution:** An NGO or alumni fund locks the entire semester's stipend in a Soroban smart contract at the start of the term, empowering the student to trustlessly withdraw exactly one month's allowance every 30 days without waiting for any human approval.

## Timeline
Can be easily built, customized, and demoed via a simple web frontend within a 48-hour bootcamp.

## Stellar Features Used
* Soroban Smart Contracts (Time-locked conditions)
* USDC Transfers

## Vision and Purpose
To automate social aid and educational grants, ensuring funds reach students exactly when they need them without heavy administrative overhead or delays. 

## Prerequisites
* Rust toolchain (`rustup target add wasm32-unknown-unknown`)
* Soroban CLI (`cargo install --locked soroban-cli`)

## Quickstart

**1. How to Build**
```bash
soroban contract build
```

**2. How to Test**
```bash
cargo test
```

**3. How to Deploy to Testnet**
```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stipestream.wasm \
  --source <YOUR_FUNDED_SECRET_KEY> \
  --network testnet
```

**4. CLI Invocation (Simulate MVP Function)**
*(Assuming contract ID is `C...` and enough time has passed since initialization)*
```bash
soroban contract invoke \
  --id <YOUR_CONTRACT_ID> \
  --source <STUDENT_SECRET_KEY> \
  --network testnet \
  -- \
  claim
```

## License
MIT License
