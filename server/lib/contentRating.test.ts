import ExternalAPI from '@server/api/externalapi';
import {
  filterMixedResults,
  filterMoviesByRating,
  filterTvByRating,
  getMovieCertification,
  getTvCertification,
} from '@server/lib/contentRating';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

// Certification per TMDB id; a missing id makes the lookup reject.
const movieCerts: Record<number, string> = {
  1: 'G',
  2: 'PG-13',
  3: 'R',
};
const tvRatings: Record<number, string> = {
  10: 'TV-Y',
  11: 'TV-14',
  12: 'TV-MA',
  13: '',
};

// get is a prototype method unlike getMovie, and replaces the cache lookup too
const externalApiGetMock = mock.method(
  ExternalAPI.prototype as unknown as {
    get: (endpoint: string) => Promise<unknown>;
  },
  'get',
  async (endpoint: string) => {
    const [, type, id] = endpoint.match(/^\/(movie|tv)\/(\d+)$/) ?? [];
    const cert = type === 'movie' ? movieCerts[Number(id)] : undefined;
    const rating = type === 'tv' ? tvRatings[Number(id)] : undefined;

    if (cert === undefined && rating === undefined) {
      throw new Error(`Unstubbed external endpoint: ${endpoint}`);
    }

    return {
      id: Number(id),
      // Skips the localized trailer fallback call
      videos: { results: [{ type: 'Trailer', key: 'trailer' }] },
      release_dates: {
        results: [
          {
            iso_3166_1: 'US',
            release_dates: [{ certification: cert, type: 3 }],
          },
        ],
      },
      content_ratings: {
        results: [{ iso_3166_1: 'US', rating }],
      },
    };
  }
).mock;

beforeEach(() => {
  externalApiGetMock.resetCalls();
});

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

describe('filterMoviesByRating', () => {
  const movies = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('returns the list untouched without limits and looks nothing up', async () => {
    const result = await filterMoviesByRating(movies, undefined);
    assert.deepEqual(result, movies);
    assert.equal(externalApiGetMock.callCount(), 0);
  });

  it('drops titles above the cap and keeps the rest in order', async () => {
    const result = await filterMoviesByRating(movies, {
      maxMovieRating: 'PG-13',
    });
    assert.deepEqual(result, [{ id: 1 }, { id: 2 }]);
    assert.equal(externalApiGetMock.callCount(), 3);
  });

  it('drops a title whose certification lookup fails', async () => {
    const result = await filterMoviesByRating([{ id: 1 }, { id: 999 }], {
      maxMovieRating: 'R',
    });
    assert.deepEqual(result, [{ id: 1 }]);
  });
});

describe('filterTvByRating', () => {
  it('keeps an unrated show unless blockUnrated is set', async () => {
    const shows = [{ id: 11 }, { id: 13 }];
    assert.deepEqual(await filterTvByRating(shows, { maxTvRating: 'TV-14' }), [
      { id: 11 },
      { id: 13 },
    ]);
    assert.deepEqual(
      await filterTvByRating(shows, {
        maxTvRating: 'TV-14',
        blockUnrated: true,
      }),
      [{ id: 11 }]
    );
  });
});

describe('filterMixedResults', () => {
  it('applies each hierarchy by media type and passes people through', async () => {
    const items = [
      { id: 3, media_type: 'movie' },
      { id: 2, media_type: 'movie' },
      { id: 12, media_type: 'tv' },
      { id: 10, media_type: 'tv' },
      { id: 500, media_type: 'person' },
    ];
    const result = await filterMixedResults(items, {
      maxMovieRating: 'PG-13',
      maxTvRating: 'TV-PG',
    });
    assert.deepEqual(result, [
      { id: 2, media_type: 'movie' },
      { id: 10, media_type: 'tv' },
      { id: 500, media_type: 'person' },
    ]);
  });

  it('reads mediaType as well as media_type', async () => {
    const result = await filterMixedResults(
      [
        { id: 1, mediaType: 'movie' },
        { id: 12, mediaType: 'tv' },
      ],
      { maxTvRating: 'TV-14' }
    );
    assert.deepEqual(result, [{ id: 1, mediaType: 'movie' }]);
  });
});
