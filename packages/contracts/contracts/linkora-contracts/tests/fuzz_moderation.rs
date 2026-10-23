#![cfg(test)]

use linkora_contracts::{LinkoraContract, LinkoraContractClient};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, Address, BytesN, Env,
    String as SdkString,
};

fn setup() -> (Env, LinkoraContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LinkoraContract);
    let client = LinkoraContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &treasury, &0);
    (env, client, admin, treasury)
}

fn create_token(env: &Env, admin: &Address) -> Address {
    let token = env.register_stellar_asset_contract_v2(admin.clone());
    token.address()
}

fn create_profile(
    env: &Env,
    client: &LinkoraContractClient,
    user: &Address,
    token: &Address,
    username: &str,
) {
    client.set_profile(user, &SdkString::from_str(env, username), token);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn fuzz_random_report_reasons_are_recorded(reason_bytes in prop::collection::vec(any::<[u8; 32]>(), 1..8)) {
        let (env, client, admin, _) = setup();
        let token = create_token(&env, &admin);
        let author = Address::generate(&env);
        create_profile(&env, &client, &author, &token, "author");
        let post_id = client.create_post(&author, &SdkString::from_str(&env, "moderation fuzz post"));

        for (index, reason) in reason_bytes.iter().enumerate() {
            let reporter = Address::generate(&env);
            create_profile(&env, &client, &reporter, &token, &format!("reporter{index}"));
            StellarAssetClient::new(&env, &token).mint(&reporter, &100);
            let reason_hash = BytesN::from_array(&env, reason);
            client.report_post(&reporter, &post_id, &token, &10, &reason_hash);

            let stored = client.get_report(&post_id, &reporter).expect("report is stored");
            prop_assert_eq!(stored.reason_hash, reason_hash);
        }
        prop_assert_eq!(client.get_report_count(&post_id), reason_bytes.len() as u32);
    }

    #[test]
    fn fuzz_block_unblock_cycles_keep_state_consistent(ops in prop::collection::vec(any::<bool>(), 0..30)) {
        let (env, client, admin, _) = setup();
        let token = create_token(&env, &admin);
        let blocker = Address::generate(&env);
        let blocked = Address::generate(&env);
        create_profile(&env, &client, &blocker, &token, "blocker");
        create_profile(&env, &client, &blocked, &token, "blocked");

        let mut expected_blocked = false;
        for should_block in ops {
            if should_block {
                client.block_user(&blocker, &blocked);
                expected_blocked = true;
            } else {
                client.unblock_user(&blocker, &blocked);
                expected_blocked = false;
            }
            prop_assert_eq!(client.is_blocked(&blocker, &blocked), expected_blocked);
        }
    }

    #[test]
    fn fuzz_blocked_users_cannot_follow_or_like_posts(seed in any::<u64>()) {
        let (env, client, admin, _) = setup();
        let token = create_token(&env, &admin);
        let author = Address::generate(&env);
        let blocked = Address::generate(&env);
        create_profile(&env, &client, &author, &token, "author");
        create_profile(&env, &client, &blocked, &token, "blocked");
        let post_id = client.create_post(&author, &SdkString::from_str(&env, "blocked action post"));

        if seed % 2 == 0 {
            client.block_user(&author, &blocked);
            prop_assert!(client.try_follow(&blocked, &author).is_err());
            prop_assert!(client.try_like_post(&blocked, &post_id).is_err());
        } else {
            client.block_user(&blocked, &author);
            prop_assert!(client.try_follow(&author, &blocked).is_err());
            prop_assert!(client.try_like_post(&author, &post_id).is_err());
        }
    }
}
