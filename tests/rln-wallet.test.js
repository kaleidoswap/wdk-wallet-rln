'use strict'

import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import RlnWalletManager from '../src/rln-wallet-manager.js'
import { RlnAccount } from '../src/rln-account.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const NODE_URL = 'http://localhost:3001'
const ASSET_ID = 'rgb:2dkSTbr-AmBoqH57-zy4NHN8H-StWuPPfb-mFnQUeCY-vEmB37A'

const MOCK_NODE_INFO = {
  pubkey: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aa',
  num_channels: 2,
  local_balance_sat: 1000000,
  num_peers: 1
}

const MOCK_BTC_BALANCE = {
  vanilla: { settled: 500000, future: 0, spendable: 500000 },
  colored: { settled: 100000, future: 0, spendable: 100000 }
}

const MOCK_ASSET_BALANCE = {
  settled: 1000,
  future: 0,
  spendable: 950,
  offchain_outbound: 50,
  offchain_inbound: 0
}

const MOCK_RGB_INVOICE = {
  recipient_id: 'rcpt-abc-123',
  invoice: 'rgb:invoice-example-string',
  expiration_timestamp: 1700086400
}

const MOCK_LN_INVOICE = {
  invoice: 'lnbc100u1pq...'
}

const MOCK_PAYMENT = {
  payment_hash: 'abc123def456',
  payment_secret: 'secret',
  status: 'Succeeded'
}

const MOCK_CHANNELS = {
  channels: [
    {
      channel_id: 'chan-001',
      peer_pubkey: MOCK_NODE_INFO.pubkey,
      status: 'Opened',
      capacity_sat: 200000,
      local_balance_sat: 150000,
      is_usable: true,
      asset_id: ASSET_ID,
      asset_local_amount: 950
    }
  ]
}

const MOCK_ADDRESS = { address: 'tb1qfoo...' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sets up a mock fetch returning a sequence of JSON responses, then creates
 * a new RlnAccount. openapi-fetch captures globalThis.fetch at construction
 * time, so the mock must be set BEFORE creating the account.
 */
function createAccount (...responses) {
  let call = 0
  globalThis.fetch = jest.fn().mockImplementation(() => {
    const res = responses[call++]
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: () => Promise.resolve(res !== undefined ? JSON.stringify(res) : '')
    })
  })
  return new RlnAccount(NODE_URL)
}

/**
 * Sets up a mock fetch returning an error response, then creates a new
 * RlnAccount.
 */
function createAccountWithError (status, body) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    headers: { get: () => null },
    text: async () => JSON.stringify(body)
  })
  return new RlnAccount(NODE_URL)
}

/** Returns the URL from the nth fetch call (openapi-fetch passes a Request object). */
function getRequestUrl (callIndex = 0) {
  return globalThis.fetch.mock.calls[callIndex][0].url
}

/** Returns the method from the nth fetch call. */
function getRequestMethod (callIndex = 0) {
  return globalThis.fetch.mock.calls[callIndex][0].method
}

