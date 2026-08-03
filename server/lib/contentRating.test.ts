import {
  getMovieCertification,
  getTvCertification,
} from '@server/lib/contentRating';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('getMovieCertification', () => {
  it('returns a single US certification', () => {
    assert.equal(
      getMovieCertification({
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              rating: '',
              release_dates: [
                { certification: 'PG-13', release_date: '', type: 3 },
              ],
            },
          ],
        },
      }),
      'PG-13'
    );
  });

  it('picks the most restrictive of multiple US certifications', () => {
    assert.equal(
      getMovieCertification({
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              rating: '',
              release_dates: [
                { certification: 'PG-13', release_date: '', type: 3 },
                { certification: 'R', release_date: '', type: 4 },
              ],
            },
          ],
        },
      }),
      'R'
    );
  });

  it('ignores an unrated release when a real certification also exists', () => {
    assert.equal(
      getMovieCertification({
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              rating: '',
              release_dates: [
                { certification: 'NR', release_date: '', type: 5 },
                { certification: 'PG', release_date: '', type: 3 },
              ],
            },
          ],
        },
      }),
      'PG'
    );
  });

  it('returns undefined when there is no US entry', () => {
    assert.equal(
      getMovieCertification({
        release_dates: {
          results: [
            {
              iso_3166_1: 'GB',
              rating: '',
              release_dates: [
                { certification: '15', release_date: '', type: 3 },
              ],
            },
          ],
        },
      }),
      undefined
    );
  });
});

describe('getTvCertification', () => {
  it('returns the US content rating', () => {
    assert.equal(
      getTvCertification({
        content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-14' }] },
      }),
      'TV-14'
    );
  });

  it('picks the most restrictive of multiple US entries', () => {
    assert.equal(
      getTvCertification({
        content_ratings: {
          results: [
            { iso_3166_1: 'US', rating: 'TV-Y7' },
            { iso_3166_1: 'US', rating: 'TV-14' },
          ],
        },
      }),
      'TV-14'
    );
  });

  it('ignores an unrated entry when a real rating also exists', () => {
    assert.equal(
      getTvCertification({
        content_ratings: {
          results: [
            { iso_3166_1: 'US', rating: 'NR' },
            { iso_3166_1: 'US', rating: 'TV-PG' },
          ],
        },
      }),
      'TV-PG'
    );
  });

  it('returns undefined for an unrated US entry', () => {
    assert.equal(
      getTvCertification({
        content_ratings: { results: [{ iso_3166_1: 'US', rating: 'NR' }] },
      }),
      undefined
    );
  });

  it('returns undefined when there is no US entry', () => {
    assert.equal(
      getTvCertification({
        content_ratings: { results: [{ iso_3166_1: 'GB', rating: '12' }] },
      }),
      undefined
    );
  });
});

describe('coalescePages', () => {
  const upstream = (totalPages: number) => (page: number) =>
    Promise.resolve({
      page,
      total_pages: totalPages,
      total_results: totalPages * 20,
      results: Array.from({ length: 20 }, (_, i) => (page - 1) * 20 + i),
    });
  const noFilter = (r: number[]) => Promise.resolve(r);

  it('combines a fixed window of upstream pages per client page', async () => {
    const { coalescePages } = await import('@server/lib/contentRating');
    const pageOne = await coalescePages(1, upstream(10), noFilter);
    assert.equal(pageOne.results.length, 40);
    assert.equal(pageOne.results[0], 0);
    assert.equal(pageOne.results[39], 39);
    assert.equal(pageOne.totalPages, 5);

    const pageTwo = await coalescePages(2, upstream(10), noFilter);
    assert.equal(pageTwo.results[0], 40);
    assert.equal(pageTwo.results[39], 79);
  });

  it('does not overlap between consecutive client pages', async () => {
    const { coalescePages } = await import('@server/lib/contentRating');
    const a = await coalescePages(1, upstream(10), noFilter);
    const b = await coalescePages(2, upstream(10), noFilter);
    const seen = new Set(a.results);
    assert.equal(b.results.some((r) => seen.has(r)), false);
  });

  it('stops at the upstream last page instead of over-fetching', async () => {
    const { coalescePages } = await import('@server/lib/contentRating');
    const last = await coalescePages(2, upstream(3), noFilter);
    assert.equal(last.results.length, 20);
    assert.equal(last.totalPages, 2);
  });

  it('applies the filter to the combined window', async () => {
    const { coalescePages } = await import('@server/lib/contentRating');
    const evens = (r: number[]) => Promise.resolve(r.filter((n) => n % 2 === 0));
    const page = await coalescePages(1, upstream(10), evens);
    assert.equal(page.results.length, 20);
    assert.equal(page.results.every((n) => n % 2 === 0), true);
  });
});
