import { describe, expect, it } from 'vitest';
import { MAX_FRAMES } from '../../media/signals';
import { MIN_MEASURED, recordCost, secondsFor, SEED_COSTS, unitCosts, unitsFor } from './estimate';

describe('unitsFor', () => {
  it('guesses chunks of text from size', () => {
    expect(unitsFor('/a/notes.md', 100)).toEqual({ text: 1, image: 0, frame: 0, audio: 0 });
    expect(unitsFor('/a/long.txt', 18_000)).toEqual({ text: 10, image: 0, frame: 0, audio: 0 });
    // Capped like extraction (1M chars).
    expect(unitsFor('/a/huge.log.txt', 50_000_000).text).toBe(Math.ceil(1_000_000 / 1800));
  });

  it('counts a PDF’s text from its pages, guessing from size only when the count is unknown', () => {
    expect(unitsFor('/a/book.pdf', 700_000, 200).text).toBe(240);
    expect(unitsFor('/a/scan.pdf', 50_000_000, 10).text).toBe(12);
    expect(unitsFor('/a/broken.pdf', 1000, null).text).toBe(1); // unreadable: name only
    expect(unitsFor('/a/book.pdf', 5_000_000).text).toBe(120);
    expect(unitsFor('/a/r.docx', 60_000).text).toBe(10);
  });

  it('counts a picture, and nothing for keyword-only data', () => {
    expect(unitsFor('/a/cat.jpg', 3_000_000)).toEqual({ text: 0, image: 1, frame: 0, audio: 0 });
    expect(unitsFor('/a/orders.csv', 3_000_000)).toEqual({ text: 0, image: 0, frame: 0, audio: 0 });
  });

  it('guesses frames and sound windows from a media file’s size', () => {
    // ~60 s of 128 kbit/s audio.
    expect(unitsFor('/a/talk.mp3', 960_000)).toEqual({ text: 0, image: 0, frame: 0, audio: 3 });
    // ~60 s of 5 Mbit/s video: a frame per 3 s, and sound.
    expect(unitsFor('/a/clip.mp4', 37_500_000)).toEqual({ text: 0, image: 0, frame: 20, audio: 3 });
    expect(unitsFor('/a/film.mov', 10_000_000_000).frame).toBe(MAX_FRAMES);
  });
});

describe('unitCosts / recordCost', () => {
  it('uses the seed costs before anything is measured', () => {
    expect(unitCosts()).toEqual(SEED_COSTS);
  });

  it('trusts a kind’s own average once it has enough units, and scales the rest by it', () => {
    // Text measured twice as slow as the seed: unmeasured kinds are scaled ×2.
    const measured = { text: { seconds: SEED_COSTS.text * 2 * MIN_MEASURED.text, units: MIN_MEASURED.text } };
    const costs = unitCosts(measured);
    expect(costs.text).toBeCloseTo(SEED_COSTS.text * 2, 6);
    expect(costs.image).toBeCloseTo(SEED_COSTS.image * 2, 6);
    // Too few units of a kind: not trusted yet.
    expect(unitCosts({ audio: { seconds: 100, units: 1 } })).toEqual(SEED_COSTS);
  });

  it('accumulates, halving old sums past ten times what is enough', () => {
    let m = recordCost({}, 'image', 9, 10);
    m = recordCost(m, 'image', 9, 10);
    expect(m.image).toEqual({ seconds: 18, units: 20 });
    m = recordCost(m, 'image', 200, 190);
    expect(m.image).toEqual({ seconds: 109, units: 105 });
  });

  it('turns units into seconds', () => {
    expect(secondsFor({ text: 10, image: 2, frame: 0, audio: 1 }, SEED_COSTS)).toBeCloseTo(1.5 + 1.8 + 0.8, 6);
  });
});
