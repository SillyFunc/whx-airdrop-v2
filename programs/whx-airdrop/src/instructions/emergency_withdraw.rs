use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::GLOBAL_CONFIG_SEED,
    error::ErrorCode,
    state::GlobalConfig,
};

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        constraint = whx_vault.key() == global_config.whx_vault @ ErrorCode::InvalidPoolAccount
    )]
    pub whx_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = recipient_whx_account.mint == global_config.whx_mint
    )]
    pub recipient_whx_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.whx_vault.amount >= amount,
        ErrorCode::InsufficientVaultBalance
    );

    let global_config = &ctx.accounts.global_config;
    let bump = global_config.bump;
    let seeds = &[
        GLOBAL_CONFIG_SEED,
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.whx_vault.to_account_info(),
        to: ctx.accounts.recipient_whx_account.to_account_info(),
        authority: ctx.accounts.global_config.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );

    token::transfer(cpi_ctx, amount)?;

    msg!("Emergency withdraw successful! Amount: {}", amount);
    Ok(())
}
