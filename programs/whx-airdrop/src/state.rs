use anchor_lang::prelude::*;

/// Global configuration stored on-chain at PDA [b"global_config"]
#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// Admin authority who can authorize users, update config, and withdraw remaining tokens
    pub admin: Pubkey,
    /// WHX Token Mint address
    pub whx_mint: Pubkey,
    /// Vault token account holding WHX airdrop tokens
    pub whx_vault: Pubkey,
    /// Meteora DLMM LbPair account address
    pub lb_pair: Pubkey,
    /// Hard-coded maximum total USDT airdrop budget (33,000 USDT = 33_000_000_000 raw units)
    pub max_total_usdt: u64,
    /// Current cumulative authorized USDT quota allocated across all users
    pub total_authorized_usdt: u64,
    /// PDA bump seed
    pub bump: u8,
}

/// User allocation account stored at PDA [b"user_allocation", user_pubkey]
#[account]
#[derive(InitSpace)]
pub struct UserAllocation {
    /// Approved USDT quota in atomic units (6 decimals)
    pub usdt_amount: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl UserAllocation {
    /// Deep domain method: Initialize zero-quota allocation with bump
    pub fn initialize(&mut self, bump: u8) {
        self.usdt_amount = 0;
        self.bump = bump;
    }

    /// Deep domain method: Authorize or update USDT allocation quota approved by admin
    pub fn set_quota(&mut self, usdt_amount: u64) {
        self.usdt_amount = usdt_amount;
    }
}
