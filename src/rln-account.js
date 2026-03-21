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

'use strict'

import { HttpClient } from 'kaleido-sdk'
import { RlnClient } from 'kaleido-sdk/rln'

/**
 * WDK-compatible account that wraps an RGB Lightning Node (RLN) HTTP API.
 *
 * Implements the core `IWalletAccount` interface (getAddress, getBalance,
 * getTokenBalance, transfer) and exposes the full RLN surface for invoices,
 * payments, channels, and asset operations.
 *
 * Delegates all HTTP calls to `RlnClient` from the kaleido-sdk.
 */
export class RlnAccount {
  /**
   * @param {string} nodeUrl - Base URL of the RLN HTTP API (e.g. 'http://localhost:3001')
   */
  constructor (nodeUrl) {
    const url = nodeUrl.replace(/\/$/, '')
    const http = new HttpClient({ nodeUrl: url })
    this._rln = new RlnClient(http)
    /** @private {null | { publicKey: Uint8Array, privateKey: null }} */
    this._keyPairCache = null
  }

  // ---------------------------------------------------------------------------
  // IWalletAccount compatibility
  // ---------------------------------------------------------------------------

  /**
   * Returns the node's on-chain BTC address.
   *
   * @returns {Promise<string>}
   */
  async getAddress () {
    const res = await this._rln.getAddress()
    return res.address
  }

  /**
   * Returns the on-chain BTC spendable balance (vanilla wallet) in satoshis.
   *
   * @returns {Promise<bigint>}
   */
  async getBalance () {
    const res = await this._rln.getBtcBalance(false)
    return BigInt(res.vanilla?.spendable ?? 0)
  }

  /**
   * Returns the spendable balance of an RGB asset in its smallest unit.
   *
   * @param {string} assetId - RGB asset ID (e.g. 'rgb:2dkSTbr-...')
   * @returns {Promise<bigint>}
   */
  async getTokenBalance (assetId) {
    const res = await this._rln.getAssetBalance({ asset_id: assetId })
    return BigInt(res.spendable ?? 0)
  }

  /**
   * Sends BTC on-chain. For RGB transfers use `sendRgb()` directly.
   *
   * @param {{ recipient: string, amount: number | bigint, feeRate?: number }} options
   * @returns {Promise<{ hash: string, fee: bigint }>}
   */
  async transfer ({ recipient, amount, feeRate = 3 }) {
    await this._rln.sendBtc({ address: recipient, amount: Number(amount), fee_rate: feeRate })
    // sendbtc returns no txid — callers can use listTransactions() to confirm
    return { hash: '', fee: BigInt(0) }
  }

  /**
   * Stub — RLN nodes do not dispose in-process keys.
   */
  dispose () {}

  /**
   * The node's public key as a Uint8Array (lazy-loaded from /nodeinfo).
   * `privateKey` is always null — the key lives in the daemon.
   *
   * @returns {{ publicKey: Uint8Array, privateKey: null }}
   */
  get keyPair () {
    return this._keyPairCache ?? { publicKey: new Uint8Array(0), privateKey: null }
  }

  // ---------------------------------------------------------------------------
  // Node management
  // ---------------------------------------------------------------------------

  /**
   * Returns full node information.
   *
   * @returns {Promise<import('../types/index.d.ts').RlnNodeInfo>}
   */
  async getNodeInfo () {
    const info = await this._rln.getNodeInfo()
    if (!this._keyPairCache && info.pubkey) {
      this._keyPairCache = {
        publicKey: hexToBytes(info.pubkey),
        privateKey: null
      }
    }
    return info
  }

  /**
   * Returns the node's network/chain information.
   *
   * @returns {Promise<object>}
   */
  async getNetworkInfo () {
    return this._rln.getNetworkInfo()
  }

  // ---------------------------------------------------------------------------
  // BTC operations
  // ---------------------------------------------------------------------------

  /**
   * Returns BTC balance broken down into vanilla and colored UTXOs.
   *
   * @param {{ skipSync?: boolean }} [options]
   * @returns {Promise<{ vanilla: { settled: number, future: number, spendable: number }, colored: { settled: number, future: number, spendable: number } }>}
   */
  async getBtcBalance ({ skipSync = false } = {}) {
    return this._rln.getBtcBalance(skipSync)
  }

