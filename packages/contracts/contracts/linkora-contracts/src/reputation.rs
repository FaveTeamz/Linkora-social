use soroban_sdk::{Address, Env};

use crate::StorageKey;

const DECAY_WINDOW_LEDGERS: u32 = 17_280;
const DECAY_BPS: i128 = 500;
const FACTOR_SCALE: i128 = 1_000_000_000;

pub fn get_score(env: &Env, user: &Address) -> i64 {
    env.storage()
        .persistent()
        .get(&StorageKey::ReputationScore(user.clone()))
        .unwrap_or(0i64)
}

pub fn update_score(env: &Env, user: &Address, delta: i64) -> i64 {
    let current = get_score(env, user);
    let updated = current
        .checked_add(delta)
        .unwrap_or_else(|| panic!("reputation score overflow"))
        .max(0);
    let key = StorageKey::ReputationScore(user.clone());
    env.storage().persistent().set(&key, &updated);
    let ledger_key = StorageKey::ReputationDecayLedger(user.clone());
    if !env.storage().persistent().has(&ledger_key) {
        env.storage().persistent().set(&ledger_key, &env.ledger().sequence());
    }
    updated
}

pub fn apply_decay(env: &Env, user: &Address) -> i64 {
    let current_ledger = env.ledger().sequence();
    let ledger_key = StorageKey::ReputationDecayLedger(user.clone());
    let last_decay = env
        .storage()
        .persistent()
        .get::<_, u32>(&ledger_key)
        .unwrap_or(current_ledger);
    let windows = current_ledger.saturating_sub(last_decay) / DECAY_WINDOW_LEDGERS;
    if windows == 0 {
        return get_score(env, user);
    }

    let mut exponent = windows;
    let mut factor = ((10_000 - DECAY_BPS) * FACTOR_SCALE) / 10_000;
    let mut multiplier = FACTOR_SCALE;
    while exponent > 0 {
        if exponent & 1 == 1 {
            multiplier = (multiplier * factor) / FACTOR_SCALE;
        }
        exponent >>= 1;
        if exponent > 0 {
            factor = (factor * factor) / FACTOR_SCALE;
        }
    }

    let updated = ((get_score(env, user) as i128 * multiplier) / FACTOR_SCALE) as i64;
    let score_key = StorageKey::ReputationScore(user.clone());
    env.storage().persistent().set(&score_key, &updated.max(0));
    env.storage()
        .persistent()
        .set(&ledger_key, &(last_decay + windows * DECAY_WINDOW_LEDGERS));
    updated.max(0)
}
