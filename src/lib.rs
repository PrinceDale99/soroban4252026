#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
pub enum DataKey {
    StipendState,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StipendState {
    pub funder: Address,
    pub student: Address,
    pub token: Address,
    pub payout_amount: i128,
    pub interval_secs: u64,
    pub last_claim_time: u64,
}

#[contract]
pub struct StipeStreamContract;

#[contractimpl]
impl StipeStreamContract {
    /// Initializes the stipend contract with the funder, student, token, payout amount, and interval limit.
    pub fn init(env: Env, funder: Address, student: Address, token: Address, payout_amount: i128, interval_secs: u64) {
        funder.require_auth();
        
        if env.storage().instance().has(&DataKey::StipendState) {
            panic!("Contract already initialized");
        }
        
        let state = StipendState {
            funder,
            student,
            token,
            payout_amount,
            interval_secs,
            last_claim_time: 0, // 0 allows immediate first claim after funding
        };
        env.storage().instance().set(&DataKey::StipendState, &state);
    }

    /// Funder deposits the total semester/yearly funds into the contract.
    pub fn fund(env: Env, total_amount: i128) {
        let state: StipendState = env.storage().instance().get(&DataKey::StipendState).expect("Not initialized");
        state.funder.require_auth();

        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(&state.funder, &env.current_contract_address(), &total_amount);
    }

    /// Student claims their recurring stipend. Fails if the time interval hasn't passed.
    pub fn claim(env: Env) {
        let mut state: StipendState = env.storage().instance().get(&DataKey::StipendState).expect("Not initialized");
        state.student.require_auth();

        let current_time = env.ledger().timestamp();
        
        // Ensure enough time has passed since the last claim
        if current_time < state.last_claim_time + state.interval_secs {
            panic!("Too early to claim stipend");
        }

        // Transfer the fixed payout amount to the student
        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(&env.current_contract_address(), &state.student, &state.payout_amount);

        // Update the last claim time
        state.last_claim_time = current_time;
        env.storage().instance().set(&DataKey::StipendState, &state);
    }

    /// Helper to read the current state of the stipend.
    pub fn get_state(env: Env) -> StipendState {
        env.storage().instance().get(&DataKey::StipendState).expect("Not initialized")
    }
}
