// Tangga dip menanjak untuk cbBTC (CBBTC/USDC), bar 1 menit,
// btc-race-24h-20261118-1444.
//
// Gagasan: papan final dua race sebelumnya dimenangkan oleh bot yang
// menembak SEDIKIT tapi tepat — satu sampai empat round trip, beli di
// lembah lalu tahan sampai pantulannya besar — bukan oleh bot yang
// menembak belasan kali. Bot dua-tier sebelumnya kalah di window ini
// karena tier dangkalnya (dip 50 bps) menembak 17-21 kali saat harga
// merangkak turun, dan ongkos tiap putaran (~26 bps) menggerogoti
// semua edge-nya. Jadi bot ini hanya boleh membeli MAKSIMAL DUA KALI
// dalam satu window, dan pembelian kedua mensyaratkan jurang yang jauh
// lebih dalam daripada yang pertama: ambang dipnya menanjak.
// Pembelian pertama butuh 140 bps di bawah puncak 120 bar; kalau itu
// sudah terpakai dan posisinya sudah ditutup, pembelian kedua baru
// boleh masuk di 290 bps, plus harga harus sudah memantul sedikit dari
// titik terendah sejak exit terakhir (pintu rearm 50 bps) — jadi
// pembelian kedua tidak terjadi di tengah longsoran yang sama, melainkan
// di lembah baru yang lebih dalam.
//
// Sekali masuk, bot memakai seluruh kas (long only, satu posisi), lalu
// keluar dengan salah satu dari tiga pemicu, tanpa trailing: ambil
// untung di +200 bps, potong rugi di -80 bps, atau paksa keluar setelah
// 480 bar ditahan. Selesai. Tidak ada fallback, tidak ada short, tidak
// ada simbol lain.
//
// Semua hitungan memakai bilangan bulat pada satuan harga (bigint),
// tanpa jam, tanpa acak, tanpa lingkungan: dua run pada data yang sama
// menghasilkan order yang sama persis.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const ASSET = 'CBBTC';
// Berapa banyak close yang harus terlihat sebelum boleh masuk.
const HISTORY = 120;
// Ambang dip (bps di bawah puncak rolling) untuk pembelian ke-(n+1):
// FIRST_DIP + n * DIP_STEP, jadi 140 lalu 290.
const FIRST_DIP = 140n;
const DIP_STEP = 150n;
// Kenaikan minimum (bps) dari titik terendah pasca-exit sebelum
// pembelian kedua diizinkan.
const REARM = 50n;
// Pemicu keluar (bps terhadap harga fill masuk, dan batas tahan).
const TARGET = 200n;
const STOP = 80n;
const HOLD_LIMIT = 480;
// Jeda (bar) setelah tiap exit sebelum boleh masuk lagi.
const REST_BARS = 10;
const SLIP = 150;

/** Seluruh memori bot: riwayat close dan keadaan posisi terbuka. */
const book = {
  /** Close yang sudah terlihat, sebagai bigint pada skala harga. */
  closes: [] as bigint[],
  /** Harga fill pembelian yang membuka posisi saat ini, 0n bila flat. */
  fillPrice: 0n,
  /** Bar yang sudah dilewati sejak fill pembelian (termasuk bar fill). */
  ageBars: 0,
  /** Sisa jeda setelah exit; 0 berarti boleh masuk. */
  rest: 0,
  /** Berapa pembelian yang sudah terisi sepanjang window (maks 2). */
  buys: 0,
  /** Close terendah sejak exit terakhir; hanya bermakna bila hasValley. */
  valley: 0n,
  /** True sejak exit pertama terisi. */
  hasValley: false,
};

/** Puncak tertinggi dari `n` close terakhir (termasuk close saat ini). */
function peakOver(n: number): bigint {
  let top = 0n;
  const start = book.closes.length - n > 0 ? book.closes.length - n : 0;
  for (let i = start; i < book.closes.length; i++) {
    const c = book.closes[i]!;
    if (c > top) top = c;
  }
  return top;
}

