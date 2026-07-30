use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::{GLOBAL_CONFIG_SEED, USER_ALLOCATION_SEED},
    error::ErrorCode,
    price_math::PriceMath,
    state::{GlobalConfig, UserAllocation},
};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [USER_ALLOCATION_SEED, user.key().as_ref()],
        bump = user_allocation.bump
    )]
    pub user_allocation: Account<'info, UserAllocation>,

    #[account(
        mut,
        constraint = whx_vault.key() == global_config.whx_vault @ ErrorCode::InvalidPoolAccount
    )]
    pub whx_vault: Account<'info, TokenAccount>,

    /// CHECK: Meteora DLMM LbPair account, verified against global_config.lb_pair
    #[account(
        constraint = lb_pair.key() == global_config.lb_pair @ ErrorCode::InvalidPoolAccount
    )]
    pub lb_pair: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = user_whx_account.owner == user.key(),
        constraint = user_whx_account.mint == global_config.whx_mint
    )]
    pub user_whx_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let usdt_amount_raw = ctx.accounts.user_allocation.usdt_amount;

    // 1. Delegate math calculation & byte decoding through deep PriceMath module
    let lb_pair_data = ctx.accounts.lb_pair.try_borrow_data()?;
    let output = PriceMath::calculate_whx_airdrop(&lb_pair_data, usdt_amount_raw)?;

    // 2. Delegate budget cap check and state accounting to GlobalConfig domain model
    ctx.accounts.global_config.try_record_claim(usdt_amount_raw)?;

    // 3. Delegate allocation claim state transition to UserAllocation domain model
    ctx.accounts.user_allocation.mark_claimed(output.whx_amount)?;

    require!(
        ctx.accounts.whx_vault.amount >= output.whx_amount,
        ErrorCode::InsufficientVaultBalance
    );

    // 4. CPI Transfer WHX to user token account
    let bump = ctx.accounts.global_config.bump;
    let seeds = &[GLOBAL_CONFIG_SEED, &[bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.whx_vault.to_account_info(),
        to: ctx.accounts.user_whx_account.to_account_info(),
        authority: ctx.accounts.global_config.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, output.whx_amount)?;

    emit!(crate::events::UserClaimedEvent {
        user: ctx.accounts.user.key(),
        usdt_amount: usdt_amount_raw,
        whx_amount: output.whx_amount,
    });

    msg!(
        "Claim successful! Active ID: {}, Bin Step: {}, Price Scaled (10^9): {}, WHX Amount: {}. Allocation PDA retained as claimed receipt.",
        output.active_id,
        output.bin_step,
        output.price_scaled,
        output.whx_amount
    );

    Ok(())
}