/** Reads and parses the JSON body from the nth fetch call's Request object. */
async function getRequestBody (callIndex = 0) {
  return globalThis.fetch.mock.calls[callIndex][0].json()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RlnWalletManager', () => {
  beforeEach(() => { globalThis.fetch = undefined })

  test('throws if nodeUrl is missing', () => {
    expect(() => new RlnWalletManager(SEED, {}))
      .toThrow('config.nodeUrl is required')
  })

  test('getAccount() always returns the same RlnAccount', async () => {
    const mgr = new RlnWalletManager(SEED, { nodeUrl: NODE_URL })
    const a0 = await mgr.getAccount(0)
    const a1 = await mgr.getAccount(1)
    expect(a0).toBe(a1)
    expect(a0).toBeInstanceOf(RlnAccount)
  })

  test('getAccountByPath() returns the same RlnAccount', async () => {
    const mgr = new RlnWalletManager(SEED, { nodeUrl: NODE_URL })
    const account = await mgr.getAccountByPath("0'/0/0")
    expect(account).toBeInstanceOf(RlnAccount)
  })

  test('getFeeRates() returns normal and fast as bigint', async () => {
    let call = 0
    globalThis.fetch = jest.fn().mockImplementation(() => {
      const responses = [{ fee_rate: 0.00005 }, { fee_rate: 0.0002 }]
      const res = responses[call++]
      return Promise.resolve({
        ok: true, status: 200, statusText: 'OK',
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(res))
      })
    })
    const mgr = new RlnWalletManager(SEED, { nodeUrl: NODE_URL })
    const rates = await mgr.getFeeRates()
    expect(typeof rates.normal).toBe('bigint')
    expect(typeof rates.fast).toBe('bigint')
    expect(rates.fast > rates.normal).toBe(true)
  })

  test('dispose() is a no-op', () => {
    const mgr = new RlnWalletManager(SEED, { nodeUrl: NODE_URL })
    expect(() => mgr.dispose()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------

describe('RlnAccount', () => {
  // -------------------------------------------------------------------------
  describe('IWalletAccount interface', () => {
    test('getAddress() returns the on-chain BTC address', async () => {
      const account = createAccount(MOCK_ADDRESS)
      expect(await account.getAddress()).toBe('tb1qfoo...')
      expect(getRequestUrl()).toContain('/address')
    })

    test('getBalance() returns vanilla.spendable as bigint', async () => {
      const account = createAccount(MOCK_BTC_BALANCE)
      const bal = await account.getBalance()
      expect(bal).toBe(BigInt(500000))
    })

    test('getBalance() returns 0n when response is empty', async () => {
      const account = createAccount({})
      expect(await account.getBalance()).toBe(0n)
    })

    test('getTokenBalance(assetId) returns spendable as bigint', async () => {
      const account = createAccount(MOCK_ASSET_BALANCE)
      const bal = await account.getTokenBalance(ASSET_ID)
      expect(bal).toBe(BigInt(950))

      const body = await getRequestBody()
      expect(body).toEqual({ asset_id: ASSET_ID })
    })

    test('transfer() sends BTC on-chain', async () => {
      const account = createAccount({})
      const result = await account.transfer({ recipient: 'tb1qrecipient', amount: 50000 })
      expect(result.hash).toBe('')
      expect(result.fee).toBe(0n)

      expect(getRequestUrl()).toContain('/sendbtc')
      const body = await getRequestBody()
      expect(body.address).toBe('tb1qrecipient')
      expect(body.amount).toBe(50000)
      expect(body.fee_rate).toBe(3)
    })

    test('keyPair.privateKey is always null', () => {
      const account = createAccount()
      expect(account.keyPair.privateKey).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  describe('getNodeInfo()', () => {
    test('returns node info and caches the pubkey', async () => {
      const account = createAccount(MOCK_NODE_INFO)
      const info = await account.getNodeInfo()
      expect(info.pubkey).toBe(MOCK_NODE_INFO.pubkey)

      // keyPair should now have the pubkey
      expect(account.keyPair.publicKey).toBeInstanceOf(Uint8Array)
      expect(account.keyPair.publicKey.length).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  describe('createRgbInvoice()', () => {
    test('calls /rgbinvoice with asset_id and returns invoice', async () => {
      const account = createAccount(MOCK_RGB_INVOICE)
      const inv = await account.createRgbInvoice({ assetId: ASSET_ID })

      expect(inv.invoice).toBe('rgb:invoice-example-string')
      expect(inv.recipient_id).toBe('rcpt-abc-123')

      expect(getRequestUrl()).toContain('/rgbinvoice')
      const body = await getRequestBody()
      expect(body.asset_id).toBe(ASSET_ID)
    })

    test('includes assignment when amount is provided', async () => {
      const account = createAccount(MOCK_RGB_INVOICE)
      await account.createRgbInvoice({ assetId: ASSET_ID, amount: 100 })

      const body = await getRequestBody()
      expect(body.assignment).toEqual({ amount: 100 })
    })
  })

  // -------------------------------------------------------------------------
  describe('createLNInvoice()', () => {
    test('calls /lninvoice and returns bolt11 invoice', async () => {
      const account = createAccount(MOCK_LN_INVOICE)
      const inv = await account.createLNInvoice({ amtMsat: 100000 })

      expect(inv.invoice).toBe('lnbc100u1pq...')
      expect(getRequestUrl()).toContain('/lninvoice')
      const body = await getRequestBody()
      expect(body.amt_msat).toBe(100000)
    })
  })

  // -------------------------------------------------------------------------
  describe('sendPayment()', () => {
    test('POSTs the invoice and returns payment result', async () => {
      const account = createAccount(MOCK_PAYMENT)
      const result = await account.sendPayment({ invoice: 'lnbc100u1pq...' })

      expect(result.status).toBe('Succeeded')
      expect(result.payment_hash).toBe('abc123def456')

      expect(getRequestUrl()).toContain('/sendpayment')
      const body = await getRequestBody()
      expect(body.invoice).toBe('lnbc100u1pq...')
    })
  })

  // -------------------------------------------------------------------------
  describe('listChannels()', () => {
    test('returns the channels array', async () => {
      const account = createAccount(MOCK_CHANNELS)
      const res = await account.listChannels()

      expect(res.channels).toHaveLength(1)
      expect(res.channels[0].channel_id).toBe('chan-001')
      expect(res.channels[0].asset_id).toBe(ASSET_ID)

      expect(getRequestUrl()).toContain('/listchannels')
      expect(getRequestMethod()).toBe('GET')
    })
  })

  // -------------------------------------------------------------------------
  describe('listAssets()', () => {
    test('calls /listassets with empty filter by default', async () => {
      const account = createAccount({ nia: [], uda: [], cfa: [] })
      await account.listAssets()

      const body = await getRequestBody()
      expect(body.filter_asset_schemas).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  describe('getBtcBalance()', () => {
    test('returns full vanilla + colored breakdown', async () => {
      const account = createAccount(MOCK_BTC_BALANCE)
      const bal = await account.getBtcBalance()

      expect(bal.vanilla.spendable).toBe(500000)
      expect(bal.colored.spendable).toBe(100000)
    })
  })

  // -------------------------------------------------------------------------
  describe('error handling', () => {
    test('throws on HTTP 401 with error field', async () => {
      const account = createAccountWithError(401, { error: 'Unauthorized' })
      await expect(account.getBalance())
        .rejects.toThrow('Unauthorized')
    })

    test('throws on HTTP 422 with detail field', async () => {
      const account = createAccountWithError(422, { detail: 'Invalid asset_id' })
      await expect(account.getAssetBalance('bad-id'))
        .rejects.toThrow('Invalid asset_id')
    })

    test('throws when error response body cannot be read', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: { get: () => null },
        text: () => Promise.reject(new Error('network read failure'))
      })
      const account = new RlnAccount(NODE_URL)
      await expect(account.listChannels())
        .rejects.toThrow()
    })
  })
})
