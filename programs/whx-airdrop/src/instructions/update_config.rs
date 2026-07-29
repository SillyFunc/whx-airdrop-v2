use anchor_lang::prelude::*;

use crate::{constants::GLOBAL_CONFIG_SEED, error::ErrorCode, state::GlobalConfig};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    new_admin: Option<Pubkey>,
    new_whx_vault: Option<Pubkey>,
    new_lb_pair: Option<Pubkey>,
) -> Result<()> {
    let global_config = &mut ctx.accounts.global_config;

    if let Some(admin) = new_admin {
        global_config.admin = admin;
    }
    if let Some(whx_vault) = new_whx_vault {
        global_config.whx_vault = whx_vault;
    }
    if let Some(lb_pair) = new_lb_pair {
        global_config.lb_pair = lb_pair;
    }

    msg!("GlobalConfig updated successfully");
    Ok(())
}
