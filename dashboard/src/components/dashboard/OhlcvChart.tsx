'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChartIndicators } from '@/hooks/useChartIndicators'
import type { Candle } from '@/lib/types'

const INTERVALS = ['5_MINUTE', '15_MINUTE'] as const
type Interval = (typeof INTERVALS)[number]

function ChartCanvas({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !candles.length) return

    let chart: ReturnType<typeof import('lightweight-charts').createChart> | null = null

    import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries }) => {
      if (!containerRef.current) return
      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#09090b' },
          textColor: '#a1a1aa',
        },
        grid: {
          vertLines: { color: '#27272a' },
          horzLines: { color: '#27272a' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#3f3f46' },
        timeScale: { borderColor: '#3f3f46', timeVisible: true },
        width: containerRef.current.clientWidth,
        height: 380,
      })

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#3f3f46',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      })
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candleSeries.setData(candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      volumeSeries.setData(candles.map(c => ({ time: c.time as any, value: c.volume, color: c.close >= c.open ? '#22c55e44' : '#ef444444' })))

      chart.timeScale().fitContent()
    })

    return () => {
      chart?.remove()
    }
  }, [candles])

  return <div ref={containerRef} className="w-full" />
}

export function OhlcvChart() {
  const [mintInput, setMintInput] = useState('')
  const [mint, setMint] = useState<string | null>(null)
  const [interval, setInterval] = useState<Interval>('5_MINUTE')

  const { data, isLoading } = useChartIndicators(mint, interval, 200)

  const handleLoad = () => {
    const v = mintInput.trim()
    if (v) setMint(v)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Token mint address (e.g. So111…)"
          value={mintInput}
          onChange={e => setMintInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
          className="border-zinc-700 bg-zinc-900 font-mono text-sm max-w-sm"
        />
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          {INTERVALS.map(iv => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`px-3 py-1.5 text-xs transition-colors ${interval === iv ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'}`}
            >
              {iv.replace('_', ' ')}
            </button>
          ))}
        </div>
        <Button onClick={handleLoad} disabled={!mintInput.trim()} className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100">
          Load
        </Button>
      </div>

      {!mint && (
        <p className="py-8 text-center text-sm text-zinc-600">Enter a token mint address to load the chart.</p>
      )}

      {isLoading && mint && (
        <Skeleton className="h-96 w-full rounded-lg bg-zinc-900" />
      )}

      {data?.candles && data.candles.length > 0 && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center gap-3">
            <span className="font-mono text-xs text-zinc-400">{data.mint.slice(0, 8)}…</span>
            <span className="text-xs text-zinc-600">{data.interval} · {data.candles.length} candles</span>
            {data.candles.length > 0 && (
              <span className={`ml-auto text-xs font-medium ${data.candles[data.candles.length - 1].close >= data.candles[0].open ? 'text-green-400' : 'text-red-400'}`}>
                {data.candles[data.candles.length - 1].close.toPrecision(6)}
              </span>
            )}
          </div>
          <ChartCanvas candles={data.candles} />
        </div>
      )}

      {data && (!data.candles || data.candles.length === 0) && (
        <p className="py-8 text-center text-sm text-zinc-600">No candle data returned for this mint.</p>
      )}
    </div>
  )
}
