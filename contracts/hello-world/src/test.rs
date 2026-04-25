#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{token, Address, Env, IntoVal};

fn setup_test() -> (Env, Address, Address, Address, StipeStreamContractClient, token::Client) {
    let env = Env::default();
    env.mock_all_auths();

    let funder = Address::generate(&env);
    let student = Address::generate(&env);
    
    // Deploy mock token
    let token_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract(token_admin);
    let token_client = token::Client::new(&env, &token_addr);
    
    // Deploy stipend contract
    let contract_id = env.register_contract(None, StipeStreamContract);
    let contract_client = StipeStreamContractClient::new(&env, &contract_id);

    // Mint tokens to the funder
    let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);
    token_admin_client.mint(&funder, &1000);

    (env, funder, student, token_addr, contract_client, token_client)
}

#[test]
fn test_1_happy_path_end_to_end() {
    let (env, funder, student, token_addr, contract, token) = setup_test();
    let payout = 100;
    let interval = 2_592_000; // 30 days in seconds

    contract.init(&funder, &student, &token_addr, &payout, &interval);
    contract.fund(&500); // Fund 5 months worth

    // First claim (allowed immediately because last_claim_time is 0)
    env.ledger().set_timestamp(1_000_000);
    contract.claim();
    assert_eq!(token.balance(&student), 100);

    // Advance time by 31 days
    env.ledger().set_timestamp(1_000_000 + 2_600_000);
    contract.claim();
    assert_eq!(token.balance(&student), 200);
}

#[test]
#[should_panic(expected = "Too early to claim stipend")]
fn test_2_edge_case_claim_too_early() {
    let (env, funder, student, token_addr, contract, _token) = setup_test();
    
    contract.init(&funder, &student, &token_addr, &100, &2_592_000);
    contract.fund(&500);

    env.ledger().set_timestamp(1_000_000);
    contract.claim(); // First claim succeeds

    // Attempt second claim immediately, should panic
    contract.claim();
}

#[test]
fn test_3_state_verification() {
    let (env, funder, student, token_addr, contract, _token) = setup_test();
    
    contract.init(&funder, &student, &token_addr, &100, &2_592_000);
    
    let state_init = contract.get_state();
    assert_eq!(state_init.last_claim_time, 0);

    contract.fund(&500);
    
    let claim_time = 1_500_000;
    env.ledger().set_timestamp(claim_time);
    contract.claim();

    let state_after_claim = contract.get_state();
    assert_eq!(state_after_claim.last_claim_time, claim_time);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_4_edge_case_cannot_init_twice() {
    let (_env, funder, student, token_addr, contract, _token) = setup_test();
    
    contract.init(&funder, &student, &token_addr, &100, &2_592_000);
    contract.init(&funder, &student, &token_addr, &100, &2_592_000); // Second time panics
}

#[test]
#[should_panic] // Panics from the token contract natively due to insufficient balance
fn test_5_edge_case_insufficient_contract_funds() {
    let (env, funder, student, token_addr, contract, _token) = setup_test();
    
    contract.init(&funder, &student, &token_addr, &100, &1000);
    contract.fund(&50); // Funder only deposits 50, but payout is 100

    env.ledger().set_timestamp(1_000_000);
    contract.claim(); // Will panic because contract balance (50) < payout amount (100)
}
