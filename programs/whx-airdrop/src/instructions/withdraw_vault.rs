use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::GLOBAL_CONFIG_SEED,
    error::ErrorCode,
    state::GlobalConfig,
};

#[derive(Accounts)]
pub struct WithdrawVault<'info> {
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
        constraint = recipient.mint == global_config.whx_mint @ ErrorCode::InvalidRecipient
    )]
    pub recipient: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Admin withdraws the FULL WHX vault balance to an arbitrary wallet token account.
/// Full-withdrawal semantics: amount = vault balance (no amount parameter).
/// Unclaimed quotas are naturally blocked afterwards by the claim-time
/// InsufficientVaultBalance check.
pub fn handle_withdraw_vault(ctx: Context<WithdrawVault>) -> Result<()> {
    // Duplicate mutable account guard: self-transfer is a no-op, reject it
    require!(
        ctx.accounts.recipient.key() != ctx.accounts.whx_vault.key(),
        ErrorCode::InvalidRecipient
    );

    let amount = ctx.accounts.whx_vault.amount;
    require!(amount > 0, ErrorCode::ZeroBalance);

    // CPI transfer signed by the Global Config PDA (same pattern as claim)
    let bump = ctx.accounts.global_config.bump;
    let seeds = &[GLOBAL_CONFIG_SEED, &[bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.whx_vault.to_account_info(),
        to: ctx.accounts.recipient.to_account_info(),
        authority: ctx.accounts.global_config.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)?;

    emit!(crate::events::WithdrawEvent {
        recipient: ctx.accounts.recipient.key(),
        amount,
    });

    msg!(
        "Vault fully withdrawn: {} WHX raw units transferred to {}",
        amount,
        ctx.accounts.recipient.key()
    );

    Ok(())
}
