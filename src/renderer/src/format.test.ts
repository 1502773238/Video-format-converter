import { describe, expect, it } from 'vitest'
import { codecLabel, formatBytes, formatDuration } from './format'

describe('display formatters', () => {
  it('formats media sizes for people', () => {
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
  })

  it('formats short and long durations', () => {
    expect(formatDuration(134)).toBe('2:14')
    expect(formatDuration(3_661)).toBe('1:01:01')
  })

  it('uses familiar codec names', () => {
    expect(codecLabel('hevc')).toBe('H.265 / HEVC')
    expect(codecLabel('aac')).toBe('AAC')
  })
})
