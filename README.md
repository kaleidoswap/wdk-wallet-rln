# @kaleidoswap/wdk-wallet-rln

WDK wallet adapter for an **RGB Lightning Node (RLN)** — connects an existing RLN HTTP daemon to the WDK account model.

## Overview

`RlnWalletManager` implements the WDK `WalletManager` interface for nodes running the [RGB Lightning Node](https://github.com/RGB-Tools/rgb-lightning-node) daemon. Rather than managing keys in-process, it delegates all operations to the node's REST API.

```
WDK host app
  └── RlnWalletManager (this package)
        └── RlnAccount  ──HTTP──▶  RLN daemon (:3001)
```

**Key properties:**
- The RLN node owns its keys — the WDK seed is accepted but not used for derivation
- `getAccount()` always returns the same single `RlnAccount` (the node itself)
- All balance and transfer calls go through the node's REST API via native `fetch`
- No extra runtime dependencies

## Installation

```bash
npm install @kaleidoswap/wdk-wallet-rln
```

Requires `@tetherto/wdk-wallet` as a peer dependency:

```bash
npm install @tetherto/wdk-wallet
```

## Usage

```js
import RlnWalletManager from '@kaleidoswap/wdk-wallet-rln'

const manager = new RlnWalletManager(null, {
  nodeUrl: 'http://localhost:3001'
})

const account = await manager.getAccount()

// On-chain BTC balance
const satoshis = await account.getBalance()

// RGB asset balance
const usdt = await account.getTokenBalance('rgb:2dkSTbr-...')

// Node info
const info = await account.getNodeInfo()
console.log(info.pubkey)
```

## API

### `RlnWalletManager`

Extends `WalletManager` from `@tetherto/wdk-wallet`.

```js
new RlnWalletManager(seed, { nodeUrl })
```

| Method | Description |
|--------|-------------|
| `getAccount(index?)` | Returns the `RlnAccount` (index ignored) |
| `getAccountByPath(path?)` | Returns the `RlnAccount` (path ignored) |
| `getFeeRates()` | Returns `{ normal: bigint, fast: bigint }` fee rates from the node |
| `dispose()` | No-op |

### `RlnAccount`

Wraps the full RLN REST API surface.

#### WDK compatibility

| Method | Description |
|--------|-------------|
| `getAddress()` | On-chain BTC address |
| `getBalance()` | On-chain BTC spendable balance in satoshis (`bigint`) |
| `getTokenBalance(assetId)` | RGB asset spendable balance (`bigint`) |
| `transfer({ recipient, amount, feeRate })` | Send BTC on-chain |

#### Node management

| Method | Description |
|--------|-------------|
| `getNodeInfo()` | Full node info (pubkey, alias, peers, channels) |
| `getNetworkInfo()` | Network/chain info |

#### BTC operations

| Method | Description |
|--------|-------------|
| `getBtcBalance({ skipSync? })` | Vanilla + colored UTXO breakdown |
| `sendBtc({ address, amount, feeRate })` | Send on-chain BTC |
| `listTransactions({ skipSync? })` | On-chain transaction history |
| `listUnspents()` | UTXO list |
| `createUtxos(options)` | Create UTXOs for RGB management |
| `estimateFee({ blocks? })` | Fee rate estimation |

#### RGB asset operations

| Method | Description |
|--------|-------------|
| `listAssets(filterSchemas?)` | List all RGB assets |
| `getAssetBalance(assetId)` | Balance breakdown for an asset |
| `getAssetMetadata(assetId)` | Asset metadata |
| `sendRgb({ recipientMap, feeRate, ... })` | Send RGB assets on-chain |
| `listTransfers(assetId)` | Transfer history for an asset |
| `refreshTransfers({ skipSync? })` | Flush pending RGB transfers |

#### Lightning invoices & payments

| Method | Description |
|--------|-------------|
| `createLNInvoice({ amtMsat?, description?, expirySec? })` | Create BOLT11 invoice |
| `createRgbInvoice({ assetId?, amount?, ... })` | Create RGB invoice |
| `sendPayment({ invoice })` | Pay a Lightning invoice |
| `listPayments()` | List all payments |
| `getInvoiceStatus({ paymentHash })` | Invoice status |
| `decodeLNInvoice(invoice)` | Decode BOLT11 without paying |
| `decodeRgbInvoice(invoice)` | Decode RGB invoice |

#### Channels & peers

| Method | Description |
|--------|-------------|
| `listChannels()` | List all channels |
| `openChannel({ peerPubkeyAndAddr, capacitySat, ... })` | Open a channel |
| `closeChannel({ channelId, peerPubkey, force? })` | Close a channel |
| `listPeers()` | List connected peers |
| `connectPeer(peerPubkeyAndAddr)` | Connect to a peer (`pubkey@host:port`) |
| `disconnectPeer(peerPubkey)` | Disconnect a peer |

## Configuration

| Option | Required | Description |
|--------|----------|-------------|
| `nodeUrl` | ✅ | Base URL of the RLN daemon (e.g. `http://localhost:3001`) |

## WDK Integration Example

```js
import { WalletManager } from '@tetherto/wdk-wallet'
import RlnWalletManager from '@kaleidoswap/wdk-wallet-rln'
import KaleidoswapProtocol from '@kaleidoswap/wdk-protocol-swap-kaleidoswap'

// Register the wallet
const manager = new RlnWalletManager(null, { nodeUrl: 'http://localhost:3001' })
const account = await manager.getAccount()

// Register the swap protocol
account.registerProtocol('bitcoin', 'kaleidoswap', KaleidoswapProtocol, {
  baseUrl: 'https://api.kaleidoswap.com'
})
```

## Tests

```bash
npm test
```

22 unit tests covering `RlnWalletManager` and `RlnAccount` (all pass with mocked HTTP).

## License

Apache-2.0 — [KaleidoSwap](https://kaleidoswap.com)
