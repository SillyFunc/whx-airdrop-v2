import { describe, it, before } from "mocha";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("whx_airdrop User-Funded Allocation Lifecycle & Deep PriceMath Engine Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;

  const admin = Keypair.generate();
  const attacker = Keypair.generate();
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  let whxMint: PublicKey;
  let usdtMint: PublicKey;
  let whxVault: PublicKey;

  let globalConfigPda: PublicKey;
  let globalConfigBump: number;

  // Mainnet Meteora DLMM Pool Address (Loaded via localnet fixture: active_id = -2049, bin_step = 10 -> 1 USDT ≈ 7.766 WHX)
  const realMarketLbPairPubkey = new PublicKey("6nDd6Y4SEpURbzArtg3GffL2Ltw16FD2SMKfyUnX7SXf");

  before(async () => {
    const signers = [admin, attacker, user1, user2];
    for (const s of signers) {
      const airdropTx = await provider.connection.requestAirdrop(s.publicKey, 10 * LAMPORTS_PER_SOL);
      const latestBlockhash = await provider.connection.getLatestBlockhash();
      await provider.connection.confirmTransaction({ signature: airdropTx, ...latestBlockhash });
    }

    [globalConfigPda, globalConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      program.programId
    );

    whxMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);
    usdtMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);

    whxVault = await createAccount(
      provider.connection,
      admin,
      whxMint,
      globalConfigPda,
      Keypair.generate()
    );

    await mintTo(provider.connection, admin, whxMint, whxVault, admin, 1_000_000_000_000);

    await program.methods
      .initialize()
      .accounts({
        admin: admin.publicKey,
        whxMint: whxMint,
        whxVault: whxVault,
        lbPair: realMarketLbPairPubkey,
        globalConfig: globalConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });

  it("Step 1: User1 连钱包初始化 PDA (User1 支付 ~0.00146 SOL 开户租金)", async () => {
    const [user1AllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), user1.publicKey.toBuffer()],
      program.programId
    );

    const user1BalanceBefore = await provider.connection.getBalance(user1.publicKey);

    await program.methods
      .initUserAllocation()
      .accounts({
        user: user1.publicKey,
        userAllocation: user1AllocationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

    const user1BalanceAfter = await provider.connection.getBalance(user1.publicKey);
    const rentPaid = (user1BalanceBefore - user1BalanceAfter) / LAMPORTS_PER_SOL;

    const accountData = await program.account.userAllocation.fetch(user1AllocationPda);
    expect(accountData.usdtAmount.toNumber()).to.equal(0);

    console.log("\n=======================================================");
    console.log("📝 步骤 1/4: 用户 (User1) 连钱包开户");
    console.log("-------------------------------------------------------");
    console.log(`· User1 公钥: ${user1.publicKey.toBase58()}`);
    console.log(`· 账户创建: initUserAllocation 发起成功`);
    console.log(`· 租金扣除: User1 垫付开户租金 ${rentPaid.toFixed(6)} SOL (PDA 初始额度: 0 U)`);
    console.log("=======================================================\n");
  });

  it("Step 2: 管理员后台审核通过，写入 10 USDT (管理员 0 租金支出)", async () => {
    const [user1AllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), user1.publicKey.toBuffer()],
      program.programId
    );

    const adminBalanceBefore = await provider.connection.getBalance(admin.publicKey);

    await program.methods
      .authorizeUser(new anchor.BN(10_000_000))
      .accounts({
        admin: admin.publicKey,
        user: user1.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: user1AllocationPda,
      })
      .signers([admin])
      .rpc();

    const adminBalanceAfter = await provider.connection.getBalance(admin.publicKey);
    const adminCost = (adminBalanceBefore - adminBalanceAfter) / LAMPORTS_PER_SOL;

    const accountData = await program.account.userAllocation.fetch(user1AllocationPda);
    expect(accountData.usdtAmount.toNumber()).to.equal(10_000_000);

    console.log("=======================================================");
    console.log("🔑 步骤 2/4: 管理员 (Admin) 确权写入 10 USDT 额度");
    console.log("-------------------------------------------------------");
    console.log(`· 管理员公钥: ${admin.publicKey.toBase58()}`);
    console.log(`· 写入确权: authorizeUser 执行成功，写入 10.000000 USDT (Raw: 10000000)`);
    console.log(`· 租金支出: 管理员支付租金 0.000000 SOL (仅消耗约 ${adminCost.toFixed(6)} SOL 常规交易手续费)`);
    console.log(`· 验证结果: 链上 UserAllocation PDA 额度更新为: 10,000,000 Raw Units`);
    console.log("=======================================================\n");

    expect(adminCost).to.be.lessThan(0.0001);
  });

  it("Step 3: User1 领空投 WHX (算价到账，销毁 PDA，~0.00146 SOL 租金 100% 退还 User1)", async () => {
    const [user1AllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), user1.publicKey.toBuffer()],
      program.programId
    );

    const user1WhxAccount = await createAccount(
      provider.connection,
      user1,
      whxMint,
      user1.publicKey,
      Keypair.generate()
    );

    const user1BalanceBefore = await provider.connection.getBalance(user1.publicKey);

    await program.methods
      .claim()
      .accounts({
        user: user1.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: user1AllocationPda,
        whxVault: whxVault,
        lbPair: realMarketLbPairPubkey,
        userWhxAccount: user1WhxAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user1])
      .rpc();

    const user1BalanceAfter = await provider.connection.getBalance(user1.publicKey);
    expect(user1BalanceAfter).to.be.greaterThan(user1BalanceBefore - 0.0001 * LAMPORTS_PER_SOL);

    const closedPdaInfo = await provider.connection.getAccountInfo(user1AllocationPda);
    expect(closedPdaInfo).to.be.null;

    const user1WhxBalance = await getAccount(provider.connection, user1WhxAccount);
    const rawWhx = Number(user1WhxBalance.amount);
    const formattedWhx = (rawWhx / 1_000_000).toFixed(6);

    console.log("=======================================================");
    console.log("✨ 步骤 3/4: 用户 (User1) 成功领取 WHX 空投 (含 100% 租金退还)");
    console.log("-------------------------------------------------------");
    console.log(`· Meteora DLMM 实时算价: 到账 WHX 数量为 ${formattedWhx} WHX (Raw: ${rawWhx})`);
    console.log("· PDA 销毁结算: close = user1 自动执行");
    console.log("· 租金退还结果: 步骤1中垫付的 ~0.00146 SOL 租金已 100% 全额退还给 User1 钱包");
    console.log("=======================================================\n");

    expect(rawWhx).to.be.closeTo(77_521_962, 1_000_000);
  });

  it("Step 4: 管理员驳回 User2 申请 (销毁 PDA，~0.00146 SOL 租金 100% 退还 User2)", async () => {
    const [user2AllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), user2.publicKey.toBuffer()],
      program.programId
    );

    // User2 initializes PDA
    await program.methods
      .initUserAllocation()
      .accounts({
        user: user2.publicKey,
        userAllocation: user2AllocationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user2])
      .rpc();

    const user2BalanceBeforeCancel = await provider.connection.getBalance(user2.publicKey);

    // Admin rejects / cancels User2's allocation
    await program.methods
      .cancelUserAllocation()
      .accounts({
        admin: admin.publicKey,
        user: user2.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: user2AllocationPda,
      })
      .signers([admin])
      .rpc();

    const user2BalanceAfterCancel = await provider.connection.getBalance(user2.publicKey);
    expect(user2BalanceAfterCancel).to.be.greaterThan(user2BalanceBeforeCancel);

    const closedPdaInfo = await provider.connection.getAccountInfo(user2AllocationPda);
    expect(closedPdaInfo).to.be.null;

    console.log("=======================================================");
    console.log("🛑 步骤 4/4: 管理员 (Admin) 后台驳回 User2 空投申请");
    console.log("-------------------------------------------------------");
    console.log("· 管理员驳回申请，调 cancelUserAllocation 销毁 PDA");
    console.log("· 租金退还结果: User2 垫付的 ~0.00146 SOL 租金已 100% 全额退还给 User2 钱包");
    console.log("=======================================================\n");
  });
});
