/**
 * ShiftPay Escrow - Frontend Entegrasyon İstemcisi (Client SDK)
 * Rise In x Stellar Pro Hackathon 2026 (Genesis Track)
 * 
 * Bu dosyayı doğrudan frontend projenizin 'src/' veya 'services/' klasörüne kopyalayabilirsiniz.
 * Gerekli paketler:
 *   npm install @stellar/stellar-sdk @creit.tech/stellar-wallets-kit
 */

import {
  Contract,
  Networks,
  TransactionBuilder,
  rpc,
  nativeToScVal,
  scValToNative,
  Address
} from "@stellar/stellar-sdk";

import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
  ALBEDO_ID,
  XBULL_ID
} from "@creit.tech/stellar-wallets-kit";

// 1. GENEL ZİNCİR VE SÖZLEŞME YAPILANDIRMASI
export const SHIFTPAY_CONFIG = {
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://soroban-testnet.stellar.org",
  // Canlı Testnet Sözleşme Adresi:
  contractId: "CDV3G7DHQEVUAMKRKK6UXVAUPLY277RRJVZNYAQX44OK4VIW5XUWFPII",
  
  // Resmi Hackathon Türk Mock Anchor Bilgileri (tr-mock-anchor.fly.dev)
  anchorHomeDomain: "tr-mock-anchor.fly.dev",
  anchorUrl: "https://tr-mock-anchor.fly.dev",
  usdcIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  anchorTreasury: "GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6",

  // DeFindex Testnet Vault ID:
  defindexVaultId: "CCJWW63WRWZASW7YIGWASHZVOKMDEKQ557CJOHRA5X3PG5KDPHWVITD5",
  // 1 Token = 10,000,000 stroops
  DECIMALS: 10_000_000n
};

// 2. CÜZDAN BAĞLANTISI (Stellar Wallets Kit Singleton)
let kitInstance = null;

export function getWalletKit() {
  if (!kitInstance && typeof window !== "undefined") {
    kitInstance = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules()
    });
  }
  return kitInstance;
}