  /**
   * Sends BTC on-chain.
   *
   * @param {{ address: string, amount: number, feeRate: number }} options
   */
  async sendBtc ({ address, amount, feeRate = 3 }) {
    return this._rln.sendBtc({ address, amount, fee_rate: feeRate })
  }

  /**
   * Lists on-chain BTC transactions.
   *
   * @param {{ skipSync?: boolean }} [options]
   * @returns {Promise<{ transactions: object[] }>}
   */
  async listTransactions ({ skipSync = false } = {}) {
    return this._rln.listTransactions({ skip_sync: skipSync })
  }

  /**
   * Lists UTXOs.
   *
   * @returns {Promise<{ unspents: object[] }>}
   */
  async listUnspents () {
    return this._rln.listUnspents()
  }

  /**
   * Creates UTXOs for RGB asset management.
   *
   * @param {{ up_to?: boolean, num?: number, size?: number, fee_rate?: number, skip_sync?: boolean }} options
   */
  async createUtxos (options = {}) {
    return this._rln.createUtxos(options)
  }

  /**
   * Estimates the on-chain fee rate.
   *
   * @param {{ blocks?: number }} [options]
   * @returns {Promise<{ fee_rate: number }>}
   */
  async estimateFee ({ blocks = 6 } = {}) {
    return this._rln.estimateFee({ blocks })
  }

  // ---------------------------------------------------------------------------
  // RGB asset operations
  // ---------------------------------------------------------------------------

  /**
   * Lists all RGB assets held by the node.
   *
   * @param {('Nia' | 'Uda' | 'Cfa')[]} [filterSchemas]
   * @returns {Promise<{ nia: object[], uda: object[], cfa: object[] }>}
   */
  async listAssets (filterSchemas = []) {
    return this._rln.listAssets(filterSchemas)
  }

  /**
   * Returns the balance for a specific RGB asset.
   *
   * @param {string} assetId
   * @returns {Promise<{ settled: number, future: number, spendable: number, offchain_outbound: number, offchain_inbound: number }>}
   */
  async getAssetBalance (assetId) {
    return this._rln.getAssetBalance({ asset_id: assetId })
  }

  /**
   * Returns metadata for an RGB asset.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async getAssetMetadata (assetId) {
    return this._rln.getAssetMetadata({ asset_id: assetId })
  }

  /**
   * Sends RGB assets on-chain.
   *
   * @param {{ recipientMap: Record<string, { recipient_id: string, amount: number, transport_endpoints: string[] }[]>, feeRate?: number, donation?: boolean, minConfirmations?: number }} options
   * @returns {Promise<{ txid: string }>}
   */
  async sendRgb ({ recipientMap, feeRate = 3, donation = false, minConfirmations = 1 }) {
    return this._rln.sendRgb({
      recipient_map: recipientMap,
      fee_rate: feeRate,
      donation,
      min_confirmations: minConfirmations
    })
  }

  /**
   * Lists RGB transfers for a given asset.
   *
   * @param {string} assetId
   * @returns {Promise<{ transfers: object[] }>}
   */
  async listTransfers (assetId) {
    return this._rln.listTransfers({ asset_id: assetId })
  }

  /**
   * Refreshes the state of pending RGB transfers.
   *
   * @param {{ skipSync?: boolean }} [options]
   */
  async refreshTransfers ({ skipSync = false } = {}) {
    return this._rln.refreshTransfers({ skip_sync: skipSync })
  }

  // ---------------------------------------------------------------------------
  // Lightning invoices & payments
  // ---------------------------------------------------------------------------

  /**
   * Creates a BOLT11 Lightning invoice for receiving BTC.
   *
   * @param {{ amtMsat?: number, description?: string, expirySec?: number }} options
   * @returns {Promise<{ invoice: string }>}
   */
  async createLNInvoice ({ amtMsat, description = '', expirySec = 3600 } = {}) {
    return this._rln.createLNInvoice({ amt_msat: amtMsat, description, expiry_sec: expirySec })
  }

