import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import {
  coalescePages,
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

// The TMDB methods are arrow properties, so stub the shared get instead.
const externalApiGetMock = mock.method(
  ExternalAPI.prototype as unknown as {
    get: (endpoint: string, ...rest: unknown[]) => Promise<unknown>;
  },
  'get',
  async (endpoint: string) => {
    const [, type, id] =
      endpoint.match(
        /^\/(movie|tv)\/(\d+)\/(?:release_dates|content_ratings)$/
      ) ?? [];
    const cert = type === 'movie' ? movieCerts[Number(id)] : undefined;
    const rating = type === 'tv' ? tvRatings[Number(id)] : undefined;

    if (cert === undefined && rating === undefined) {
      throw new Error(`Unstubbed external endpoint: ${endpoint}`);
    }

    return type === 'movie'
      ? {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [{ certification: cert, type: 3 }],
            },
          ],
        }
      : { results: [{ iso_3166_1: 'US', rating }] };
  }
).mock;

beforeEach(() => {
  externalApiGetMock.resetCalls();
});

describe('getMovieCertification', () => {
  const movie = (iso_3166_1: string, ...certifications: string[]) => ({
    release_dates: {
      results: [
        {
          iso_3166_1,
          rating: '',
          release_dates: certifications.map((certification) => ({
            certification,
            release_date: '',
            type: 3,
          })),
        },
      ],
    },
  });

  it('returns a single US certification', () => {
    assert.equal(getMovieCertification(movie('US', 'PG-13')), 'PG-13');
  });

  it('picks the most restrictive of multiple US certifications', () => {
    assert.equal(getMovieCertification(movie('US', 'PG-13', 'R')), 'R');
  });

  it('ignores an unrated release when a real certification also exists', () => {
    assert.equal(getMovieCertification(movie('US', 'NR', 'PG')), 'PG');
  });

  it('returns undefined when there is no US entry', () => {
    assert.equal(getMovieCertification(movie('GB', '15')), undefined);
  });
});

describe('getTvCertification', () => {
  const show = (...entries: [string, string][]) => ({
    content_ratings: {
      results: entries.map(([iso_3166_1, rating]) => ({ iso_3166_1, rating })),
    },
  });

  it('returns the US content rating', () => {
    assert.equal(getTvCertification(show(['US', 'TV-14'])), 'TV-14');
  });

  it('picks the most restrictive of multiple US entries', () => {
    assert.equal(
      getTvCertification(show(['US', 'TV-Y7'], ['US', 'TV-14'])),
      'TV-14'
    );
  });

  it('ignores an unrated entry when a real rating also exists', () => {
    assert.equal(
      getTvCertification(show(['US', 'NR'], ['US', 'TV-PG'])),
      'TV-PG'
    );
  });

  it('returns undefined for an unrated US entry', () => {
    assert.equal(getTvCertification(show(['US', 'NR'])), undefined);
  });

  it('returns undefined when there is no US entry', () => {
    assert.equal(getTvCertification(show(['GB', '12'])), undefined);
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

  it('looks up only release dates in the ratings cache, kept to the US', async () => {
    await filterMoviesByRating([{ id: 2 }], { maxMovieRating: 'R' });

    const [endpoint, , , options] = externalApiGetMock.calls[0].arguments as [
      string,
      unknown,
      number,
      {
        cache: unknown;
        transform: (data: { results: { iso_3166_1: string }[] }) => unknown;
      },
    ];
    assert.equal(endpoint, '/movie/2/release_dates');
    assert.equal(options.cache, cacheManager.getCache('tmdbratings').data);
    assert.deepEqual(
      options.transform({
        results: [{ iso_3166_1: 'GB' }, { iso_3166_1: 'US' }],
      }),
      { results: [{ iso_3166_1: 'US' }] }
    );
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
    const pageOne = await coalescePages(1, upstream(10), noFilter);
    assert.equal(pageOne.results.length, 40);
    assert.equal(pageOne.results[0], 0);
    assert.equal(pageOne.results[39], 39);
    assert.equal(pageOne.total_pages, 5);

    const pageTwo = await coalescePages(2, upstream(10), noFilter);
    assert.equal(pageTwo.results[0], 40);
    assert.equal(pageTwo.results[39], 79);
  });

  it('does not overlap between consecutive client pages', async () => {
    const a = await coalescePages(1, upstream(10), noFilter);
    const b = await coalescePages(2, upstream(10), noFilter);
    const seen = new Set(a.results);
    assert.equal(
      b.results.some((r) => seen.has(r)),
      false
    );
  });

  it('stops at the upstream last page instead of over-fetching', async () => {
    const last = await coalescePages(2, upstream(3), noFilter);
    assert.equal(last.results.length, 20);
    assert.equal(last.total_pages, 2);
  });

  it('applies the filter to the combined window', async () => {
    const evens = (r: number[]) =>
      Promise.resolve(r.filter((n) => n % 2 === 0));
    const page = await coalescePages(1, upstream(10), evens);
    assert.equal(page.results.length, 20);
    assert.equal(
      page.results.every((n) => n % 2 === 0),
      true
    );
  });
});
