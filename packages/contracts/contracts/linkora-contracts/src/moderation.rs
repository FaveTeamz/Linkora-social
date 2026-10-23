use soroban_sdk::{Address, Env, Vec};

use crate::{ModerationReport, StorageKey};

pub const MAX_REPORTS_PER_USER: u32 = 100;

pub fn report(env: &Env, reporter: &Address, target: &Address, reason_code: u32) {
    if !(1..=8).contains(&reason_code) {
        panic!("invalid moderation reason code");
    }
    if reporter == target {
        panic!("cannot report yourself");
    }
    let dedupe_key = StorageKey::UserReport(target.clone(), reporter.clone());
    if env.storage().persistent().has(&dedupe_key) {
        return;
    }
    let reports_key = StorageKey::UserReports(target.clone());
    let mut reports: Vec<ModerationReport> = env
        .storage()
        .persistent()
        .get(&reports_key)
        .unwrap_or(Vec::new(env));
    if reports.len() >= MAX_REPORTS_PER_USER {
        panic!("report limit reached for user");
    }
    reports.push_back(ModerationReport {
        reporter: reporter.clone(),
        reason_code,
        reported_ledger: env.ledger().sequence(),
    });
    env.storage().persistent().set(&reports_key, &reports);
    env.storage().persistent().set(&dedupe_key, &true);
}

pub fn ban(env: &Env, target: &Address) {
    let key = StorageKey::Banned(target.clone());
    env.storage().persistent().set(&key, &true);
}

pub fn unban(env: &Env, target: &Address) {
    env.storage()
        .persistent()
        .remove(&StorageKey::Banned(target.clone()));
}

pub fn is_banned(env: &Env, target: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&StorageKey::Banned(target.clone()))
        .unwrap_or(false)
}
