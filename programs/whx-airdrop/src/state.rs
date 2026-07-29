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
