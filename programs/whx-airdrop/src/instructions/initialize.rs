use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::{constants::GLOBAL_CONFIG_SEED, state::GlobalConfig};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub whx_mint: Account<'info, Mint>,

    #[account(
        constraint = whx_vault.mint == whx_mint.key()
    )]
    pub whx_vault: Account<'info, TokenAccount>,

    /// CHECK: Meteora DLMM LbPair account address
    pub lb_pair: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>) -> Result<()> {
    let global_config = &mut ctx.accounts.global_config;
    global_config.admin = ctx.accounts.admin.key();
    global_config.whx_mint = ctx.accounts.whx_mint.key();
    global_config.whx_vault = ctx.accounts.whx_vault.key();
    global_config.lb_pair = ctx.accounts.lb_pair.key();
    global_config.max_total_usdt = 33_000_000_000; // 33,000 USDT (6 decimals)
    global_config.total_authorized_usdt = 0;
    global_config.bump = ctx.bumps.global_config;

    msg!(
        "GlobalConfig initialized: Meteora LbPair = {}, Total Airdrop Cap = 33,000 USDT",
        global_config.lb_pair
    );
    Ok(())
}
