use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: Caller is not the admin authority")]
    Unauthorized,

    #[msg("AlreadyClaimed: This user allocation has already been claimed")]
    AlreadyClaimed,

    #[msg("InvalidPoolAccount: Provided Meteora LbPair pool account does not match global config or is invalid")]
    InvalidPoolAccount,

    #[msg("MathOverflow: Arithmetic overflow occurred during calculation")]
    MathOverflow,

    #[msg("ZeroBalance: Pool balance is zero")]
    ZeroBalance,

    #[msg("InsufficientVaultBalance: WHX vault balance is insufficient for claim")]
    InsufficientVaultBalance,

    #[msg("ExceedsTotalAirdropLimit: Cumulative authorized allocation exceeds total 33,000 USDT budget limit")]
    ExceedsTotalAirdropLimit,

    #[msg("ZeroQuota: USDT quota must be greater than zero")]
    ZeroQuota,

    #[msg("QuotaAlreadySet: User already has an authorized quota; quota is set-once and irrevocable")]
    QuotaAlreadySet,

    #[msg("BatchLengthMismatch: users and amounts vectors must have the same length")]
    BatchLengthMismatch,

    #[msg("BatchTooLarge: Batch size must be between 1 and 10 users")]
    BatchTooLarge,

    #[msg("UserAllocationNotFound: User allocation PDA missing or invalid in remaining accounts")]
    UserAllocationNotFound,

    #[msg("DuplicateUserInBatch: The same user appears more than once in the batch")]
    DuplicateUserInBatch,

    #[msg("InvalidRecipient: Recipient token account is invalid (mint mismatch or identical to vault)")]
    InvalidRecipient,
}