  /**
   * Creates an RGB invoice for receiving assets.
   *
   * @param {{ assetId?: string, amount?: number, durationSeconds?: number, minConfirmations?: number }} options
   * @returns {Promise<{ recipient_id: string, invoice: string, expiration_timestamp: number }>}
   */
  async createRgbInvoice ({ assetId, amount, durationSeconds = 86400, minConfirmations = 1 } = {}) {
    const body = {
      asset_id: assetId,
      duration_seconds: durationSeconds,
      min_confirmations: minConfirmations
    }
    if (amount !== undefined) {
      body.assignment = { amount }
    }
    return this._rln.createRgbInvoice(body)
  }

  /**
   * Sends a Lightning payment.
   *
   * @param {{ invoice: string }} options
   * @returns {Promise<{ payment_hash: string, status: string }>}
   */
  async sendPayment ({ invoice }) {
    return this._rln.sendPayment({ invoice })
  }

  /**
   * Lists all Lightning payments.
   *
   * @returns {Promise<{ payments: object[] }>}
   */
  async listPayments () {
    return this._rln.listPayments()
  }

  /**
   * Returns the status of a Lightning invoice.
   *
   * @param {{ paymentHash: string }} options
   * @returns {Promise<object>}
   */
  async getInvoiceStatus ({ paymentHash }) {
    return this._rln.getInvoiceStatus({ invoice: paymentHash })
  }

  /**
   * Decodes a BOLT11 invoice without paying it.
   *
   * @param {string} invoice
   * @returns {Promise<object>}
   */
  async decodeLNInvoice (invoice) {
    return this._rln.decodeLNInvoice(invoice)
  }

  /**
   * Decodes an RGB invoice.
   *
   * @param {string} invoice
   * @returns {Promise<object>}
   */
  async decodeRgbInvoice (invoice) {
    return this._rln.decodeRgbInvoice({ invoice })
  }

  // ---------------------------------------------------------------------------
  // Channels & peers
  // ---------------------------------------------------------------------------

  /**
   * Lists all Lightning channels.
   *
   * @returns {Promise<{ channels: object[] }>}
   */
  async listChannels () {
    return this._rln.listChannels()
  }

  /**
   * Opens a new Lightning channel.
   *
   * @param {{ peerPubkeyAndAddr: string, capacitySat: number, pushMsat?: number, assetId?: string, assetAmount?: number, isPublic?: boolean }} options
   * @returns {Promise<{ temporary_channel_id: string }>}
   */
  async openChannel ({ peerPubkeyAndAddr, capacitySat, pushMsat = 0, assetId, assetAmount, isPublic = false }) {
    return this._rln.openChannel({
      peer_pubkey_and_opt_addr: peerPubkeyAndAddr,
      capacity_sat: capacitySat,
      push_msat: pushMsat,
      asset_id: assetId,
      asset_amount: assetAmount,
      public: isPublic
    })
  }

  /**
   * Closes a Lightning channel.
   *
   * @param {{ channelId: string, peerPubkey: string, force?: boolean }} options
   */
  async closeChannel ({ channelId, peerPubkey, force = false }) {
    return this._rln.closeChannel({ channel_id: channelId, peer_pubkey: peerPubkey, force })
  }

  /**
   * Lists connected peers.
   *
   * @returns {Promise<{ peers: object[] }>}
   */
  async listPeers () {
    return this._rln.listPeers()
  }

  /**
   * Connects to a peer.
   *
   * @param {string} peerPubkeyAndAddr - e.g. '<pubkey>@<host>:<port>'
   * @returns {Promise<object>}
   */
  async connectPeer (peerPubkeyAndAddr) {
    return this._rln.connectPeer({ peer_pubkey_and_addr: peerPubkeyAndAddr })
  }

  /**
   * Disconnects a peer.
   *
   * @param {string} peerPubkey
   */
  async disconnectPeer (peerPubkey) {
    return this._rln.disconnectPeer({ peer_pubkey: peerPubkey })
  }
}

/** @param {string} hex */
function hexToBytes (hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
