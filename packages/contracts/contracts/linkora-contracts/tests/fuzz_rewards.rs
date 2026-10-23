#![cfg(test)]

use linkora_contracts::{LinkoraContract, LinkoraContractClient};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::Address as _, token::Client as TokenClient, token::StellarAssetClient, Address,
    Env, Map,
};

fn setup() -> (Env, LinkoraContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LinkoraContract);
    let client = LinkoraContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &treasury, &0);
    (env, client, admin, contract_id)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn fuzz_distributed_rewards_are_fully_backed(amounts in prop::collection::vec(1i128..1_000_000_000, 1..12)) {
        let (env, client, admin, contract_id) = setup();
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token = token_id.address();
        let total: i128 = amounts.iter().sum();
        StellarAssetClient::new(&env, &token).mint(&admin, &total);

        let mut claims = Map::new(&env);
        let mut recipients = std::vec::Vec::new();
        for amount in amounts.iter() {
            let recipient = Address::generate(&env);
            claims.set(recipient.clone(), *amount);
            recipients.push(recipient);
        }

        let epoch = client.distribute_rewards(&admin, &token, &claims);
        let mut total_claimed = 0i128;
        for recipient in recipients.iter() {
            let amount = client.claim_reward(&recipient, &epoch);
            total_claimed += amount;
        }

        prop_assert_eq!(total_claimed, total);
        prop_assert_eq!(TokenClient::new(&env, &token).balance(&contract_id) + total_claimed, total);
    }

    #[test]
    fn fuzz_claims_are_idempotent_and_double_claims_fail(amount in 1i128..1_000_000_000) {
        let (env, client, admin, _) = setup();
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token = token_id.address();
        StellarAssetClient::new(&env, &token).mint(&admin, &amount);
        let recipient = Address::generate(&env);
        let mut claims = Map::new(&env);
        claims.set(recipient.clone(), amount);

        let epoch = client.distribute_rewards(&admin, &token, &claims);
        prop_assert_eq!(client.get_claimable_reward(&recipient, &epoch), amount);
        prop_assert_eq!(client.claim_reward(&recipient, &epoch), amount);
        prop_assert_eq!(client.get_claimable_reward(&recipient, &epoch), 0);
        prop_assert!(client.try_claim_reward(&recipient, &epoch).is_err());
    }
}
