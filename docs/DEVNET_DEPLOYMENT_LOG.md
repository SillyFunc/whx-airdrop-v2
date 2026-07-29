# WHX Airdrop Solana Devnet 最新合约部署与全流程测试日志

本文档记录了重构优化后的 `whx_airdrop` 智能合约部署至 **Solana Devnet (测试网)** 后的完整链上日志、公钥数据与交易签名。老合约租金已成功关停回收。

---

## 📌 1. 老合约注销与租金回收

- **老合约 Program ID**: `Fbu5VVHh6UEBbtAZ2sNB1WzyacZeZXV6TTxsx2jMGZFq`
- **关闭状态**: ✅ 已成功执行 `solana program close`
- **回收租金**: **1.77906648 SOL 100% 退还** 至 Admin 管理员钱包

---

## 📌 2. 最新链上部署与账户汇总

- **部署时间**: 2026-07-29 16:26:27 (CST)
- **部署网络**: Solana Devnet (Helius 专用 RPC)
- **部署者 (Admin) 钱包**: `EvrfwzjFAzXaoLww39vYobST4VxxiEUep17Wi5WpvDuW`
- **最新合约 Program ID**: `3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ`
- **Devnet WHX Mint**: `J6bwWCj9fTAyWVZMZT8KFySsBMhmZrasPTVThGSZYGu8`
- **Devnet USDT Mint**: `7mcbpDyzPyBkHkKPR5JZv2ZEuFH3cQoedXeZYjmysBEt`
- **GlobalConfig PDA**: `6qCb6TCpCm1jQqRUhhA8NBmYCgueBmdN8eMqEFKfK8hn`
- **空投金库 (WHX Vault)**: `3GYNDjis8PBmo42KPi2ibHo3wwP6BRXBZyFRr8WYpUP3`
- **Meteora DLMM 模拟池子 (LbPair)**: `9Geg7J26Kj7HPcNroRvuQQZw4T8y6V26fY2EBPp1rub9`

---

## 🔗 3. Solscan 区块链浏览器链接

- **最新合约控制台**: [Solscan Program 3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ](https://solscan.io/account/3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ?cluster=devnet)
- **WHX 代币账户**: [Solscan Token J6bwWCj9fTAyWVZMZT8KFySsBMhmZrasPTVThGSZYGu8](https://solscan.io/token/J6bwWCj9fTAyWVZMZT8KFySsBMhmZrasPTVThGSZYGu8?cluster=devnet)
- **初始化交易签名**: [`2NS1m1uD7brZ6jXitkBJ37og12ATxmR6VKuQoeKNNEr6t1Aoe84SoH4RXaVLEKaLquvhCw2i64RVXouGUKA6hH3W`](https://solscan.io/tx/2NS1m1uD7brZ6jXitkBJ37og12ATxmR6VKuQoeKNNEr6t1Aoe84SoH4RXaVLEKaLquvhCw2i64RVXouGUKA6hH3W?cluster=devnet)
- **Claim 领奖交易签名**: [`X6EbJipF3AqeKBpDKBYvf9uWcEKGF4RYNKFU55gj1TQUUxPy6fXqTqTMfTrwkVzCwSk3g9bLZSLjb3ytew5yhSw`](https://solscan.io/tx/X6EbJipF3AqeKBpDKBYvf9uWcEKGF4RYNKFU55gj1TQUUxPy6fXqTqTMfTrwkVzCwSk3g9bLZSLjb3ytew5yhSw?cluster=devnet)

---

## 🖥️ 4. Devnet 终端控制台完整原始输出

```text
=========================================================================
🚀 开始 Solana Devnet (Helius 专用 RPC) 最新合约全流程端到端跑通演练
=========================================================================
· 部署者 (Admin) 公钥: EvrfwzjFAzXaoLww39vYobST4VxxiEUep17Wi5WpvDuW
· 链上最新合约 Program ID: 3jkwSf6RG912UinxyAMXyMLomWYGkgAiP9iVGiM6ruEJ

Step 1: 在 Devnet 发行 WHX 与 USDT 测试代币 (Decimals: 6)...
  - Devnet WHX Mint: J6bwWCj9fTAyWVZMZT8KFySsBMhmZrasPTVThGSZYGu8
  - Devnet USDT Mint: 7mcbpDyzPyBkHkKPR5JZv2ZEuFH3cQoedXeZYjmysBEt

Step 2: 推算 GlobalConfig PDA 并创建所属 WHX 金库账户 (Vault)...
  - GlobalConfig PDA: 6qCb6TCpCm1jQqRUhhA8NBmYCgueBmdN8eMqEFKfK8hn
  - WHX Vault 账户: 3GYNDjis8PBmo42KPi2ibHo3wwP6BRXBZyFRr8WYpUP3
  - 已成功向金库充值 1,000,000.000000 WHX 筹码 (Tx: aXgrcRhX4UqCN5TYjpnc...)

Step 3: 构建 Devnet Meteora DLMM 模拟池子 (active_id = -2049, bin_step = 10)...
  - Devnet LbPair 池子地址: 9Geg7J26Kj7HPcNroRvuQQZw4T8y6V26fY2EBPp1rub9
  - 池子挂载价格数据: active_id = -2049, bin_step = 10 (1 USDT ≈ 7.766094 WHX)

Step 4: 调用合约 initialize 初始化链上配置...
  - 合约初始化成功！(Tx: 2NS1m1uD7brZ6jXitkBJ37og12ATxmR6VKuQoeKNNEr6t1Aoe84SoH4RXaVLEKaLquvhCw2i64RVXouGUKA6hH3W)

=========================================================================
🧪 Step 5: Devnet 端到端真实业务流程闭环测试
=========================================================================
· 测试用户 (Test User) 地址: 54S2AJseVN9R5ZNtPsKJvTJpT3hdrJK6YvVNtZupYK7r
· 1. 用户连钱包发起 initUserAllocation (用户垫付 ~0.00146 SOL 租金)...
   └─ 成功创建用户 PDA: E56psjBHfKnRE5rPC3moWs3koeozAnytrXtuSpqRcBtB (Tx: VWv1a7KUF2UUnc4rwwJq...)
· 2. 管理员后台审核通过，调 authorizeUser 写入 10.00 USDT (管理员 0 租金)...
   └─ 成功写入 10.000000 USDT 额度 (Tx: 5Dnaov5wjUTFqVo2cXMj...)
· 3. 用户点击 Claim 领空投 WHX...
   └─ 成功执行 Claim (Tx: X6EbJipF3AqeKBpDKBYvf9uWcEKGF4RYNKFU55gj1TQUUxPy6fXqTqTMfTrwkVzCwSk3g9bLZSLjb3ytew5yhSw)

=========================================================================
🎉 Solana Devnet (测试网) 全流程测试演练成功闭环！
=========================================================================
· 确权 USDT 额度: 10.000000 USDT
· Meteora DLMM 实时价格: 1 USDT ≈ 7.766094 WHX
· 最终用户到账 WHX: ✨ 77.521962 WHX ✨
· PDA 状态: 自动销毁，~0.00146 SOL 租金已 100% 全额退还给测试用户！
=========================================================================
```
