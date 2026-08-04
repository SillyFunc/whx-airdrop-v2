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
    /// Cumulative USDT quota confirmed by completed claims
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
    /// Whether this allocation has already been claimed
    pub claimed: bool,
    /// WHX amount transferred when the allocation was claimed
    pub claimed_amount: u64,
}

impl GlobalConfig {
    /// Deep domain method: Verify 33,000 USDT total cap and record claimed USDT budget
    pub fn try_record_claim(&mut self, usdt_amount: u64) -> Result<()> {
        let new_total = self
            .total_authorized_usdt
            .checked_add(usdt_amount)
            .ok_or(crate::error::ErrorCode::MathOverflow)?;

        require!(
            new_total <= self.max_total_usdt,
            crate::error::ErrorCode::ExceedsTotalAirdropLimit
        );

        self.total_authorized_usdt = new_total;
        Ok(())
    }
}

impl UserAllocation {
    /// Deep domain method: Initialize zero-quota allocation with bump
    pub fn initialize(&mut self, bump: u8) {
        self.usdt_amount = 0;
        self.bump = bump;
        self.claimed = false;
        self.claimed_amount = 0;
    }    /// Deep domain method: Set a user's USDT allocation quota.
    /// Set-once semantics: a non-zero quota cannot be overwritten and there is
    /// no cancel instruction — an erroneous authorization cannot be revoked.
    pub fn set_quota(&mut self, usdt_amount: u64) -> Result<()> {
        require!(
            !self.claimed,
            crate::error::ErrorCode::AlreadyClaimed
        );
        require!(usdt_amount > 0, crate::error::ErrorCode::ZeroQuota);
        require!(
            self.usdt_amount == 0,
            crate::error::ErrorCode::QuotaAlreadySet
        );
        self.usdt_amount = usdt_amount;
        Ok(())
    }

    /// Deep domain method: Mark allocation as claimed with state invariant check
    pub fn mark_claimed(&mut self, claimed_amount: u64) -> Result<()> {
        require!(
            !self.claimed,
            crate::error::ErrorCode::AlreadyClaimed
        );
        self.claimed = true;
        self.claimed_amount = claimed_amount;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::error::Error as AnchorLangError;

    fn fresh_allocation() -> UserAllocation {
        UserAllocation {
            usdt_amount: 0,
            bump: 255,
            claimed: false,
            claimed_amount: 0,
        }
    }

    fn error_code(err: AnchorLangError) -> String {
        match err {
            AnchorLangError::AnchorError(e) => e.error_name,
            other => panic!("unexpected error variant: {:?}", other),
        }
    }

    #[test]
    fn set_quota_sets_zero_quota_allocation() {
        let mut alloc = fresh_allocation();
        alloc.set_quota(1_000_000).unwrap();
        assert_eq!(alloc.usdt_amount, 1_000_000);
        assert!(!alloc.claimed);
    }

    #[test]
    fn set_quota_rejects_zero_amount() {
        let mut alloc = fresh_allocation();
        let err = alloc.set_quota(0).unwrap_err();
        assert_eq!(error_code(err), "ZeroQuota");
    }

    #[test]
    fn set_quota_rejects_existing_quota() {
        let mut alloc = fresh_allocation();
        alloc.set_quota(5_000_000).unwrap();
        let err = alloc.set_quota(1_000_000).unwrap_err();
        assert_eq!(error_code(err), "QuotaAlreadySet");
    }

    #[test]
    fn set_quota_rejects_claimed_allocation() {
        let mut alloc = fresh_allocation();
        alloc.claimed = true;
        alloc.usdt_amount = 5_000_000;
        let err = alloc.set_quota(1_000_000).unwrap_err();
        assert_eq!(error_code(err), "AlreadyClaimed");
    }
}
