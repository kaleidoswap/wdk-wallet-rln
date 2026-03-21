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
const MOCK_FEE = { fee_rate: 0.00005 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchSequence (...responses) {
  let call = 0
  globalThis.fetch = jest.fn().mockImplementation(() => {
    const res = responses[call++]
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(res))
    })
  })
}

function mockFetchError (status, body) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => JSON.stringify(body)
  })
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
    mockFetchSequence(
      { fee_rate: 0.00005 },  // blocks=6 (normal)
      { fee_rate: 0.0002 }    // blocks=2 (fast)
    )
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
  /** @type {RlnAccount} */
  let account

  beforeEach(() => {
    globalThis.fetch = undefined
    account = new RlnAccount(NODE_URL)
  })

  // -------------------------------------------------------------------------
  describe('IWalletAccount interface', () => {
    test('getAddress() returns the on-chain BTC address', async () => {
      mockFetchSequence(MOCK_ADDRESS)
      expect(await account.getAddress()).toBe('tb1qfoo...')
      const [url] = globalThis.fetch.mock.calls[0]
      expect(url).toBe(`${NODE_URL}/address`)
    })

    test('getBalance() returns vanilla.spendable as bigint', async () => {
      mockFetchSequence(MOCK_BTC_BALANCE)
      const bal = await account.getBalance()
      expect(bal).toBe(BigInt(500000))
    })

    test('getBalance() returns 0n when response is empty', async () => {
      mockFetchSequence({})
      expect(await account.getBalance()).toBe(0n)
    })

    test('getTokenBalance(assetId) returns spendable as bigint', async () => {
      mockFetchSequence(MOCK_ASSET_BALANCE)
      const bal = await account.getTokenBalance(ASSET_ID)
      expect(bal).toBe(BigInt(950))

      const [, opts] = globalThis.fetch.mock.calls[0]
      expect(JSON.parse(opts.body)).toEqual({ asset_id: ASSET_ID })
    })

    test('transfer() sends BTC on-chain', async () => {
      mockFetchSequence({})
      const result = await account.transfer({ recipient: 'tb1qrecipient', amount: 50000 })
      expect(result.hash).toBe('')
      expect(result.fee).toBe(0n)

      const [url, opts] = globalThis.fetch.mock.calls[0]
      expect(url).toContain('/sendbtc')
      const body = JSON.parse(opts.body)
      expect(body.address).toBe('tb1qrecipient')
      expect(body.amount).toBe(50000)
      expect(body.fee_rate).toBe(3)
    })

    test('keyPair.privateKey is always null', () => {
      expect(account.keyPair.privateKey).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  describe('getNodeInfo()', () => {
    test('returns node info and caches the pubkey', async () => {
      mockFetchSequence(MOCK_NODE_INFO)
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
      mockFetchSequence(MOCK_RGB_INVOICE)
      const inv = await account.createRgbInvoice({ assetId: ASSET_ID })

      expect(inv.invoice).toBe('rgb:invoice-example-string')
      expect(inv.recipient_id).toBe('rcpt-abc-123')

      const [url, opts] = globalThis.fetch.mock.calls[0]
      expect(url).toContain('/rgbinvoice')
      const body = JSON.parse(opts.body)
      expect(body.asset_id).toBe(ASSET_ID)
    })

    test('includes assignment when amount is provided', async () => {
      mockFetchSequence(MOCK_RGB_INVOICE)
      await account.createRgbInvoice({ assetId: ASSET_ID, amount: 100 })

      const [, opts] = globalThis.fetch.mock.calls[0]
      expect(JSON.parse(opts.body).assignment).toEqual({ amount: 100 })
    })
  })

  // -------------------------------------------------------------------------
  describe('createLNInvoice()', () => {
    test('calls /lninvoice and returns bolt11 invoice', async () => {
      mockFetchSequence(MOCK_LN_INVOICE)
      const inv = await account.createLNInvoice({ amtMsat: 100000 })

      expect(inv.invoice).toBe('lnbc100u1pq...')
      const [url, opts] = globalThis.fetch.mock.calls[0]
      expect(url).toContain('/lninvoice')
      expect(JSON.parse(opts.body).amt_msat).toBe(100000)
    })
  })

  // -------------------------------------------------------------------------
  describe('sendPayment()', () => {
    test('POSTs the invoice and returns payment result', async () => {
      mockFetchSequence(MOCK_PAYMENT)
      const result = await account.sendPayment({ invoice: 'lnbc100u1pq...' })

      expect(result.status).toBe('Succeeded')
      expect(result.payment_hash).toBe('abc123def456')

      const [url, opts] = globalThis.fetch.mock.calls[0]
      expect(url).toContain('/sendpayment')
      expect(JSON.parse(opts.body).invoice).toBe('lnbc100u1pq...')
    })
  })

  // -------------------------------------------------------------------------
  describe('listChannels()', () => {
    test('returns the channels array', async () => {
      mockFetchSequence(MOCK_CHANNELS)
      const res = await account.listChannels()

      expect(res.channels).toHaveLength(1)
      expect(res.channels[0].channel_id).toBe('chan-001')
      expect(res.channels[0].asset_id).toBe(ASSET_ID)

      const [url, opts] = globalThis.fetch.mock.calls[0]
      expect(url).toContain('/listchannels')
      expect(opts.method).toBe('GET')
    })
  })

  // -------------------------------------------------------------------------
  describe('listAssets()', () => {
    test('calls /listassets with empty filter by default', async () => {
      mockFetchSequence({ nia: [], uda: [], cfa: [] })
      await account.listAssets()

      const [, opts] = globalThis.fetch.mock.calls[0]
      expect(JSON.parse(opts.body).filter_asset_schemas).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  describe('getBtcBalance()', () => {
    test('returns full vanilla + colored breakdown', async () => {
      mockFetchSequence(MOCK_BTC_BALANCE)
      const bal = await account.getBtcBalance()

      expect(bal.vanilla.spendable).toBe(500000)
      expect(bal.colored.spendable).toBe(100000)
    })
  })

  // -------------------------------------------------------------------------
  describe('error handling', () => {
    test('throws a readable error on HTTP failure with error field', async () => {
      mockFetchError(401, { error: 'Unauthorized' })
      await expect(account.getBalance())
        .rejects.toThrow('RLN node error: Unauthorized')
    })

    test('throws with detail field', async () => {
      mockFetchError(422, { detail: 'Invalid asset_id' })
      await expect(account.getAssetBalance('bad-id'))
        .rejects.toThrow('RLN node error: Invalid asset_id')
    })

    test('falls back to HTTP status text when body is not JSON', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error('not JSON'))
      })
      await expect(account.listChannels())
        .rejects.toThrow('RLN node error: HTTP 503')
    })
  })
})