/** Perpindahan dari `from` ke `to`, dalam bps (bertanda, dibulatkan ke nol). */
function bpsMove(from: bigint, to: bigint): bigint {
  return ((to - from) * 10000n) / from;
}

/** Order beli seluruh kas (dibatasi ruang bobot), atau [] bila tak layak. */
function fullBuy(state: BarsState): BuyInput[] {
  const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
  let spend = state.cash;
  const room = state.weightRoom(ASSET);
  if (spend > room) spend = room;
  if (spend < minNotional) return [];
  return [{ side: 'buy', symbol: ASSET, notional_quote_units: spend, max_slippage_bps: SLIP } satisfies BuyInput];
}

/** Order jual seluruh posisi yang dipegang. */
function fullSell(heldQty: bigint): SellInput[] {
  return [{ side: 'sell', symbol: ASSET, qty: heldQty, max_slippage_bps: SLIP } satisfies SellInput];
}

/** True bila posisi terbuka harus ditutup pada gain saat ini. */
function leaveNow(gain: bigint): boolean {
  if (gain >= TARGET) return true;
  if (gain <= -STOP) return true;
  if (book.ageBars >= HOLD_LIMIT) return true;
  return false;
}

/** True bila semua syarat masuk terpenuhi pada close saat ini. */
function entryReady(close: bigint, prev: bigint): boolean {
  if (book.rest > 0) return false;
  if (book.buys >= 2) return false;
  if (close < prev) return false; // butuh bar hijau: close tidak turun
  const peak = peakOver(HISTORY);
  if (peak === 0n) return false;
  const dip = ((peak - close) * 10000n) / peak;
  const need = FIRST_DIP + BigInt(book.buys) * DIP_STEP;
  if (dip < need) return false;
  if (book.buys >= 1) {
    if (!book.hasValley || book.valley === 0n) return false;
    if (bpsMove(book.valley, close) < REARM) return false;
  }
  return true;
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Catat bar baru dulu: close bar ini dipakai untuk reset lembah
    // pasca-exit bila ada fill jual di batch ini.
    for (const bar of batch.bars) {
      if (bar.symbol === ASSET) book.closes.push(BigInt(bar.c));
    }
    const close = book.closes[book.closes.length - 1];
    const prev = book.closes.length > 1 ? book.closes[book.closes.length - 2] : undefined;
    if (close === undefined || prev === undefined) return [];

    // Lipat fill: beli mengisi harga masuk dan umur posisi, jual menutup
    // posisi, memulai jeda, dan me-reset lembah ke close bar exit.
    for (const f of batch.fills) {
      if (f.symbol !== ASSET || f.status !== 'filled' || f.client_id.startsWith('_')) continue;
      if (f.side === 'buy') {
        book.fillPrice = BigInt(f.price);
        book.ageBars = 0;
        book.buys += 1;
      } else {
        book.fillPrice = 0n;
        book.ageBars = 0;
        book.rest = REST_BARS;
        book.valley = close;
        book.hasValley = true;
      }
    }
    // Lembah pasca-exit: titik terendah close sejak exit terakhir.
    if (book.hasValley && close < book.valley) book.valley = close;

    if (state.warmingUp) return [];
    if (book.closes.length < HISTORY) return [];
    if (book.rest > 0) book.rest--;

    const held = state.positions.get(ASSET);

    // Memegang posisi: periksa tiga pemicu keluar, berurutan.
    if (held !== undefined && held.qty > 0n) {
      if (book.fillPrice === 0n) book.fillPrice = close;
      book.ageBars += 1;
      if (leaveNow(bpsMove(book.fillPrice, close))) return fullSell(held.qty);
      return [];
    }

    // Flat: masuk hanya bila semua syarat tangga dip terpenuhi.
    if (entryReady(close, prev)) return fullBuy(state);
    return [];
  },
});