export const ShiftPay = {
  /**
   * Cüzdan Bağlantı Penceresini (Modal) Açar
   * Desteklenen cüzdanlar: Freighter, Albedo, xBull, LOBSTR
   */
  async connectWallet() {
    const kit = getWalletKit();
    return new Promise((resolve, reject) => {
      kit.openModal({
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            resolve({ address, walletId: option.id });
          } catch (err) {
            reject(err);
          }
        },
        onClosed: () => reject(new Error("Cüzdan seçimi iptal edildi."))
      });
    });
  },

  /**
   * Bağlı olan cüzdan adresini getirir
   */
  async getConnectedAddress() {
    const kit = getWalletKit();
    const { address } = await kit.getAddress();
    return address;
  },

  // -------------------------------------------------------------
  // 🏢 İŞVEREN EKRANI METODLARI
  // -------------------------------------------------------------

  /**
   * İşveren Kasa/Bütçe Kilitler (Örn: 10,000 USDC / TRY_CREDIT)
   * Atıl bütçe otomatik olarak DeFindex Vault'a aktarılarak getiri üretir.
   */
  async depositBudget(employerAddress, tokenAddress, amountTRY, autoStakeDefindex = true) {
    const stroops = BigInt(Math.round(amountTRY * 10_000_000));
    return this._invokeContract("deposit", employerAddress, [
      nativeToScVal(employerAddress, { type: "address" }),
      nativeToScVal(tokenAddress, { type: "address" }),
      nativeToScVal(stroops, { type: "i128" }),
      nativeToScVal(2592000, { type: "u64" }), // 30 gün vade
      nativeToScVal(autoStakeDefindex, { type: "bool" })
    ]);
  },

  /**
   * İşçiye Günlük Hak Ediş Ücreti Tanımlar
   */
  async setWorkerWage(employerAddress, workerAddress, dailyWageTRY) {
    const stroops = BigInt(Math.round(dailyWageTRY * 10_000_000));
    return this._invokeContract("set_wage", employerAddress, [
      nativeToScVal(employerAddress, { type: "address" }),
      nativeToScVal(workerAddress, { type: "address" }),
      nativeToScVal(stroops, { type: "i128" })
    ]);
  },

  // -------------------------------------------------------------
  // 👷 İŞÇİ EKRANI METODLARI
  // -------------------------------------------------------------

  /**
   * Vardiya Başlatma (QR Check-In)
   * Saha amirinin QR kodunu okutup vardiyayı blokzincirde başlatır.
   */
  async checkIn(workerAddress, shiftIdHex) {
    const hex = shiftIdHex.startsWith("0x") ? shiftIdHex.slice(2) : shiftIdHex;
    const buf = Buffer.from(hex.padEnd(64, "0").slice(0, 64), "hex");
    return this._invokeContract("check_in", workerAddress, [
      nativeToScVal(workerAddress, { type: "address" }),
      nativeToScVal(buf, { type: "bytes" })
    ]);
  },

  /**
   * Vardiya Bitirme (Check-Out)
   * 30 günlük şartlı hak ediş üretilir. İşçinin eski borcu varsa otomatik düşülür.
   */
  async checkOut(employerAddress, workerAddress) {
    return this._invokeContract("check_out", workerAddress, [
      nativeToScVal(employerAddress, { type: "address" }),
      nativeToScVal(workerAddress, { type: "address" })
    ]);
  },

  /**
   * Anlaşmalı Esnafta Anında Harcama (Sıfır Riskli Takas)
   * İşçi hak edişini yemek veya market alışverişinde hemen harcar.
   */
  async spendAtMerchant(workerAddress, merchantAddress, shiftIdHex, amountTRY) {
    const hex = shiftIdHex.startsWith("0x") ? shiftIdHex.slice(2) : shiftIdHex;
    const buf = Buffer.from(hex.padEnd(64, "0").slice(0, 64), "hex");
    const stroops = BigInt(Math.round(amountTRY * 10_000_000));
    return this._invokeContract("spend_at_merchant", workerAddress, [
      nativeToScVal(workerAddress, { type: "address" }),
      nativeToScVal(merchantAddress, { type: "address" }),
      nativeToScVal(buf, { type: "bytes" }),
      nativeToScVal(stroops, { type: "i128" })
    ]);
  },

  // -------------------------------------------------------------
  // 🏪 ESNAF / MAĞAZA EKRANI METODLARI
  // -------------------------------------------------------------

  /**
   * Esnafın Tahsil Ettiği Hak Edişi Çekmesi
   */
  async merchantWithdraw(merchantAddress, tokenAddress, amountTRY) {
    const stroops = BigInt(Math.round(amountTRY * 10_000_000));
    return this._invokeContract("merchant_withdraw", merchantAddress, [
      nativeToScVal(merchantAddress, { type: "address" }),
      nativeToScVal(tokenAddress, { type: "address" }),
      nativeToScVal(stroops, { type: "i128" })
    ]);
  },

  // -------------------------------------------------------------
  // 📊 SORGULAMA (READ-ONLY) METODLARI (Arayüzde Bilgi Göstermek İçin)
  // -------------------------------------------------------------

  /**
   * İşçinin tanımlı günlük hak edişini okur (TRY cinsinden döner)
   */
  async getWorkerWage(workerAddress) {
    const server = new rpc.Server(SHIFTPAY_CONFIG.rpcUrl);
    const contract = new Contract(SHIFTPAY_CONFIG.contractId);
    const account = await server.getAccount(workerAddress);

    const callOp = contract.call("get_worker_wage", nativeToScVal(workerAddress, { type: "address" }));
    const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: SHIFTPAY_CONFIG.networkPassphrase })
      .addOperation(callOp)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (sim.result) {
      const stroops = scValToNative(sim.result.retval);
      return Number(stroops) / 10_000_000;
    }
    return 0;
  },

  // -------------------------------------------------------------
  // 🏦 ON/OFF-RAMP (TÜRK ANCHOR'I İLE TL'YE ÇEVİRME / IBAN)
  // -------------------------------------------------------------

  /**
   * Türk Lirası IBAN Çekim URL'i Üretir (Hackathon Resmi Mock Anchor SEP-6 / Explorer)
   * Kullanıcı bu linke tıklar veya popup ile açılır, IBAN'ına TL aktarılır.
   */
  getAnchorOfframpUrl(destinationIban = "", amountTRY = 500) {
    let url = SHIFTPAY_CONFIG.anchorUrl + "/explorer?asset=USDC&amount=" + amountTRY;
    if (destinationIban) {
      url += "&iban=" + encodeURIComponent(destinationIban);
    }
    return url;
  },

  /**
   * Canlı Testnet Anchor Explorer Sayfası Linki
   */
  getAnchorExplorerUrl() {
    return SHIFTPAY_CONFIG.anchorUrl + "/explorer";
  },

  // -------------------------------------------------------------
  // ⚙️ DAHİLİ İŞLEM İMZALAMA MOTORU (Soroban RPC + Wallets Kit)
  // -------------------------------------------------------------
  async _invokeContract(functionName, callerAddress, args) {
    const server = new rpc.Server(SHIFTPAY_CONFIG.rpcUrl);
    const contract = new Contract(SHIFTPAY_CONFIG.contractId);
    const kit = getWalletKit();

    const account = await server.getAccount(callerAddress);
    const callOp = contract.call(functionName, ...args);

    const rawTx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: SHIFTPAY_CONFIG.networkPassphrase
    })
      .addOperation(callOp)
      .setTimeout(60)
      .build();

    const prepared = await server.prepareTransaction(rawTx);
    const signed = await kit.sign({ xdr: prepared.toXDR() });
    const sendRes = await server.sendTransaction(
      TransactionBuilder.fromXDR(signed.xdr, SHIFTPAY_CONFIG.networkPassphrase)
    );

    if (sendRes.status === "ERROR") {
      throw new Error("İşlem ağa iletilemedi: " + JSON.stringify(sendRes));
    }

    return {
      success: true,
      txHash: sendRes.hash,
      stellarExpertUrl: "https://stellar.expert/explorer/testnet/tx/" + sendRes.hash
    };
  }
};
