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
      .accountsPartial({
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
      .accountsPartial({
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
      .accountsPartial({
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
    expect(accountData.claimed).to.equal(false);

    const globalData = await program.account.globalConfig.fetch(globalConfigPda);
    expect(globalData.totalAuthorizedUsdt.toNumber()).to.equal(0);

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

  it("Step 3: User1 领空投 WHX (算价到账，保留 PDA 领取凭证)", async () => {
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
      .accountsPartial({
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

    const allocationData = await program.account.userAllocation.fetch(user1AllocationPda);
    expect(allocationData.claimed).to.equal(true);
    expect(allocationData.claimedAmount.toNumber()).to.be.greaterThan(0);

    const globalData = await program.account.globalConfig.fetch(globalConfigPda);
    expect(globalData.totalAuthorizedUsdt.toNumber()).to.equal(10_000_000);

    try {
      await program.methods
        .claim()
        .accountsPartial({
          user: user1.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: user1AllocationPda,
          whxVault,
          lbPair: realMarketLbPairPubkey,
          userWhxAccount: user1WhxAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();
      expect.fail("A claimed allocation must not be claimable again");
    } catch (err: any) {
      expect(err.toString()).to.include("AlreadyClaimed");
    }

    const user1WhxBalance = await getAccount(provider.connection, user1WhxAccount);
    const rawWhx = Number(user1WhxBalance.amount);
    const formattedWhx = (rawWhx / 1_000_000).toFixed(6);

    console.log("=======================================================");
    console.log("✨ 步骤 3/4: 用户 (User1) 成功领取 WHX 空投 (PDA 保留领取状态)");
    console.log("-------------------------------------------------------");
    console.log(`· Meteora DLMM 实时算价: 到账 WHX 数量为 ${formattedWhx} WHX (Raw: ${rawWhx})`);
    console.log("· PDA 领取状态: claimed = true，记录领取金额");
    console.log("· 租金状态: PDA 保留，因此不会在 claim 时退还租金");
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
      .accountsPartial({
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
      .accountsPartial({
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

  it("Step 5: 33,000 USDT 链上死门硬熔断拦截测试 (超额领取被拒)", async () => {
    const overflowUser = Keypair.generate();
    const airdropTx = await provider.connection.requestAirdrop(overflowUser.publicKey, 10 * LAMPORTS_PER_SOL);
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({ signature: airdropTx, ...latestBlockhash });

    const [overflowAllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), overflowUser.publicKey.toBuffer()],
      program.programId
    );

    // Initialize allocation for overflowUser
    await program.methods
      .initUserAllocation()
      .accountsPartial({
        user: overflowUser.publicKey,
        userAllocation: overflowAllocationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([overflowUser])
      .rpc();

    // Authorization records the pending quota; the cap is enforced when claiming.
    await program.methods
      .authorizeUser(new anchor.BN(33_000_000_001))
      .accountsPartial({
        admin: admin.publicKey,
        user: overflowUser.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: overflowAllocationPda,
      })
      .signers([admin])
      .rpc();

    const overflowWhxAccount = await createAccount(
      provider.connection,
      overflowUser,
      whxMint,
      overflowUser.publicKey,
      Keypair.generate()
    );

    try {
      await program.methods
        .claim()
        .accountsPartial({
          user: overflowUser.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: overflowAllocationPda,
          whxVault,
          lbPair: realMarketLbPairPubkey,
          userWhxAccount: overflowWhxAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([overflowUser])
        .rpc();

      expect.fail("Should have failed with ExceedsTotalAirdropLimit error");
    } catch (err: any) {
      console.log("=======================================================");
      console.log("🛡️ 步骤 5/5: 33,000 USDT 链上死门硬熔断拦截成功！");
      console.log("-------------------------------------------------------");
      console.log(`· 尝试授权超额 USDT: 33,000.000001 USDT (Raw: 33000000001)`);
      console.log(`· 链上死门拦截捕获错误: ExceedsTotalAirdropLimit (33,000 U 封顶)`);
      console.log("=======================================================\n");

      expect(err.toString()).to.include("ExceedsTotalAirdropLimit");
    }
  });

  it("Step 6: 越权攻击拦截测试 (非 Admin 攻击者尝试授权或修改配置失败)", async () => {
    const targetUser = Keypair.generate();
    const airdropTx = await provider.connection.requestAirdrop(targetUser.publicKey, 5 * LAMPORTS_PER_SOL);
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({ signature: airdropTx, ...latestBlockhash });

    const [targetAllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), targetUser.publicKey.toBuffer()],
      program.programId
    );

    // Target user initializes allocation PDA
    await program.methods
      .initUserAllocation()
      .accountsPartial({
        user: targetUser.publicKey,
        userAllocation: targetAllocationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([targetUser])
      .rpc();

    try {
      await program.methods
        .authorizeUser(new anchor.BN(1_000_000))
        .accountsPartial({
          admin: attacker.publicKey,
          user: targetUser.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: targetAllocationPda,
        })
        .signers([attacker])
        .rpc();

      expect.fail("Attacker authorizeUser should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Step 7: 伪造金库/池子账户攻击拦截测试 (传入错误 whxVault 校验失败)", async () => {
    const fakeVault = await createAccount(
      provider.connection,
      attacker,
      whxMint,
      attacker.publicKey,
      Keypair.generate()
    );

    const testUserKey = Keypair.generate();
    const airdropTx = await provider.connection.requestAirdrop(testUserKey.publicKey, 5 * LAMPORTS_PER_SOL);
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({ signature: airdropTx, ...latestBlockhash });

    const [testAllocPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), testUserKey.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initUserAllocation()
      .accountsPartial({
        user: testUserKey.publicKey,
        userAllocation: testAllocPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([testUserKey])
      .rpc();

    await program.methods
      .authorizeUser(new anchor.BN(5_000_000))
      .accountsPartial({
        admin: admin.publicKey,
        user: testUserKey.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: testAllocPda,
      })
      .signers([admin])
      .rpc();

    const userWhxAccount = await createAccount(
      provider.connection,
      testUserKey,
      whxMint,
      testUserKey.publicKey,
      Keypair.generate()
    );

    try {
      await program.methods
        .claim()
        .accountsPartial({
          user: testUserKey.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: testAllocPda,
          whxVault: fakeVault,
          lbPair: realMarketLbPairPubkey,
          userWhxAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([testUserKey])
        .rpc();

      expect.fail("Claim with fake whxVault should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidPoolAccount");
    }
  });

  // ============================================================
  // Batch Authorization & Set-once Quota Semantics
  // ============================================================

  // Fresh user with SOL rent + initialized allocation PDA
  async function createUserWithAllocation(): Promise<{
    keypair: Keypair;
    allocationPda: PublicKey;
  }> {
    const keypair = Keypair.generate();
    const airdropTx = await provider.connection.requestAirdrop(
      keypair.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: airdropTx,
      ...latestBlockhash,
    });

    const [allocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), keypair.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initUserAllocation()
      .accountsPartial({
        user: keypair.publicKey,
        userAllocation: allocationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([keypair])
      .rpc();

    return { keypair, allocationPda };
  }

  it("Step 8: 批量授权 3 用户成功 (单交易)", async () => {
    const batchUsers = [
      await createUserWithAllocation(),
      await createUserWithAllocation(),
      await createUserWithAllocation(),
    ];

    const users = batchUsers.map((e) => e.keypair.publicKey);
    const amounts = [new anchor.BN(10_000_000), new anchor.BN(20_000_000), new anchor.BN(30_000_000)];

    await program.methods
      .batchAuthorizeUsers(users, amounts)
      .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
      .remainingAccounts(
        batchUsers.map((e) => ({ pubkey: e.allocationPda, isSigner: false, isWritable: true }))
      )
      .signers([admin])
      .rpc();

    for (const [i, e] of batchUsers.entries()) {
      const accountData = await program.account.userAllocation.fetch(e.allocationPda);
      expect(accountData.usdtAmount.toNumber()).to.equal(10_000_000 * (i + 1));
      expect(accountData.claimed).to.equal(false);
    }
  });

  it("Step 9: 批量授权非 Admin 攻击被拒", async () => {
    const target = await createUserWithAllocation();

    try {
      await program.methods
        .batchAuthorizeUsers([target.keypair.publicKey], [new anchor.BN(1_000_000)])
        .accountsPartial({ admin: attacker.publicKey, globalConfig: globalConfigPda })
        .remainingAccounts([
          { pubkey: target.allocationPda, isSigner: false, isWritable: true },
        ])
        .signers([attacker])
        .rpc();
      expect.fail("Attacker batchAuthorizeUsers should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Step 10: 批量参数长度不一致被拒", async () => {
    try {
      await program.methods
        .batchAuthorizeUsers(
          [Keypair.generate().publicKey, Keypair.generate().publicKey],
          [new anchor.BN(1_000_000)]
        )
        .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
        .signers([admin])
        .rpc();
      expect.fail("Length mismatch should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("BatchLengthMismatch");
    }
  });

  it("Step 11: 批量超过 10 人被拒", async () => {
    const elevenUsers = Array.from({ length: 11 }, () => Keypair.generate().publicKey);
    const elevenAmounts = elevenUsers.map(() => new anchor.BN(1_000_000));

    try {
      await program.methods
        .batchAuthorizeUsers(elevenUsers, elevenAmounts)
        .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
        .signers([admin])
        .rpc();
      expect.fail("Batch > 10 users should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("BatchTooLarge");
    }
  });

  it("Step 12: 批量重复用户被拒", async () => {
    const dup = await createUserWithAllocation();

    try {
      await program.methods
        .batchAuthorizeUsers(
          [dup.keypair.publicKey, dup.keypair.publicKey],
          [new anchor.BN(1_000_000), new anchor.BN(2_000_000)]
        )
        .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
        .remainingAccounts([
          { pubkey: dup.allocationPda, isSigner: false, isWritable: true },
        ])
        .signers([admin])
        .rpc();
      expect.fail("Duplicate user in batch should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("DuplicateUserInBatch");
    }

    // Transaction reverted: quota must not have been written
    const accountData = await program.account.userAllocation.fetch(dup.allocationPda);
    expect(accountData.usdtAmount.toNumber()).to.equal(0);
  });

  it("Step 13: 批量用户分配 PDA 不存在被拒", async () => {
    const ghostUser = Keypair.generate();
    const [ghostAllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), ghostUser.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .batchAuthorizeUsers([ghostUser.publicKey], [new anchor.BN(1_000_000)])
        .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
        .remainingAccounts([
          { pubkey: ghostAllocationPda, isSigner: false, isWritable: true },
        ])
        .signers([admin])
        .rpc();
      expect.fail("Missing allocation PDA should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("UserAllocationNotFound");
    }
  });

  it("Step 14: 已授权用户再次授权被拒 (单次, set-once)", async () => {
    const reauth = await createUserWithAllocation();

    await program.methods
      .authorizeUser(new anchor.BN(5_000_000))
      .accountsPartial({
        admin: admin.publicKey,
        user: reauth.keypair.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: reauth.allocationPda,
      })
      .signers([admin])
      .rpc();

    try {
      await program.methods
        .authorizeUser(new anchor.BN(1_000_000))
        .accountsPartial({
          admin: admin.publicKey,
          user: reauth.keypair.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: reauth.allocationPda,
        })
        .signers([admin])
        .rpc();
      expect.fail("Re-authorization should fail with QuotaAlreadySet");
    } catch (err: any) {
      expect(err.toString()).to.include("QuotaAlreadySet");
    }

    // Original quota preserved
    const accountData = await program.account.userAllocation.fetch(reauth.allocationPda);
    expect(accountData.usdtAmount.toNumber()).to.equal(5_000_000);
  });

  it("Step 15: 0 金额授权被拒 (单次)", async () => {
    const zeroUser = await createUserWithAllocation();

    try {
      await program.methods
        .authorizeUser(new anchor.BN(0))
        .accountsPartial({
          admin: admin.publicKey,
          user: zeroUser.keypair.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: zeroUser.allocationPda,
        })
        .signers([admin])
        .rpc();
      expect.fail("Zero quota authorize should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("ZeroQuota");
    }
  });

  it("Step 16: 批量原子性 - 含已授权用户整体回滚", async () => {
    const fresh = await createUserWithAllocation();
    const alreadyAuthorized = await createUserWithAllocation();

    await program.methods
      .authorizeUser(new anchor.BN(7_000_000))
      .accountsPartial({
        admin: admin.publicKey,
        user: alreadyAuthorized.keypair.publicKey,
        globalConfig: globalConfigPda,
        userAllocation: alreadyAuthorized.allocationPda,
      })
      .signers([admin])
      .rpc();

    try {
      await program.methods
        .batchAuthorizeUsers(
          [fresh.keypair.publicKey, alreadyAuthorized.keypair.publicKey],
          [new anchor.BN(1_000_000), new anchor.BN(9_000_000)]
        )
        .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
        .remainingAccounts([
          { pubkey: fresh.allocationPda, isSigner: false, isWritable: true },
          { pubkey: alreadyAuthorized.allocationPda, isSigner: false, isWritable: true },
        ])
        .signers([admin])
        .rpc();
      expect.fail("Batch containing an already-authorized user should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("QuotaAlreadySet");
    }

    // Atomicity: the leading fresh user's quota was not written
    const freshData = await program.account.userAllocation.fetch(fresh.allocationPda);
    expect(freshData.usdtAmount.toNumber()).to.equal(0);
  });

  it("Step 17: 批量 0 金额被拒", async () => {
    const zeroBatchUser = await createUserWithAllocation();

    try {
      await program.methods
        .batchAuthorizeUsers([zeroBatchUser.keypair.publicKey], [new anchor.BN(0)])
        .accountsPartial({ admin: admin.publicKey, globalConfig: globalConfigPda })
        .remainingAccounts([
          { pubkey: zeroBatchUser.allocationPda, isSigner: false, isWritable: true },
        ])
        .signers([admin])
        .rpc();
      expect.fail("Batch with zero quota should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("ZeroQuota");
    }
  });

  it("Step 18: 已 claim 用户授权被拒 (优先级不变)", async () => {
    // user1 was claimed in Step 3; claimed check must still fire first
    const [user1AllocationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_allocation"), user1.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .authorizeUser(new anchor.BN(1_000_000))
        .accountsPartial({
          admin: admin.publicKey,
          user: user1.publicKey,
          globalConfig: globalConfigPda,
          userAllocation: user1AllocationPda,
        })
        .signers([admin])
        .rpc();
      expect.fail("Authorizing a claimed user should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("AlreadyClaimed");
    }
  });

  // ============================================================
  // Vault Full Withdrawal (admin-only)
  // ============================================================

  it("Step 19: 管理员全量提取金库 WHX 至指定钱包", async () => {
    const vaultBefore = await getAccount(provider.connection, whxVault);
    const vaultAmountBefore = Number(vaultBefore.amount);
    expect(vaultAmountBefore).to.be.greaterThan(0);

    // Recipient: any wallet's WHX token account (owner need not be admin)
    const recipientOwner = Keypair.generate();
    const recipientAccount = await createAccount(
      provider.connection,
      admin,
      whxMint,
      recipientOwner.publicKey,
      Keypair.generate()
    );

    await program.methods
      .withdrawVault()
      .accountsPartial({
        admin: admin.publicKey,
        globalConfig: globalConfigPda,
        whxVault: whxVault,
        recipient: recipientAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    const vaultAfter = await getAccount(provider.connection, whxVault);
    expect(Number(vaultAfter.amount)).to.equal(0);

    const recipientAfter = await getAccount(provider.connection, recipientAccount);
    expect(Number(recipientAfter.amount)).to.equal(vaultAmountBefore);
  });

  it("Step 20: 非 Admin 提取被拒", async () => {
    const recipientAccount = await createAccount(
      provider.connection,
      admin,
      whxMint,
      attacker.publicKey,
      Keypair.generate()
    );

    try {
      await program.methods
        .withdrawVault()
        .accountsPartial({
          admin: attacker.publicKey,
          globalConfig: globalConfigPda,
          whxVault: whxVault,
          recipient: recipientAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Attacker withdrawVault should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Step 21: recipient mint 不匹配被拒", async () => {
    // usdtMint token account passed as recipient -> mint mismatch
    const wrongMintAccount = await createAccount(
      provider.connection,
      admin,
      usdtMint,
      attacker.publicKey,
      Keypair.generate()
    );

    try {
      await program.methods
        .withdrawVault()
        .accountsPartial({
          admin: admin.publicKey,
          globalConfig: globalConfigPda,
          whxVault: whxVault,
          recipient: wrongMintAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
      expect.fail("Withdraw to non-WHX account should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidRecipient");
    }
  });

  it("Step 22: 空金库提取被拒", async () => {
    const recipientAccount = await createAccount(
      provider.connection,
      admin,
      whxMint,
      admin.publicKey,
      Keypair.generate()
    );

    try {
      await program.methods
        .withdrawVault()
        .accountsPartial({
          admin: admin.publicKey,
          globalConfig: globalConfigPda,
          whxVault: whxVault,
          recipient: recipientAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
      expect.fail("Withdraw from empty vault should fail");
    } catch (err: any) {
      expect(err.toString()).to.include("ZeroBalance");
    }
  });
});
