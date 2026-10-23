use soroban_sdk::{token, Address, Env, Map};

use crate::StorageKey;

pub fn current_epoch(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&StorageKey::RewardEpoch)
        .unwrap_or(0u64)
}

pub fn distribute(
    env: &Env,
    admin: &Address,
    token_address: &Address,
    claims: &Map<Address, i128>,
) -> (u64, u32, i128) {
    if claims.is_empty() || claims.len() > 1_000 {
        panic!("invalid reward recipient count");
    }
    let mut total = 0i128;
    for (_, amount) in claims.iter() {
        if amount <= 0 {
            panic!("reward amounts must be positive");
        }
        total = total
            .checked_add(amount)
            .unwrap_or_else(|| panic!("reward total overflow"));
    }
    let epoch = current_epoch(env)
        .checked_add(1)
        .unwrap_or_else(|| panic!("reward epoch overflow"));
    token::Client::new(env, token_address).transfer(
        admin,
        &env.current_contract_address(),
        &total,
    );
    env.storage().instance().set(&StorageKey::RewardEpoch, &epoch);
    env.storage()
        .persistent()
        .set(&StorageKey::RewardToken(epoch), token_address);
    for (recipient, amount) in claims.iter() {
        record_claims(env, epoch, &recipient, amount);
    }
    (epoch, claims.len(), total)
}

pub fn get_claimable(env: &Env, user: &Address, epoch: u64) -> i128 {
    if env
        .storage()
        .persistent()
        .get::<_, bool>(&StorageKey::RewardClaimed(user.clone(), epoch))
        .unwrap_or(false)
    {
        return 0;
    }
    env.storage()
        .persistent()
        .get(&StorageKey::RewardClaimable(user.clone(), epoch))
        .unwrap_or(0i128)
}

pub fn record_claims(env: &Env, epoch: u64, recipient: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&StorageKey::RewardClaimable(recipient.clone(), epoch), &amount);
}

pub fn mark_claimed(env: &Env, epoch: u64, recipient: &Address) {
    env.storage()
        .persistent()
        .set(&StorageKey::RewardClaimed(recipient.clone(), epoch), &true);
}

pub fn claim(env: &Env, epoch: u64, recipient: &Address) -> i128 {
    let amount = get_claimable(env, recipient, epoch);
    if amount <= 0 {
        panic!("no unclaimed reward for epoch");
    }
    let token_address: Address = env
        .storage()
        .persistent()
        .get(&StorageKey::RewardToken(epoch))
        .unwrap_or_else(|| panic!("reward token not found"));
    mark_claimed(env, epoch, recipient);
    token::Client::new(env, &token_address).transfer(
        &env.current_contract_address(),
        recipient,
        &amount,
    );
    amount
}
