import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WhxAirdrop } from "../target/types/whx_airdrop";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const MAINNET_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=a2e06fa2-a3ad-4fe2-937c-057725a623c9";

const WHX_MINT_PUBKEY = new PublicKey(
  "CfQChdS5RgUd9FJwg5cYDh56MWWrMKvGuvKDaQg4VFUy"
);

async function main() {
  console.log("=========================================================================");
  console.log("🚀 开始为合约创建专属 WHX 金库账户 (PDA Token Vault) 并更新配置");
  console.log("=========================================================================");

  // 1. 读取管理员 Keypair (~/.config/solana/id.json)
  const adminKeypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const adminSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8"))
  );
  const adminKeypair = Keypair.fromSecretKey(adminSecretKey);

  const connection = new anchor.web3.Connection(MAINNET_RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.WhxAirdrop as Program<WhxAirdrop>;
  console.log(`· 合约 Program ID: ${program.programId.toBase58()}`);

  // 2. 派生 GlobalConfig PDA
  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );
  console.log(`· GlobalConfig PDA 地址: ${globalConfigPda.toBase58()}`);

  // 3. 计算 GlobalConfig PDA 专属的 WHX ATA 账户地址
  const contractVaultAta = getAssociatedTokenAddressSync(
    WHX_MINT_PUBKEY,
    globalConfigPda,
    true // allowOwnerOffCurve = true (因为 owner 是 PDA)
  );

  console.log(`\n=========================================================================`);
  console.log(`✨ 合约专属充值金库地址 (PDA Vault ATA):`);
  console.log(`\n   ${contractVaultAta.toBase58()}\n`);
  console.log(`=========================================================================\n`);

  // 4. 检查是否已经在链上创建
  const accInfo = await connection.getAccountInfo(contractVaultAta);
  if (accInfo === null) {
    console.log("正在向 Solana 正式网发送交易，创建合约专属金库账户...");
    const createIx = createAssociatedTokenAccountInstruction(
      adminKeypair.publicKey, // 垫付开户租金者 (~0.002 SOL)
      contractVaultAta,       // 新 ATA
      globalConfigPda,        // 所属 Owner (合约 PDA)
      WHX_MINT_PUBKEY         // WHX Mint
    );

    const tx = new Transaction().add(createIx);
    const createTx = await provider.sendAndConfirm(tx, [adminKeypair]);
    console.log(`🎉 金库账户创建成功！Tx: ${createTx}`);
    console.log(`   Solscan 链接: https://solscan.io/tx/${createTx}`);
  } else {
    console.log("ℹ️ 该合约专属金库账户已经在链上创建，无需重复创建。");
  }

  // 5. 将合约中的 whx_vault 配置更新为这个专属 ATA
  console.log("\n正在将合约的 whx_vault 更新为这个专属金库地址...");
  const updateTx = await program.methods
    .updateConfig(null, contractVaultAta, null)
    .accountsPartial({
      admin: adminKeypair.publicKey,
      globalConfig: globalConfigPda,
    })
    .signers([adminKeypair])
    .rpc();

  console.log(`🎉 合约 whx_vault 参数更新成功！Tx: ${updateTx}`);
  console.log("=========================================================================");
  console.log(`📌 提示：现在您可以从任何 Phantom 钱包直接向下面这个地址充值 WHX：`);
  console.log(`   ${contractVaultAta.toBase58()}`);
  console.log("=========================================================================\n");
}

main().catch(console.error);
