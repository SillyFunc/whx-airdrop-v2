# WHX Airdrop Solana Devnet 部署与全流程测试日志 (Task-574 Execution Log)

本文档记录了 `whx_airdrop` 智能合约部署至 **Solana Devnet (测试网)** 后的完整链上日志、公钥数据与交易签名。

---

## 📌 1. 链上部署与账户汇总

- **部署时间**: 2026-07-29 11:40:03 (CST)
- **部署网络**: Solana Devnet (Helius 专用 RPC)
- **部署者 (Admin) 钱包**: `EvrfwzjFAzXaoLww39vYobST4VxxiEUep17Wi5WpvDuW`
- **合约 Program ID**: `Fbu5VVHh6UEBbtAZ2sNB1WzyacZeZXV6TTxsx2jMGZFq`
- **Devnet 测试 WHX Mint**: `3Hp9sWCKmyZk14LFmRvePZhKiw2apGnmb5FXChpogd2U`
- **Devnet 测试 USDT Mint**: `Gm3HjMiSVBzJ2eymqKGkJmhyq3JaCE48jEw3bMFr8Qdc`
- **GlobalConfig PDA**: `CpznkwQBV4WjjEpTNmCD1Yv3cgDbg9KVXxMw3aUyZE1Z`
- **空投金库 (WHX Vault)**: `8Yj3GyY5EmNCMwLkSHGpbYFNDE5QYWjf51iDrkjZ1dSr`
- **Meteora DLMM 模拟池子 (LbPair)**: `5yM99Faz3g2oyhmcGYXXuB2xd9ySeswzSYtpumzhg9kB`

---

## 🔗 2. Solscan 区块链浏览器链接

- **合约控制台**: [Solscan Program Fbu5VVHh6UEBbtAZ2sNB1WzyacZeZXV6TTxsx2jMGZFq](https://solscan.io/account/Fbu5VVHh6UEBbtAZ2sNB1WzyacZeZXV6TTxsx2jMGZFq?cluster=devnet)
- **WHX 代币账户**: [Solscan Token 3Hp9sWCKmyZk14LFmRvePZhKiw2apGnmb5FXChpogd2U](https://solscan.io/token/3Hp9sWCKmyZk14LFmRvePZhKiw2apGnmb5FXChpogd2U?cluster=devnet)
- **初始化交易签名**: [`2VY8MuxaVzDoweKyerTxErYEZzF2Jwq63Ge3ckWf3TicMVAWyzuFqziMpvCKxyd1TUKxMHdbkN3vrKgsoNEwVAWQ`](https://solscan.io/tx/2VY8MuxaVzDoweKyerTxErYEZzF2Jwq63Ge3ckWf3TicMVAWyzuFqziMpvCKxyd1TUKxMHdbkN3vrKgsoNEwVAWQ?cluster=devnet)
- **Claim 领奖交易签名**: [`28bQqYD9KVkCav8M3CbMZGQdiUM7jM3MXkPAe3xbwbr1yhMphQv2FEUDb5jTrbfDDJ3tdvvVwhue9ieGbgAyCoXd`](https://solscan.io/tx/28bQqYD9KVkCav8M3CbMZGQdiUM7jM3MXkPAe3xbwbr1yhMphQv2FEUDb5jTrbfDDJ3tdvvVwhue9ieGbgAyCoXd?cluster=devnet)

---

## 🖥️ 3. Task-574 终端控制台完整原始输出

```text
=========================================================================
🚀 开始 Solana Devnet (Helius 专用 RPC) 合约初始化与端到端自动化跑通演练
=========================================================================
· 部署者 (Admin) 公钥: EvrfwzjFAzXaoLww39vYobST4VxxiEUep17Wi5WpvDuW
· 链上合约 Program ID: Fbu5VVHh6UEBbtAZ2sNB1WzyacZeZXV6TTxsx2jMGZFq

Step 1: 在 Devnet 上一键发行测试 WHX 与 USDT 代币 (Decimals: 6)...
  - Devnet WHX Mint: 3Hp9sWCKmyZk14LFmRvePZhKiw2apGnmb5FXChpogd2U
  - Devnet USDT Mint: Gm3HjMiSVBzJ2eymqKGkJmhyq3JaCE48jEw3bMFr8Qdc

Step 2: 推算 GlobalConfig PDA 并创建所属的 WHX 金库账户 (Vault)...
  - GlobalConfig PDA: CpznkwQBV4WjjEpTNmCD1Yv3cgDbg9KVXxMw3aUyZE1Z
  - WHX Vault 账户: 8Yj3GyY5EmNCMwLkSHGpbYFNDE5QYWjf51iDrkjZ1dSr
  - 已成功向金库充值 1,000,000.000000 WHX 筹码 (Tx: f7TpWNyJmy96Y6amt7Wr...)

Step 3: 创建 Devnet Meteora DLMM 模拟池子 (active_id = -2049, bin_step = 10)...
  - Devnet LbPair 池子地址: 5yM99Faz3g2oyhmcGYXXuB2xd9ySeswzSYtpumzhg9kB
  - 池子当前挂单挂载价格: 1 USDT ≈ 7.766094 WHX

Step 4: 调用合约 initialize 初始化链上配置...
  - 合约初始化成功！(Tx: 2VY8MuxaVzDoweKyerTxErYEZzF2Jwq63Ge3ckWf3TicMVAWyzuFqziMpvCKxyd1TUKxMHdbkN3vrKgsoNEwVAWQ)

=========================================================================
🧪 Step 5: Devnet 端到端真实业务流程闭环测试
=========================================================================
· 测试用户 (Test User) 地址: FwAyhiW1LRPYUCEKuqbpYeX1XPKgewSP3JphU3ooo7Sd
· 1. 用户连钱包发起 initUserAllocation (用户垫付 ~0.00146 SOL 租金)...
   └─ 成功创建用户 PDA: 34uM8WQ7KYMJaqiyYZgQPty29LZz23dnaM7KY7v9rgMD (Tx: Ge47TU4CNRNsgDRMvMR9...)
· 2. 管理员后台审核通过，调 authorizeUser 写入 10.00 USDT (管理员 0 租金)...
   └─ 成功写入 10.000000 USDT 额度 (Tx: 3CaG65BJKxPmN9PHVbRQ...)
· 3. 用户点击 Claim 领空投 WHX...
   └─ 成功执行 Claim (Tx: 28bQqYD9KVkCav8M3CbMZGQdiUM7jM3MXkPAe3xbwbr1yhMphQv2FEUDb5jTrbfDDJ3tdvvVwhue9ieGbgAyCoXd)

=========================================================================
🎉 Solana Devnet (测试网) 全流程测试演练成功闭环！
=========================================================================
· 确权 USDT 额度: 10.000000 USDT
· Meteora 池子价格: 1 USDT ≈ 7.766094 WHX
· 最终用户到账 WHX: ✨ 77.521962 WHX ✨
· PDA 状态: 自动销毁，~0.00146 SOL 租金已 100% 全额退还给测试用户！
=========================================================================
```
