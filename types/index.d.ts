// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export interface RlnWalletConfig {
  /** Base URL of the RLN HTTP API (e.g. 'http://localhost:3001') */
  nodeUrl: string
}

// ---------------------------------------------------------------------------
// Node types (mirrors the OpenAPI schema)
// ---------------------------------------------------------------------------

export interface RlnNodeInfo {
  pubkey?: string
  num_channels?: number
  num_usable_channels?: number
  local_balance_sat?: number
  num_peers?: number
  account_xpub_vanilla?: string
  account_xpub_colored?: string
  network_nodes?: number
  network_channels?: number
}

export interface RlnBtcBalance {
  settled?: number
  future?: number
  spendable?: number
}

export interface RlnBtcBalanceResponse {
  vanilla?: RlnBtcBalance
  colored?: RlnBtcBalance
}

export interface RlnAssetBalance {
  settled?: number
  future?: number
  spendable?: number
  offchain_outbound?: number
  offchain_inbound?: number
}

export interface RlnChannel {
  channel_id?: string
  funding_txid?: string
  peer_pubkey?: string
  peer_alias?: string
  status?: string
  ready?: boolean
  capacity_sat?: number
  local_balance_sat?: number
  is_usable?: boolean
  asset_id?: string
  asset_local_amount?: number
  asset_remote_amount?: number
}

export interface RlnRgbInvoice {
  recipient_id?: string
  invoice?: string
  expiration_timestamp?: number
  batch_transfer_idx?: number
}

export interface RlnLNInvoice {
  invoice?: string
}

export interface RlnPaymentResult {
  payment_hash?: string
  payment_secret?: string
  status?: string
}

export interface RlnFeeRates {
  normal: bigint
  fast: bigint
}

// ---------------------------------------------------------------------------
// RlnAccount
// ---------------------------------------------------------------------------

export declare class RlnAccount {
  constructor(nodeUrl: string)

  // IWalletAccount compatibility
  getAddress(): Promise<string>
  getBalance(): Promise<bigint>
  getTokenBalance(assetId: string): Promise<bigint>
  transfer(options: { recipient: string; amount: number | bigint; feeRate?: number }): Promise<{ hash: string; fee: bigint }>
  dispose(): void
  readonly keyPair: { publicKey: Uint8Array; privateKey: null }

  // Node management
  getNodeInfo(): Promise<RlnNodeInfo>
  getNetworkInfo(): Promise<object>

  // BTC operations
  getBtcBalance(options?: { skipSync?: boolean }): Promise<RlnBtcBalanceResponse>
  sendBtc(options: { address: string; amount: number; feeRate?: number }): Promise<void>
  listTransactions(options?: { skipSync?: boolean }): Promise<{ transactions: object[] }>
  listUnspents(): Promise<{ unspents: object[] }>
  createUtxos(options?: object): Promise<void>
  estimateFee(options?: { blocks?: number }): Promise<{ fee_rate: number }>

  // RGB asset operations
  listAssets(filterSchemas?: ('Nia' | 'Uda' | 'Cfa')[]): Promise<{ nia: object[]; uda: object[]; cfa: object[] }>
  getAssetBalance(assetId: string): Promise<RlnAssetBalance>
  getAssetMetadata(assetId: string): Promise<object>
  sendRgb(options: { recipientMap: Record<string, object[]>; feeRate?: number; donation?: boolean; minConfirmations?: number }): Promise<{ txid: string }>
  listTransfers(assetId: string): Promise<{ transfers: object[] }>
  refreshTransfers(options?: { skipSync?: boolean }): Promise<void>

  // Lightning invoices & payments
  createLNInvoice(options?: { amtMsat?: number; description?: string; expirySec?: number }): Promise<RlnLNInvoice>
  createRgbInvoice(options?: { assetId?: string; amount?: number; durationSeconds?: number; minConfirmations?: number }): Promise<RlnRgbInvoice>
  sendPayment(options: { invoice: string }): Promise<RlnPaymentResult>
  listPayments(): Promise<{ payments: object[] }>
  getInvoiceStatus(options: { paymentHash: string }): Promise<object>
  decodeLNInvoice(invoice: string): Promise<object>
  decodeRgbInvoice(invoice: string): Promise<object>

  // Channels & peers
  listChannels(): Promise<{ channels: RlnChannel[] }>
  openChannel(options: { peerPubkeyAndAddr: string; capacitySat: number; pushMsat?: number; assetId?: string; assetAmount?: number; isPublic?: boolean }): Promise<{ temporary_channel_id: string }>
  closeChannel(options: { channelId: string; peerPubkey: string; force?: boolean }): Promise<void>
  listPeers(): Promise<{ peers: object[] }>
  connectPeer(peerPubkeyAndAddr: string): Promise<object>
  disconnectPeer(peerPubkey: string): Promise<void>
}

// ---------------------------------------------------------------------------
// RlnWalletManager (default export)
// ---------------------------------------------------------------------------

declare class RlnWalletManager {
  constructor(seed: string | Uint8Array, config: RlnWalletConfig)

  getAccount(index?: number): Promise<RlnAccount>
  getAccountByPath(path?: string): Promise<RlnAccount>
  getFeeRates(): Promise<RlnFeeRates>
  dispose(): void
}

export default RlnWalletManager
