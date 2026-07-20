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
