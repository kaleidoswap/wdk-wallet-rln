// Copyright 2024 KaleidoSwap
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

import WalletManager from '@tetherto/wdk-wallet'

import { RlnAccount } from './rln-account.js'

/**
 * @typedef {Object} RlnWalletConfig
 * @property {string} nodeUrl - Base URL of the RLN HTTP API (e.g. 'http://localhost:3001')
 */

/**
 * WDK WalletManager implementation for an RGB Lightning Node.
 *
 * The RLN node manages its own keys; the WDK seed is accepted but not used
 * for key derivation. All operations go through the node's REST API.
 *
 * Unlike BIP-44 wallets there is only one "account" — the node itself.
 * `getAccount()` always returns the same `RlnAccount` regardless of index.
 */
export default class RlnWalletManager extends WalletManager {
  /**
   * @param {string | Uint8Array} seed - WDK seed (accepted but not used)
   * @param {RlnWalletConfig} config
   */
  constructor (seed, config = {}) {
    super(seed, config)

    if (!config.nodeUrl) throw new Error('RlnWalletManager: config.nodeUrl is required')

    this._account = new RlnAccount(config.nodeUrl)
  }

  /**
   * Returns the single RLN account. The `index` parameter is ignored.
   *
   * @param {number} [index]
   * @returns {Promise<RlnAccount>}
   */
  async getAccount (index = 0) {
    return this._account
  }

  /**
   * Returns the single RLN account. The `path` parameter is ignored.
   *
   * @param {string} [path]
   * @returns {Promise<RlnAccount>}
   */
  async getAccountByPath (path) {
    return this._account
  }

  /**
   * Returns fee rates derived from the node's fee estimator.
   *
   * @returns {Promise<{ normal: bigint, fast: bigint }>}
   */
  async getFeeRates () {
    const [normal, fast] = await Promise.all([
      this._account.estimateFee({ blocks: 6 }),
      this._account.estimateFee({ blocks: 2 })
    ])
    return {
      normal: BigInt(Math.round((normal.fee_rate ?? 1) * 1e8)),
      fast: BigInt(Math.round((fast.fee_rate ?? 1) * 1e8))
    }
  }

  /**
   * No-op — the RLN node manages its own key lifecycle.
   */
  dispose () {}
}
